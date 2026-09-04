import urllib3
import requests
import json

urllib3.disable_warnings()
session = requests.Session()

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

r_p = session.get('https://school.opec.go.th/api/GetProvinceMaster', verify=False)
provinces = {str(item.get('provinceCode')): item.get('provinceNameTh', '').strip() for item in r_p.json()}
print('Total provinces loaded:', len(provinces))

# Search school
ct, b = make_multipart({"SchoolCodeName": "1110700076", "SchoolTypeGroup": "1"})
r_s = session.post("https://school.opec.go.th/api/GetSchoolSearch", data=b, headers={"Content-Type": ct}, verify=False)
print("Search count:", len(r_s.json()))
s_raw = r_s.json()[0]
print("s_raw provinceCode:", s_raw.get("provinceCode"), "provinceNameTh:", s_raw.get("provinceNameTh"))
print("s_raw amphurCode:", s_raw.get("amphurCode"), "amphurNameTh:", s_raw.get("amphurNameTh"))

# Detail school
ct, b = make_multipart({'SchoolCode': '1110700076'})
r = session.post('https://school.opec.go.th/api/GetSchoolDetail', data=b, headers={'Content-Type': ct}, verify=False)
d = r.json()
print('detail provinceCode:', d.get('provinceCode'), 'provinceNameTh:', d.get('provinceNameTh'))
print('detail amphurCode:', d.get('amphurCode'), 'amphurNameTh:', d.get('amphurNameTh'))
print('detail tumbolCode:', d.get('tumbolCode'), 'tumbolNameTh:', d.get('tumbolNameTh'))
