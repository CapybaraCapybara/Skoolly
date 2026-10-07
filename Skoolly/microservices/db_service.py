import os
import json
import shutil
import threading
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(title="Database Service", description="Handles results and log persistence with rollbacks")

# Paths to the JSON files in the parent directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_PATH = os.path.join(BASE_DIR, "results.json")
LOG_PATH = os.path.join(BASE_DIR, "scrape_log.json")

# Backup paths for Saga compensation
RESULTS_BAK_PATH = RESULTS_PATH + ".bak"
LOG_BAK_PATH = LOG_PATH + ".bak"

# The batch runner saves several schools at once. Each save reads, edits and rewrites both
# files, so two at the same time would lose one school's result: one save at a time.
_lock = threading.Lock()

class SavePayload(BaseModel):
    school_name: str
    homepage_url: str
    result_data: Dict[str, Any]
    logs: List[Dict[str, Any]]


def _read_list(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def _drop_backups():
    for path in (RESULTS_BAK_PATH, LOG_BAK_PATH):
        if os.path.exists(path):
            os.remove(path)


def _restore_backups():
    """Puts back the files as they were before the save in progress. True if there was one."""
    rollback_performed = False
    if os.path.exists(RESULTS_BAK_PATH):
        shutil.copy2(RESULTS_BAK_PATH, RESULTS_PATH)
        os.remove(RESULTS_BAK_PATH)
        rollback_performed = True
    if os.path.exists(LOG_BAK_PATH):
        shutil.copy2(LOG_BAK_PATH, LOG_PATH)
        os.remove(LOG_BAK_PATH)
        rollback_performed = True
    return rollback_performed


@app.post("/save")
def save_data(payload: SavePayload):
    with _lock:
        try:
            # 1. Create backups before doing any write operations (Saga preparation)
            if os.path.exists(RESULTS_PATH):
                shutil.copy2(RESULTS_PATH, RESULTS_BAK_PATH)
            else:
                # If file doesn't exist, create an empty backup indicator
                with open(RESULTS_BAK_PATH, "w") as f:
                    f.write("[]")

            if os.path.exists(LOG_PATH):
                shutil.copy2(LOG_PATH, LOG_BAK_PATH)
            else:
                with open(LOG_BAK_PATH, "w") as f:
                    f.write("[]")

            # 2. Update results.json
            results = _read_list(RESULTS_PATH)

            # Remove existing record of the same school if present
            results = [r for r in results if r.get("school_name", "").lower() != payload.school_name.lower()]
            results.append(payload.result_data)

            with open(RESULTS_PATH, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)

            # 3. Update scrape_log.json
            existing_logs = _read_list(LOG_PATH)
            existing_logs.extend(payload.logs)

            with open(LOG_PATH, "w", encoding="utf-8") as f:
                json.dump(existing_logs, f, ensure_ascii=False, indent=2)

            # Committed. The backups only guard a save in progress; left behind, a later
            # /compensate would roll back this school's result as well.
            _drop_backups()
            return {"status": "success", "message": "Results and logs saved successfully"}

        except Exception as e:
            # If writing fails, perform local immediate rollback
            _restore_backups()
            raise HTTPException(status_code=500, detail=f"Database service write failed: {str(e)}")

@app.post("/compensate")
def compensate_save():
    """
    Saga Compensating Transaction:
    Restores the backup copies of results.json and scrape_log.json to rollback changes.
    """
    with _lock:
        try:
            if _restore_backups():
                return {"status": "compensated", "message": "Database successfully rolled back using backups."}
            return {"status": "no_action", "message": "No backups found to compensate."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Compensating transaction failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003)
