import os
import json
import shutil
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

app = FastAPI(title="Database Service", description="Handles results and log persistence with rollbacks")

# Paths to the JSON files in the parent directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_PATH = os.path.join(BASE_DIR, "results.json")
LOG_PATH = os.path.join(BASE_DIR, "scrape_log.json")

# Backup paths for Saga compensation
RESULTS_BAK_PATH = RESULTS_PATH + ".bak"
LOG_BAK_PATH = LOG_PATH + ".bak"

class SavePayload(BaseModel):
    school_name: str
    homepage_url: str
    result_data: Dict[str, Any]
    logs: List[Dict[str, Any]]

@app.post("/save")
def save_data(payload: SavePayload):
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
        results = []
        if os.path.exists(RESULTS_PATH):
            try:
                with open(RESULTS_PATH, "r", encoding="utf-8") as f:
                    results = json.load(f)
            except Exception:
                results = []

        # Remove existing record of the same school if present
        results = [r for r in results if r.get("school_name", "").lower() != payload.school_name.lower()]
        results.append(payload.result_data)

        with open(RESULTS_PATH, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

        # 3. Update scrape_log.json
        existing_logs = []
        if os.path.exists(LOG_PATH):
            try:
                with open(LOG_PATH, "r", encoding="utf-8") as f:
                    existing_logs = json.load(f)
            except Exception:
                existing_logs = []

        existing_logs.extend(payload.logs)

        with open(LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(existing_logs, f, ensure_ascii=False, indent=2)

        return {"status": "success", "message": "Results and logs saved successfully"}

    except Exception as e:
        # If writing fails, perform local immediate rollback
        compensate_save()
        raise HTTPException(status_code=500, detail=f"Database service write failed: {str(e)}")

@app.post("/compensate")
def compensate_save():
    """
    Saga Compensating Transaction:
    Restores the backup copies of results.json and scrape_log.json to rollback changes.
    """
    try:
        rollback_performed = False

        if os.path.exists(RESULTS_BAK_PATH):
            shutil.copy2(RESULTS_BAK_PATH, RESULTS_PATH)
            os.remove(RESULTS_BAK_PATH)
            rollback_performed = True
        
        if os.path.exists(LOG_BAK_PATH):
            shutil.copy2(LOG_BAK_PATH, LOG_PATH)
            os.remove(LOG_BAK_PATH)
            rollback_performed = True

        if rollback_performed:
            return {"status": "compensated", "message": "Database successfully rolled back using backups."}
        else:
            return {"status": "no_action", "message": "No backups found to compensate."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Compensating transaction failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003)
