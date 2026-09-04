import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import re
import requests
import urllib.parse
from bs4 import BeautifulSoup
from enrich_school_data import is_garbled_name, extract_english_name_from_web, clean_school_en_name

with open("data/international_schools_thailand_opec.json", "r", encoding="utf-8") as f:
    schools = json.load(f)

print(f"Total schools in DB: {len(schools)}")

# Find all schools in OPEC that were filled via reference or had no EN name originally
target_codes = [
    "10100223", "10100412", "10100424", "12120063", "12120078", 
    "20200008", "20200062", "20200069", "20200075", "50500096", 
    "50500109", "50500115", "50500122", "81810006", "83830029", "90900030"
]

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

def search_arcgis_poi_en(name_th, province=""):
    """Check if ArcGIS POI has the English name registered"""
    url = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(name_th + ' ' + province)}&f=json&maxLocations=5"
    try:
        r = session.get(url, timeout=4.0)
        if r.status_code == 200:
            cands = r.json().get("candidates", [])
            for c in cands:
                addr = c.get("address", "")
                en_parts = re.findall(r'([A-Za-z\s\.\,\'\-–]{4,}(?:International School|International Kindergarten|International Preschool|International Academy|International College|School|Preschool|Kindergarten|Academy|College))', addr, re.IGNORECASE)
                if en_parts:
                    cand = en_parts[0].strip()
                    if not is_garbled_name(cand):
                        return clean_school_en_name(cand)
    except Exception as e:
        pass
    return None

def transliterate_thai_school_to_en(th_name):
    """
    Intelligent morphological translation/transliteration of standard Thai International School names
    e.g. นานาชาติสิงคโปร์สุวรรณภูมิ -> Singapore Suvarnabhumi International School
    """
    # Dictionary of standard school tokens
    TRANS_MAP = [
        (r'^(?:โรงเรียน)?นานาชาติ\s*', ''),
        (r'^(?:โรงเรียน)?อนุบาลนานาชาติ\s*', 'Kindergarten '),
        (r'^(?:โรงเรียน)?ประถมนานาชาติ\s*', 'Primary '),
    ]
    # Check key words
    WORD_MAP = {
        'สิงคโปร์': 'Singapore',
        'สุวรรณภูมิ': 'Suvarnabhumi',
        'กรุงเทพ': 'Bangkok',
        'กรุงเทพฯ': 'Bangkok',
        'พัทยา': 'Pattaya',
        'เชียงใหม่': 'Chiang Mai',
        'ภูเก็ต': 'Phuket',
        'ระยอง': 'Rayong',
        'นนทบุรี': 'Nonthaburi',
        'ชลบุรี': 'Chonburi',
        'อุดรธานี': 'Udon Thani',
        'ขอนแก่น': 'Khon Kaen',
        'หาดใหญ่': 'Hatyai',
        'เกาะสมุย': 'Koh Samui',
        'สมุย': 'Samui',
        'แม่สาย': 'Mae Sai',
        'แม่สอด': 'Mae Sot',
        'พระราม 5': 'Rama 5',
        'พระราม 3': 'Rama 3',
        'พระราม 9': 'Rama 9',
        'สุขุมวิท': 'Sukhumvit',
        'หลังสวน': 'Langsuan',
        'จีน': 'China',
        'ฝรั่งเศส': 'French',
        'บริติช': 'British',
        'อเมริกัน': 'American',
        'ออสเตรเลีย': 'Australian',
        'แคนาดา': 'Canadian',
        'คริสเตียน': 'Christian',
        'สาธิต': 'Demonstration',
        'แอดเวนตีส': 'Adventist',
        'แอ๊ดเวนติสมิชชัน': 'Adventist Mission',
        'มอนเตสซอรี': 'Montessori',
        'มอนเตสซอรี่': 'Montessori',
        'พรีสคูล': 'Preschool',
        'อะแคเดอมี่': 'Academy',
        'อะคาเดมี่': 'Academy',
        'คอลเลจ': 'College',
        'ธาราพัฒนา': 'Tara Pattana',
        'มูลตรีภักดี': 'Mooltripakdee',
        'บูรพาพัฒนศาสตร์': 'Burapha Phatthanasart',
        'ฮานาคริสเตียน': 'Hana Christian',
        'ปัญญาเด่น': 'Panyaden',
        'อเมริกาน่า ไชนีส': 'Americana Chinese',
        'แครนเบอร์รี่': 'Cranberry',
        'สานฝัน': 'Sanfan',
        'เฮดสตาร์ท': 'Headstart',
        'อเมริกัน เพรพ': 'American Prep',
        'แฮมพ์ตั้น': 'Hampton',
        'เด่นหล้า': 'Denla',
        'แอสเตอร์': 'Aster',
        'จอห์น ไวแอท': 'John Wyatt'
    }
    return ""

print("\n=== EVALUATING 16 TARGET SCHOOLS WITHOUT schoolAndURL.txt ===")
for s in schools:
    code = str(s.get("school_code", ""))
    if code in target_codes or not s.get("school_name_en"):
        th_name = s.get("school_name_th", "")
        prov = s.get("province", "")
        web = s.get("website", "")
        tags = str(s.get("tags") or "")
        history = str(s.get("school_history") or "")
        
        # 1. OPEC Tags / History Parentheses
        en_in_paren = re.findall(r'\(([A-Za-z0-9\s\.\,\'\-–]+(?:School|Kindergarten|Preschool|Academy|College|Prep|International)[A-Za-z0-9\s\.\,\'\-–]*)\)', history + " " + tags)
        from_opec = clean_school_en_name(en_in_paren[0].strip()) if en_in_paren else None
        
        # 2. From Web
        from_web = extract_english_name_from_web(web, th_name) if web else None
        
        # 3. From ArcGIS POI
        from_arcgis = search_arcgis_poi_en(th_name, prov)
        
        print(f"\n[Code: {code}] {th_name}")
        print(f"  - Official EN in DB: {s.get('school_name_en')}")
        print(f"  - From OPEC Tag/History: {from_opec}")
        print(f"  - From School Website ({web}): {from_web}")
        print(f"  - From ArcGIS POI: {from_arcgis}")
