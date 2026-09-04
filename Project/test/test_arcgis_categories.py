import urllib.parse
import requests

session = requests.Session()

test_schools = [
    ('SISB Nonthaburi', 'นานาชาติสิงคโปร์นนทบุรี', 'นนทบุรี'),
    ('BEYC International School', 'นานาชาติบีอีวายซี', 'กรุงเทพมหานคร'),
    ('DBS Denla British School', 'เด่นหล้า พระราม 5', 'นนทบุรี'),
    ('Lovell International School', 'นานาชาติเลิฟเวลล์', 'ชลบุรี'),
    ('Hastin International School', 'นานาชาติหัสดิน', 'ชลบุรี'),
    ('Highgate International School Thailand', 'นานาชาติไฮเกต ประเทศไทย', 'ชลบุรี'),
    ('KIS Reignwood Park', 'นานาชาติเคไอเอสเรนวูดปาร์ค', 'ปทุมธานี'),
]

for en, th, prov in test_schools:
    q = f"{en} {prov}"
    url1 = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&category=Education,School&f=json&maxLocations=1"
    url2 = f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine={urllib.parse.quote(q)}&f=json&maxLocations=1"
    
    r1 = session.get(url1).json().get('candidates', [])
    r2 = session.get(url2).json().get('candidates', [])
    
    c1 = r1[0].get('address') if r1 else 'None'
    c2 = r2[0].get('address') if r2 else 'None'
    score2 = r2[0].get('score') if r2 else 0
    loc2 = r2[0].get('location') if r2 else {}
    print(f"{en} ({prov}):")
    print(f"   WITH CATEGORY:    {c1}")
    print(f"   WITHOUT CATEGORY: {c2} (Score: {score2}, Coords: {loc2})")
