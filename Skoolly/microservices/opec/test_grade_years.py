"""Checks for grade_years.py. Run: python microservices/opec/test_grade_years.py"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grade_years import grade_span, year_rows  # noqa: E402

SPANS = [
    # label, curriculums, (first, last) on the 0-16 scale
    ("Nursery", [], (1, 1)),
    ("Foundation Stage 2", [], (3, 3)),
    ("Year 1", ["BRITISH"], (4, 4)),
    ("Year 1", ["AUSTRALIAN"], (5, 5)),
    ("Year 7 - Year 9", ["BRITISH"], (10, 12)),
    ("Years 7 – 9", [], (10, 12)),
    ("Year 3 to 8 (Age 7-13)", [], (6, 11)),
    ("Year 2-3 (6-8 years)", [], (5, 6)),
    ("Key Stage 2 (Year 3 - 6)", [], (6, 9)),
    ("Key Stage Four", [], (13, 14)),
    ("Grade 10-12", [], (14, 16)),
    ("G1 - G4 (6-10 years old)", [], (5, 8)),
    ("Grades KG-5", [], (4, 9)),
    ("Kindergarten through 12th grade", [], (4, 16)),
    ("K1 (FS2)", [], (2, 2)),
    ("K1 - K3", [], (2, 4)),
    ("K3-K5 (Ages 3-6)", [], (2, 4)),
    ("Kindergarten (K1-K3)", [], (2, 4)),
    ("Kindergarten 2 & 3 (5 days per week, 7.45-14.15)", [], (3, 4)),
    ("Nursery (2-3 years) - 5 Days (8:30-2:00)", [], (1, 1)),
    ("Nursery - Reception (3 days, Full Day)", [], (1, 3)),
    ("Early Years (Pre-Nursery – Reception)", [], (0, 3)),
    ("Pre-K 2-4", [], (1, 3)),
    ("PreK3-Kindergarten", [], (2, 4)),
    ("Toddler Prep", [], (0, 0)),
    ("Year 12 / IB Diploma 1", [], (15, 15)),
    ("IB Diploma Studies", [], (15, 16)),
    ("Primary School (Ages 5-11)", [], (5, 10)),
    ("Middle School (Grades 6-8)", [], (10, 12)),
    ("Year 10 / Mathayom 3", [], (13, 13)),
    ("อนุบาล 1 (Nursery 1)", [], (2, 2)),
]

for label, curriculums, expected in SPANS:
    got = grade_span(label, curriculums)
    assert got and got[:2] == expected, f"{label!r}: expected {expected}, got {got}"

for label in ("All Grades", "Prep Center to", "First Steps & Explorers (5 Days/Week Full Day)"):
    assert grade_span(label) is None, label


def row(label, annual, pos):
    return {"grade_level": label, "annual_thb": annual, "page_pos": pos}


# Bangkok Patana as stored: rows arrive sorted by price, page order is the grade order
patana = [row("Year 11", 900, 9), row("Nursery", 300, 1), row("Foundation Stage 1", 400, 2),
          row("Year 1 - Year 2", 500, 4), row("Foundation Stage 2", 450, 3), row("Year 3", 550, 5)]
years = year_rows(patana, ["BRITISH"])
assert [y["order_start"] for y in years] == [1, 2, 3, 4, 5, 6, 14], years
assert [y["annual_thb"] for y in years] == [300, 400, 450, 500, 500, 550, 900]
assert [y["grade_level"] for y in years[3:5]] == ["Year 1", "Year 2"]
assert years[0]["display_name"] == "เตรียมอนุบาล (Nursery)"
assert years[5]["display_name"] == "ป.2 (Year 3)"

# Options for the same year count once, at the full-time price; a per-year row beats a stage row
options = [row("Nursery (3 half days)", 100, 1), row("Nursery (5 full days)", 200, 2),
           row("Early Years", 150, 3), row("Reception", 250, 4)]
years = year_rows(options)
assert [(y["order_start"], y["annual_thb"]) for y in years] == [(1, 200), (2, 150), (3, 250)], years

# A boarding fee is not a year of school
assert [y["grade_level"] for y in year_rows([row("Year 7", 1, 1), row("Boarding Service", 9, 2)])] == ["Year 7"]

# One label that can't be read: page order, rows untouched
mixed = [row("Year 2", 2, 2), row("All Grades", 9, 3), row("Year 1", 1, 1)]
assert [y["grade_level"] for y in year_rows(mixed)] == ["Year 1", "Year 2", "All Grades"]
assert "order_start" not in year_rows(mixed)[0]

print("grade_years: all checks passed")
