import json
import urllib.request
import urllib.error
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(title="Saga Orchestrator Service", description="Orchestrates distributed school scraping transactions with rollbacks")

class SagaRequest(BaseModel):
    school_name: str
    homepage_url: str

def post_json(url: str, data: Dict[str, Any]):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=90000) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
        except Exception:
            err_body = {"error": e.reason}
        return e.code, {"status": "failed", "error": err_body}
    except Exception as e:
        return 500, {"status": "failed", "error": str(e)}

@app.post("/saga/scrape-school")
def orchestrate_scrape_school(req: SagaRequest):
    saga_steps = []
    
    def log_step(step_name: str, status: str, details: Any = None):
        saga_steps.append({
            "step": step_name,
            "status": status,
            "details": details or {}
        })
        print(f"[Saga Step] {step_name} -> {status}")

    # ----------------------------------------------------
    # STEP 1: SCRAPE
    # ----------------------------------------------------
    log_step("SCRAPER_EXECUTE", "started", {"school_name": req.school_name})
    code, scraper_resp = post_json("http://127.0.0.1:8001/scrape", {
        "school_name": req.school_name,
        "homepage_url": req.homepage_url
    })
    
    if code != 200 or scraper_resp.get("status") == "failed":
        log_step("SCRAPER_EXECUTE", "failed", scraper_resp)
        
        # Compensating Scraper action (cleanup browser context)
        log_step("SCRAPER_COMPENSATE", "started")
        post_json("http://127.0.0.1:8001/compensate", {})
        log_step("SCRAPER_COMPENSATE", "completed")
        
        return {
            "status": "saga_failed",
            "failed_at": "scraper",
            "steps": saga_steps,
            "error": scraper_resp.get("error") or "Scraper service returned failure"
        }
    
    scraped_result = scraper_resp.get("result_data", {})
    scraped_logs = scraper_resp.get("logs", [])
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
        log_step("SCRAPER_COMPENSATE", "started")
        post_json("http://127.0.0.1:8001/compensate", {})
        log_step("SCRAPER_COMPENSATE", "completed")
        
        return {
            "status": "saga_failed",
            "failed_at": "validation",
            "steps": saga_steps,
            "errors": val_resp.get("errors") or ["Validation failed"]
        }
        
    log_step("VALIDATOR_EXECUTE", "completed", val_resp)

    # ----------------------------------------------------
    # STEP 3: SAVE TO DATABASE (PERSISTENCE)
    # ----------------------------------------------------
    log_step("DB_EXECUTE", "started")
    code, db_resp = post_json("http://127.0.0.1:8003/save", {
        "school_name": req.school_name,
        "homepage_url": req.homepage_url,
        "result_data": scraped_result,
        "logs": scraped_logs
    })
    
    if code != 200 or db_resp.get("status") == "failed":
        log_step("DB_EXECUTE", "failed", db_resp)
        
        # Compensate: Rollback DB write AND Scraper resources
        log_step("DB_COMPENSATE", "started")
        post_json("http://127.0.0.1:8003/compensate", {})
        log_step("DB_COMPENSATE", "completed")
        
        log_step("SCRAPER_COMPENSATE", "started")
        post_json("http://127.0.0.1:8001/compensate", {})
        log_step("SCRAPER_COMPENSATE", "completed")
        
        return {
            "status": "saga_failed",
            "failed_at": "database",
            "steps": saga_steps,
            "error": db_resp.get("error") or "DB service failed to save"
        }
        
    log_step("DB_EXECUTE", "completed", db_resp)
    
    return {
        "status": "saga_success",
        "message": "Saga transaction successfully committed.",
        "steps": saga_steps,
        "result": scraped_result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
