import os
import sys
import threading
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

# The pipeline modules import each other by bare name, so their folder goes on the path (as in school_service.py)
PIPELINE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline")
if PIPELINE_DIR not in sys.path:
    sys.path.insert(0, PIPELINE_DIR)

from supabase_sync import db_connect, save_scraped_draft_version  # noqa: E402  # type: ignore

app = FastAPI(title="Save Service", description="Saves a Saga scrape result as a draft version awaiting admin review, with rollbacks")

# A compensation must not run in the middle of a save of the same saga
_lock = threading.Lock()


class SavePayload(BaseModel):
    saga_id: str      # the orchestrator's id for this saga; the compensation finds the draft by it
    school_id: str    # schools.school_id (uuid) or the OPEC school code
    run_id: Optional[str] = None
    result_data: Dict[str, Any]


class CompensatePayload(BaseModel):
    saga_id: str


@app.post("/save")
def save_data(payload: SavePayload):
    """Saves the result as a pending_review version with its fees, extra fees and safety rows, and one
    school_scrape_log row, in one transaction (save_scraped_draft_version). correlation_id = saga_id."""
    result = dict(payload.result_data, correlation_id=payload.saga_id)
    if payload.run_id:
        result["run_id"] = payload.run_id
    with _lock:
        try:
            draft = save_scraped_draft_version(payload.school_id, result)
        except Exception as e:
            # Nothing was committed: save_scraped_draft_version is one transaction
            raise HTTPException(status_code=500, detail=f"บันทึกแบบร่างลงฐานไม่สำเร็จ: {e}")
    return {"status": "success", "version_id": draft["version_id"], "version_number": draft["version_number"],
            "unchanged": draft["status"] == "unchanged"}   # same data as before: no new draft


@app.post("/compensate")
def compensate_save(payload: CompensatePayload):
    """
    Saga Compensating Transaction: deletes what /save wrote for this saga, if it got that far (the
    orchestrator compensates when it got no answer, which can come after the commit). Only a draft still
    awaiting review: one an admin has already approved or rejected stays.
    Its fees, extra fees and safety rows go with it (on delete cascade).
    """
    with _lock:
        try:
            with db_connect() as conn:
                deleted = conn.execute("""
                    DELETE FROM school_data.school_versions
                    WHERE status = 'pending_review'
                      AND version_id IN (SELECT version_id FROM school_data.school_scrape_log
                                         WHERE correlation_id = %s::uuid AND version_id IS NOT NULL)
                    RETURNING version_id::text
                """, (payload.saga_id,)).fetchall()
                if deleted:
                    conn.execute("DELETE FROM school_data.school_scrape_log WHERE correlation_id = %s::uuid",
                                 (payload.saga_id,))
                conn.commit()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Compensating transaction failed: {e}")
    if deleted:
        return {"status": "compensated", "deleted_version_ids": [r[0] for r in deleted]}
    return {"status": "no_action", "message": "No draft from this saga to delete."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003)
