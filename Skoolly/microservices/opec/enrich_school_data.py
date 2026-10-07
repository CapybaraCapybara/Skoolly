"""
enrich_school_data.py
ปุ่ม "เติมข้อมูล" รายโรงเรียนในหน้า admin: ชื่อภาษาอังกฤษ แล้วพิกัด GPS
(งานแบบทั้งชุดอยู่ใน opec_service.py ซึ่งเรียก enrich_school_names_en / enrich_school_gps ตรง ๆ)
"""

from enrich_school_names_en import enrich_single_school_name_en
from enrich_school_gps import enrich_single_school_gps


def enrich_single_school_data(school):
    """Enriches both English name and GPS coordinates for a single school"""
    changes = {}
    s1, c_en = enrich_single_school_name_en(school)
    changes.update(c_en)
    s2, c_gps = enrich_single_school_gps(s1)
    changes.update(c_gps)
    return s2, changes
