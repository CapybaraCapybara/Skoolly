import json
import socket
import urllib.request
import urllib.error
import uuid
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Dict, Any, Optional

app = FastAPI(title="Saga Orchestrator Service", description="Orchestrates distributed school scraping transactions with rollbacks")

class SagaRequest(BaseModel):
    school_id: str   # schools.school_id (uuid) or the OPEC school code: whose draft save_service saves
    school_name: str
    homepage_url: str
    run_id: Optional[str] = None   # one batch run (school_scrape_log.run_id)
    shared_site: bool = False      # the website is shared with another school: the scraper looks for this campus's page

# Seconds. A scrape loads pages with Playwright and may wait out several Gemini rate-limit
# back-offs; validation and saving are quick. The caller (school_service.py)
# waits a little longer than the whole saga, so they never give up on a school that is still being saved.
SCRAPE_TIMEOUT_S = 600  # scraper may retry Playwright once with doubled timeouts
STEP_TIMEOUT_S = 60

def _timed_out(e: Exception) -> bool:
    return isinstance(e, (socket.timeout, TimeoutError)) or isinstance(getattr(e, "reason", None), (socket.timeout, TimeoutError))

def post_json(url: str, data: Dict[str, Any], timeout: float = STEP_TIMEOUT_S):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
        except Exception:
            err_body = {"error": e.reason}
        return e.code, {"status": "failed", "error": err_body}
    except Exception as e:
        # 504: the service took longer than `timeout` (school_scrape_log status 'timeout')
        return (504 if _timed_out(e) else 500), {"status": "failed", "error": str(e)}

@app.post("/saga/scrape-school")
def orchestrate_scrape_school(req: SagaRequest):
    saga_steps = []
    # Ties the draft save_service saves to this saga, so its compensation deletes only that draft
    saga_id = str(uuid.uuid4())

    def log_step(step_name: str, status: str, details: Any = None):
        saga_steps.append({
            "step": step_name,
            "status": status,
            "details": details or {}
        })
        print(f"[Saga Step] {step_name} -> {status}")

    def compensate(step_name: str, url: str):
        log_step(step_name, "started")
        code, resp = post_json(url, {"saga_id": saga_id})
        log_step(step_name, "completed" if code == 200 else "failed", resp)

    # ----------------------------------------------------
    # STEP 1: SCRAPE
    # ----------------------------------------------------
    log_step("SCRAPER_EXECUTE", "started", {"school_name": req.school_name})
    code, scraper_resp = post_json("http://127.0.0.1:8001/scrape", {
        "school_name": req.school_name,
        "homepage_url": req.homepage_url,
        "shared_site": req.shared_site
    }, timeout=SCRAPE_TIMEOUT_S)

    # robots.txt does not allow the site: nothing was scraped, so nothing to validate, save or undo
    if code == 200 and scraper_resp.get("status") == "blocked":
        log_step("SCRAPER_EXECUTE", "skipped", {"error": scraper_resp.get("error")})
        return {
            "status": "saga_skipped",
            "skipped_at": "scraper",
            "reason": "blocked",
            "steps": saga_steps,
            "error": scraper_resp.get("error") or "robots.txt disallow"
        }

    # Only "success" carries a result: anything else must not reach the validator as an empty one
    if code != 200 or scraper_resp.get("status") != "success" or not scraper_resp.get("result_data"):
        log_step("SCRAPER_EXECUTE", "failed", scraper_resp)

        # Compensating Scraper action (cleanup browser context)
        compensate("SCRAPER_COMPENSATE", "http://127.0.0.1:8001/compensate")

        return {
            "status": "saga_failed",
            "failed_at": "scraper",
            "timed_out": code == 504,
            "steps": saga_steps,
            "error": scraper_resp.get("error") or scraper_resp.get("detail") or "Scraper service returned failure"
        }

    scraped_result = scraper_resp["result_data"]
    log_step("SCRAPER_EXECUTE", "completed", {"elapsed_sec": scraped_result.get("elapsed_sec")})

    # ----------------------------------------------------
    # STEP 2: VALIDATE
    # ----------------------------------------------------
    log_step("VALIDATOR_EXECUTE", "started")
    code, val_resp = post_json("http://127.0.0.1:8002/validate", {
        "school_name": req.school_name,
        "result_data": scraped_result
    })

    if code != 200 or val_resp.get("status") == "failed":
        log_step("VALIDATOR_EXECUTE", "failed", val_resp)

        # Compensate: Rollback Scraper
        compensate("SCRAPER_COMPENSATE", "http://127.0.0.1:8001/compensate")

        return {
            "status": "saga_failed",
            "failed_at": "validation",
            "steps": saga_steps,
            "errors": val_resp.get("errors") or [str(val_resp.get("error") or "Validation failed")]
        }

    log_step("VALIDATOR_EXECUTE", "completed", val_resp)

    # ----------------------------------------------------
    # STEP 3: SAVE TO DATABASE (a draft version awaiting admin review)
    # ----------------------------------------------------
    log_step("DB_EXECUTE", "started")
    code, db_resp = post_json("http://127.0.0.1:8003/save", {
        "saga_id": saga_id,
        "school_id": req.school_id,
        "run_id": req.run_id,
        "result_data": scraped_result,
    })

    if code != 200 or db_resp.get("status") == "failed":
        log_step("DB_EXECUTE", "failed", db_resp)

        # Compensate: delete the draft if it was saved after all (e.g. the reply timed out), then the scraper
        compensate("DB_COMPENSATE", "http://127.0.0.1:8003/compensate")
        compensate("SCRAPER_COMPENSATE", "http://127.0.0.1:8001/compensate")

        return {
            "status": "saga_failed",
            "failed_at": "database",
            "steps": saga_steps,
            "error": db_resp.get("error") or db_resp.get("detail") or "DB service failed to save"
        }

    log_step("DB_EXECUTE", "completed", db_resp)

    return {
        "status": "saga_success",
        "message": "Saga transaction successfully committed.",
        "steps": saga_steps,
        "saved": db_resp,
        "result": scraped_result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
