import urllib3
import requests
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings()
session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=50, max_retries=3)
session.mount("https://", adapter)
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": "https://school.opec.go.th",
    "Referer": "https://school.opec.go.th/search",
})

def make_multipart(fields):
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    lines = []
    for k, v in fields.items():
        lines.append(f'--{boundary}')
        lines.append(f'Content-Disposition: form-data; name="{k}"')
        lines.append('')
        lines.append(str(v))
    lines.append(f'--{boundary}--')
    lines.append('')
    return f'multipart/form-data; boundary={boundary}', '\r\n'.join(lines).encode('utf-8')

print("Fetching OPEC search list...")
fields = {"SchoolCodeName": "", "SchoolTypeGroup": "1"}
ct, b = make_multipart(fields)
r = session.post("https://school.opec.go.th/api/GetSchoolSearch", data=b, headers={"Content-Type": ct}, verify=False)
intl = [s for s in r.json() if str(s.get("schoolType1")) == "7"]
print(f"Total international schools: {len(intl)}")

def fetch_pure_detail(s):
    code = str(s.get("schoolCode", "")).strip()
    ct_code, b_code = make_multipart({"SchoolCode": code})
    
    for attempt in range(3):
        try:
            dr = session.post(
                "https://school.opec.go.th/api/GetSchoolDetail",
                data=b_code,
                headers={"Content-Type": ct_code},
                timeout=10,
                verify=False
            )
            if dr.ok:
                d = dr.json()
                if isinstance(d, dict) and d.get("provinceNameTh"):
                    merged = dict(s)
                    merged.update(d)
                    return merged
        except Exception:
            time.sleep(0.3)
            
    return s

print("Fetching GetSchoolDetail directly from OPEC for all 291 schools...")
with ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(fetch_pure_detail, intl))

missing_prov = [s for s in results if not s.get("provinceNameTh")]
print(f"\nResults from OPEC API directly:")
print(f"Total schools: {len(results)}")
print(f"Missing provinceNameTh directly from OPEC API: {len(missing_prov)}")

if not missing_prov:
    print("SUCCESS: 100% of schools have provinceNameTh fetched directly from OPEC API!")
