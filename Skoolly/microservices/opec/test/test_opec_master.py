import urllib3
import requests
import json

urllib3.disable_warnings()
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
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

# 1. Post to GetProvinceMaster
r_p_get = session.get('https://school.opec.go.th/api/GetProvinceMaster', verify=False)
print("GET GetProvinceMaster status:", r_p_get.status_code, "len:", len(r_p_get.text))

r_p_post = session.post('https://school.opec.go.th/api/GetProvinceMaster', verify=False)
print("POST GetProvinceMaster status:", r_p_post.status_code, "len:", len(r_p_post.text))
if r_p_post.ok and r_p_post.text:
    try:
        provs = r_p_post.json()
        print("Provinces count from POST:", len(provs))
        print("Sample:", provs[:2])
    except Exception as e:
        print("Error parsing JSON:", e)

# 2. Check if GetAmphurMaster requires POST with multipart
ct, b = make_multipart({"ProvinceCode": "10"})
r_a = session.post("https://school.opec.go.th/api/GetAmphurMaster", data=b, headers={"Content-Type": ct}, verify=False)
print("GetAmphurMaster for 10:", len(r_a.json()) if r_a.ok else "error")

# 3. Check if GetTumbolMaster requires POST with multipart
ct_t, b_t = make_multipart({"AmphurCode": "1001"})
r_t = session.post("https://school.opec.go.th/api/GetTumbolMaster", data=b_t, headers={"Content-Type": ct_t}, verify=False)
print("GetTumbolMaster for 1001:", len(r_t.json()) if r_t.ok else "error")
