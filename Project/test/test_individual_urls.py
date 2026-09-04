import requests
import urllib3
urllib3.disable_warnings()

s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})

urls = [
    "https://www.annabels.ac.th",
    "https://sites.google.com/tjas.ac.th/top",
    "https://www.gism.ac.th/",
    "https://tce.ac.th/",
    "https://www.lics.ac.th/"
]

for u in urls:
    try:
        r = s.get(u, timeout=5, verify=False)
        print(f"[{r.status_code}] {u} -> Final: {r.url}")
    except Exception as e:
        print(f"[ERR] {u} -> {e}")
