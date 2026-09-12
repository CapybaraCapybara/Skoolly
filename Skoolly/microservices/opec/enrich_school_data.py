"""
enrich_school_data.py
Facade module importing from separated dedicated modules:
- enrich_school_names_en.py
- enrich_school_gps.py
"""

from enrich_school_names_en import (
    enrich_all_school_names_en,
    enrich_single_school_name_en,
)

from enrich_school_gps import (
    enrich_all_school_gps,
    enrich_single_school_gps,
)


def enrich_single_school_data(school):
    """Enriches both English name and GPS coordinates for a single school"""
    changes = {}
    s1, c_en = enrich_single_school_name_en(school)
    changes.update(c_en)
    s2, c_gps = enrich_single_school_gps(s1)
    changes.update(c_gps)
    return s2, changes


def enrich_all_missing_school_data(update_progress, on_save_callback=None):
    """Enriches both EN names and GPS coordinates (backward compatibility)"""
    update_progress("กำลังประมวลผล Auto-Enrich ทั้งหมด...", 0, 100, "เริ่มต้นกระบวนการ...")
    schools = enrich_all_school_names_en(update_progress, on_save_callback=on_save_callback)
    schools = enrich_all_school_gps(update_progress, on_save_callback=on_save_callback)
    return schools
