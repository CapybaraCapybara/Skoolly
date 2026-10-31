"""Checks for how a school's curriculums are chosen. Run: python microservices/opec/test_curriculums.py"""

import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from supabase_sync import (  # noqa: E402
    choose_curriculums, curriculums_conflict, names_a_curriculum, opec_curriculum_codes, website_curriculum_codes,
)

# Thai language/culture subjects are taught everywhere by law: no THAI_MOE, and no SCHOOL_SPECIFIC either
assert opec_curriculum_codes(["หลักสูตรภาษาไทย วัฒนธรรมไทยและประวัติศาสตร์ไทย", "IGCSE"]) == ["BRITISH"]
assert opec_curriculum_codes(["วิชาภาษาไทย วัฒนธรรมไทย และประวัติศาสตร์ไทย"]) == ["SCHOOL_SPECIFIC"]
assert opec_curriculum_codes(["หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551"]) == ["THAI_MOE"]

# "High School Diploma" is a certificate name British and Singapore schools use too (Regent's, TRAILL, SISB)
assert opec_curriculum_codes(["หลักสูตร High School Diploma", "High school Diploma Curriculum"]) == ["SCHOOL_SPECIFIC"]
assert opec_curriculum_codes(["High School Diploma / อังกฤษ (สหราชอาณาจักร)"]) == ["BRITISH"]
assert opec_curriculum_codes(["หลักสูตรสหรัฐอเมริกัน", "California Department of Education CDE"]) == ["AMERICAN"]

# OPEC naming nothing usable
assert opec_curriculum_codes([]) == ["SCHOOL_SPECIFIC"]
assert opec_curriculum_codes(None) == ["SCHOOL_SPECIFIC"]
assert opec_curriculum_codes(["หลักสูตรนานาชาติ"]) == ["SCHOOL_SPECIFIC"]
unmapped = Counter()
assert opec_curriculum_codes(["Some Unknown Programme", "IB"], unmapped) == ["IB", "SCHOOL_SPECIFIC"]
assert unmapped == Counter({"Some Unknown Programme": 1})

# What the scraper read off a school's website
assert website_curriculum_codes({"curriculum": "Singapore, British, and IB"}) == ["BRITISH", "IB", "SINGAPOREAN"]
assert website_curriculum_codes({"curriculums": ["American"], "curriculum": "ignored when the list exists"}) == ["AMERICAN"]
assert website_curriculum_codes({"curriculums": ["MONTESSORI"]}) == ["MONTESSORI"]
assert website_curriculum_codes({"curriculum": "unclear"}) is None
assert website_curriculum_codes({}) is None

assert names_a_curriculum(["BRITISH", "SCHOOL_SPECIFIC"])
assert not names_a_curriculum(["SCHOOL_SPECIFIC"])
assert not names_a_curriculum(None)

# The rule: OPEC first, the website only when OPEC names nothing
assert choose_curriculums(["หลักสูตรสหรัฐอเมริกัน"], ["BRITISH"]) == ["AMERICAN"]
assert choose_curriculums(["หลักสูตรนานาชาติ"], ["AMERICAN"]) == ["AMERICAN"]
assert choose_curriculums([], None) == ["SCHOOL_SPECIFIC"]
assert choose_curriculums([], ["SCHOOL_SPECIFIC"]) == ["SCHOOL_SPECIFIC"]

# What an admin is asked to decide: nothing in common (Hampton), not a partial overlap (NIST)
assert curriculums_conflict(["AMERICAN"], ["BRITISH"])
assert not curriculums_conflict(["BRITISH", "IB"], ["IB"])
assert not curriculums_conflict(["SCHOOL_SPECIFIC"], ["BRITISH"])
assert not curriculums_conflict(["BRITISH"], None)
assert curriculums_conflict(["BRITISH", "SCHOOL_SPECIFIC"], ["CHINESE"])

print("curriculums: all checks passed")
