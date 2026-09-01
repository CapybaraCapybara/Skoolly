from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

app = FastAPI(title="Validation Service", description="Validates scraped school data schema and business rules")

class ValidationRequest(BaseModel):
    school_name: str
    result_data: Dict[str, Any]

@app.post("/validate")
def validate_data(req: ValidationRequest):
    errors = []
    data = req.result_data

    # Rule 1: Curriculum check
    curriculum = data.get("curriculum")
    if not curriculum:
        errors.append("Curriculum information is missing.")
    elif str(curriculum).strip().lower() in ["unclear", "none", "unknown"]:
        errors.append(f"Curriculum type is unclear or unknown ('{curriculum}').")

    # Rule 2: Tuition checks
    tuition_found = data.get("tuition_found", False)
    tuition_by_grade = data.get("tuition_by_grade", [])

    if tuition_found:
        if not tuition_by_grade:
            errors.append("Tuition was marked as found, but the grade breakdown table is empty.")
        else:
            for i, grade in enumerate(tuition_by_grade):
                grade_level = grade.get("grade_level")
                if not grade_level:
                    errors.append(f"Grade breakdown item at index {i} is missing 'grade_level'.")
                
                annual = grade.get("annual_thb")
                semester = grade.get("semester_thb")
                if annual is not None and annual < 0:
                    errors.append(f"Annual tuition for '{grade_level}' cannot be negative: {annual}")
                if semester is not None and semester < 0:
                    errors.append(f"Semester tuition for '{grade_level}' cannot be negative: {semester}")

        # Validate minimum and maximum bounds
        min_thb = data.get("tuition_min_thb")
        max_thb = data.get("tuition_max_thb")
        if min_thb is not None and min_thb < 0:
            errors.append(f"Minimum tuition cannot be negative: {min_thb}")
        if max_thb is not None and max_thb < 0:
            errors.append(f"Maximum tuition cannot be negative: {max_thb}")
    else:
        # If tuition is not found, we don't strictly fail the scrape, but we warn or flag it if needed.
        # But for this system, we permit it as long as the status is ok.
        pass

    # Rule 3: Hidden costs validation
    hidden_costs = data.get("hidden_costs", [])
    for i, cost in enumerate(hidden_costs):
        name = cost.get("name")
        amount = cost.get("amount_thb")
        if not name:
            errors.append(f"Hidden cost item at index {i} is missing a name.")
        if amount is not None and amount < 0:
            errors.append(f"Hidden cost amount for '{name}' cannot be negative: {amount}")

    # Rule 4: Confidence boundary check
    confidence = data.get("confidence")
    if confidence is not None:
        try:
            val = float(confidence)
            if not (0.0 <= val <= 1.0):
                errors.append(f"Confidence score must be between 0.0 and 1.0: {confidence}")
        except ValueError:
            errors.append(f"Confidence score must be a number: {confidence}")

    if errors:
        return {
            "status": "failed",
            "errors": errors
        }
    else:
        return {
            "status": "success",
            "message": "All validation rules passed."
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)
