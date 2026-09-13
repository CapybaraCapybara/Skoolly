import urllib3
import requests
import re
from typing import List, Dict, Any
from bs4 import BeautifulSoup

urllib3.disable_warnings()

def fetch_isat_schools() -> List[Dict[str, Any]]:
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    })

    # Step 1: Get CSRF and session key from initial page
    r = session.get('https://www.isat.or.th/search', verify=False, timeout=20)
    csrf_m = re.search(r'id=["\']my-csrf-id["\'][^>]*value=["\']([^"\']+)["\']', r.text)
    mykey_m = re.search(r'var_mykey\s*=\s*["\']([^"\']+)["\']', r.text)

    if not csrf_m or not mykey_m:
        raise RuntimeError("Failed to extract CSRF or mykey from ISAT")

    csrf = csrf_m.group(1)
    mykey = mykey_m.group(1)

    headers = {
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest'
    }

    schools: List[Dict[str, Any]] = []

    # Two requests with 150 perPage covers all 207 schools
    for page in [1, 2]:
        data = {
            'req_type': 'TabSearch',
            'nav_name': 'getSearch',
            'menu_name': 'MenuSearch',
            'key1': '',
            'key2': 'k2',
            'key3': 'k3',
            'tmpdata': str(page),
            'mykey': mykey,
            'csrf_key': csrf,
            'code_ver': 202407201,
            'var_order_seed': '1789288894',
            'var_search_text': '',
            'var_perPage': '150'
        }

        res = session.post('https://www.isat.or.th/search/AjaxForm/nav', data=data, headers=headers, verify=False, timeout=25)
        res_json = res.json()

        for item in res_json.get('list', []):
            html = item.get('HTML', '')
            if not html:
                continue
            soup = BeautifulSoup(html, 'html.parser')
            
            # Each school has an h3 header and schoolBox container
            headings = soup.find_all('h3')
            boxes = soup.find_all('div', class_='schoolBox')

            for h3, box in zip(headings, boxes):
                name = h3.text.strip()
                
                # Logo
                img_tag = box.find('img')
                logo_path = img_tag.get('src') if img_tag else ''
                if logo_path and not logo_path.startswith('http'):
                    logo_url = f"https://www.isat.or.th{logo_path}"
                else:
                    logo_url = logo_path

                # Info rows
                info: Dict[str, str] = {}
                for row in box.find_all('div', class_='row'):
                    label_div = row.find('div', class_='cl-isat')
                    if label_div:
                        label = label_div.text.strip().lower()
                        val_div = label_div.find_next_sibling('div')
                        if val_div:
                            # For website or map, prefer href if present
                            a_tag = val_div.find('a')
                            if 'website' in label and a_tag and a_tag.get('href'):
                                info['website'] = a_tag.get('href').strip()
                            else:
                                info[label] = val_div.text.strip()

                address = info.get('location/address', '')
                year_est_raw = info.get('year established', '')
                try:
                    year_established = int(year_est_raw) if year_est_raw.isdigit() else None
                except Exception:
                    year_established = None

                level_raw = info.get('level', '')
                levels = [x.strip() for x in level_raw.split(',') if x.strip()] if level_raw else []

                curr_raw = info.get('curriculum', '')
                curriculums = [x.strip() for x in curr_raw.split(',') if x.strip()] if curr_raw else []

                accred_raw = info.get('accreditation', '')
                accreditations = [x.strip() for x in accred_raw.split(',') if x.strip() and x.strip().lower() != 'none'] if accred_raw else []

                boarding_raw = info.get('boarding school', '').lower()
                is_boarding = True if 'boarding' in boarding_raw else False

                website = info.get('website', '')
                phone = info.get('phone', '')

                schools.append({
                    'name': name,
                    'logo_url': logo_url,
                    'address': address,
                    'year_established': year_established,
                    'levels': levels,
                    'curriculums': curriculums,
                    'accreditations': accreditations,
                    'is_boarding': is_boarding,
                    'website': website,
                    'phone': phone
                })

    # Deduplicate by name just in case
    seen = set()
    unique_schools = []
    for s in schools:
        if s['name'] not in seen:
            seen.add(s['name'])
            unique_schools.append(s)

    return unique_schools

if __name__ == '__main__':
    results = fetch_isat_schools()
    print(f"Total parsed ISAT schools: {len(results)}")
    if results:
        print("Sample 0:", results[0])
        print("Sample 1:", results[1])
