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
    "SchoolCodeName": "1110700076",
    "SchoolTypeGroup": "1"
}
ct, b = make_multipart(fields)
r = session.post("https://school.opec.go.th/api/GetSchoolSearch", data=b, headers={"Content-Type": ct}, verify=False)
results = r.json()
print("Search results count:", len(results))
if results:
    s = results[0]
    print("ALL KEYS in Search result:")
    for k, v in s.items():
        print(f"  {k}: {v}")
