import urllib3
import requests
import re

urllib3.disable_warnings()
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Origin": "https://school.opec.go.th",
    "Referer": "https://school.opec.go.th/search",
})

# Let's fetch https://school.opec.go.th/search to find what JS bundles it loads
r = session.get("https://school.opec.go.th/search", verify=False)
js_files = re.findall(r'src=["\']([^"\']+\.js[^"\']*)["\']', r.text)
print("JS files in search page:", js_files)

# Also test common OPEC endpoints:
endpoints = [
    "/api/GetProvinceMaster",
    "/api/GetProvince",
    "/api/getProvince",
    "/api/GetProvinces",
    "/api/GetMasterProvince",
    "/api/ProvinceMaster",
    "/api/GetAmphur",
    "/api/GetTumbol",
    "/api/GetSchoolSearch",
    "/api/GetSchoolDetail",
]

for ep in endpoints:
    url = f"https://school.opec.go.th{ep}"
    rg = session.get(url, verify=False)
    rp = session.post(url, verify=False)
    print(f"{ep}: GET={rg.status_code}, POST={rp.status_code}")
