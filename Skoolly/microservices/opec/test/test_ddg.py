import urllib.parse
import re
import requests

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
})

def ddg_search_school_website(query):
    """Searches DuckDuckGo HTML without API key to find official website"""
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query + ' official website thailand')}"
        r = session.post("https://html.duckduckgo.com/html/", data={"q": query + " official website thailand"}, timeout=5)
        if r.status_code == 200:
            # Extract links
            links = re.findall(r'href="//duckduckgo.com/l/\?uddg=([^"&]+)', r.text)
            for l in links:
                decoded = urllib.parse.unquote(l)
                if not any(b in decoded for b in ['facebook.com', 'wikipedia.org', 'wongnai.com', 'yellowpages', 'moe.go.th', 'opec.go.th', 'tripadvisor', 'international-schools-database', 'edarabia']):
                    return decoded
    except Exception as e:
        print("DDG search error:", e)
    return None

test_q = "โรงเรียนนานาชาติฮาร์โรว์ กรุงเทพฯ Harrow International School Bangkok"
res = ddg_search_school_website(test_q)
print(f"Query: {test_q}\nResult: {res}")
