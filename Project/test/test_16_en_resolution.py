import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding='utf-8')

import json
from enrich_school_names_en import dynamic_resolve_school_en_name

target_codes = [
    "1110700081", # นานาชาติแอสเตอร์ กรุงเทพ
    "1111700007", # นานาชาติสิงคโปร์สุวรรณภูมิ
    "1112700001", # นานาชาติแฮมพ์ตั้น
    "1112700006", # นานาชาติเด่นหล้า บริติช
    "1119700003", # นานาชาติ จอห์น ไวแอท มอนเตสซอรี
    "1119700004", # นานาชาติแอ๊ดเวนติสมิชชัน
    "1120700001", # นานาชาติธาราพัฒนา
    "1120700005", # นานาชาติมูลตรีภักดี
    "1120700010", # นานาชาติบูรพาพัฒนศาสตร์
    "1150700009", # อนุบาลนานาชาติฮานาคริสเตียน
    "1150700013", # นานาชาติปัญญาเด่น
    "1150700016", # นานาชาติอเมริกาน่า ไชนีส
    "1152700002", # นานาชาติแครนเบอร์รี่
    "1154700001", # นานาชาติสานฝัน
    "1183700004", # นานาชาติ เฮดสตาร์ท
    "1190700001", # นานาชาติอเมริกัน เพรพ
]

with open("data/international_schools_thailand_opec.json", "r", encoding="utf-8") as f:
    schools = json.load(f)

school_map = {s["school_code"]: s for s in schools}

print("="*80)
print("TESTING 16 TARGET SCHOOLS EN RESOLUTION")
print("="*80)

for idx, code in enumerate(target_codes, 1):
    s = school_map.get(code)
    if not s:
        continue
    th = s.get("school_name_th")
    
    # Create a dummy copy with empty EN to force dynamic resolution
    s_copy = dict(s)
    s_copy["school_name_en"] = ""
    
    resolved = dynamic_resolve_school_en_name(s_copy)
    print(f"[{idx:02d}/16] {th} -> '{resolved}'")
