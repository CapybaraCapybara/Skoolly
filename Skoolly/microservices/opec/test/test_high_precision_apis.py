import json
import urllib.parse
import requests
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "th-TH,th;q=0.9,en;q=0.8"
})

# Test a difficult school from user's list: "นานาชาติเรนทรี สุขุมวิท" / "Raintree International School"
# and "นานาชาติเด่นหล้า บริติช" / "DBS Denla British School"
# and "นานาชาติเคไอเอสเรนวูดปาร์ค" / "KIS International School Reignwood Park"
test_schools = [
    ("นานาชาติเรนทรี สุขุมวิท", "Raintree International School", "Bangkok"),
    ("นานาชาติเด่นหล้า บริติช", "DBS Denla British School", "Nonthaburi"),
    ("นานาชาติเคไอเอสเรนวูดปาร์ค", "KIS International School Reignwood Park", "Pathum Thani"),
    ("นานาชาติสิงคโปร์ระยอง", "Singapore International School Rayong", "Rayong"),
    ("นานาชาติเกนส์วิลล์ แม่สาย", "Gainesville International School Chiang Rai", "Chiang Rai"),
    ("นานาชาติวินฟิลด์", "Windfield International School", "Surat Thani"),
    ("เด่นหล้า พระราม 5", "Denla Rama 5", "Nonthaburi")
]

print("=== METHOD 1: Google Maps Direct Place Search ===")
for th, en, p in test_schools:
    q = f"{en or th} {p} Thailand"
    url = f"https://www.google.com/maps/search/{urllib.parse.quote(q)}"
    try:
        r = session.get(url, timeout=5)
        text = r.text
        
        # Look for coordinates in APP_INITIALIZATION_STATE or meta tags
        # Format 1: meta content="https://maps.google.com/maps/api/staticmap?center=13.7...%2C100.5...
        meta_m = re.search(r'staticmap\?center=([0-9\.\-]+)%2C([0-9\.\-]+)', text)
        if meta_m:
            print(f"  [G-Maps Meta] {en} -> {meta_m.group(1)}, {meta_m.group(2)}")
            continue
            
        # Format 2: /@13.7...,100.5...,
        at_m = re.search(r'/@([0-9]{1,2}\.[0-9]{5,8}),([0-9]{2,3}\.[0-9]{5,8})', text)
        if at_m:
            print(f"  [G-Maps @] {en} -> {at_m.group(1)}, {at_m.group(2)}")
            continue
            
        # Format 3: [null,null,13.7...,100.5...]
        ll_m = re.search(r'\[null,null,([0-9]{1,2}\.[0-9]{5,8}),([0-9]{2,3}\.[0-9]{5,8})\]', text)
        if ll_m:
            print(f"  [G-Maps Array] {en} -> {ll_m.group(1)}, {ll_m.group(2)}")
            continue

        print(f"  [G-Maps Failed] {en}")
    except Exception as e:
        print(f"  [G-Maps Error] {en}: {e}")

print("\n=== METHOD 2: Photon Komoot Geocoder ===")
for th, en, p in test_schools:
    q = f"{en}, Thailand"
    url = f"https://photon.komoot.io/api/?q={urllib.parse.quote(q)}&limit=1"
    try:
        r = session.get(url, timeout=4)
        if r.status_code == 200:
            data = r.json().get("features", [])
            if data:
                coords = data[0].get("geometry", {}).get("coordinates", [])
                name = data[0].get("properties", {}).get("name", "")
                print(f"  [Photon] {en} -> {coords[1]}, {coords[0]} ({name})")
            else:
                print(f"  [Photon No Match] {en}")
    except Exception as e:
        print(f"  [Photon Error] {en}: {e}")

print("\n=== METHOD 3: Longdo Map Search API ===")
for th, en, p in test_schools:
    q = f"{th}"
    url = f"https://search.longdo.com/mapsearch/json/search?keyword={urllib.parse.quote(q)}&limit=1"
    try:
        r = session.get(url, timeout=4)
        if r.status_code == 200:
            data = r.json().get("data", [])
            if data:
                lat = data[0].get("lat")
                lon = data[0].get("lon")
                name = data[0].get("name")
                print(f"  [Longdo] {th} -> {lat}, {lon} ({name})")
            else:
                print(f"  [Longdo No Match] {th}")
    except Exception as e:
        print(f"  [Longdo Error] {th}: {e}")
