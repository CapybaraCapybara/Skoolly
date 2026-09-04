import urllib3
import requests
import json

urllib3.disable_warnings()
session = requests.Session()
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

fields = {
    "SchoolCodeName": "",
    "Course": "",
    "Tags": "",
    "ProvinceCode": "",
    "AmphurCode": "",
    "TumbolCode": "",
    "SchoolTypeGroup": "1"
}
ct, b = make_multipart(fields)
r = session.post("https://school.opec.go.th/api/GetSchoolSearch", data=b, headers={"Content-Type": ct}, verify=False)
all_schools = r.json()
intl = [s for s in all_schools if str(s.get("schoolType1")) == "7"]
print("Total international schools in search:", len(intl))

p_codes = set(str(s.get("provinceCode")) for s in intl)
print("Unique Province Codes in OPEC International schools:", sorted(list(p_codes)))
