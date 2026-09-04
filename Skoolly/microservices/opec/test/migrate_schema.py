import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from data_manager import load_schools, save_schools

def migrate():
    schools = load_schools()
    print(f"Loaded {len(schools)} schools for schema migration...")
    
    migrated = []
    for s in schools:
        # Determine consolidated website and source
        web = s.get("website") or s.get("official_website") or s.get("opec_website") or ""
        src = s.get("website_source") or ("OPEC Profile" if s.get("opec_website") else "Not Checked")
        
        # Build clean ordered dictionary
        new_s = {}
        for k, v in s.items():
            if k in ["official_website", "opec_website"]:
                continue
            if k == "website":
                new_s["website"] = web
                continue
            new_s[k] = v
            
        if "website" not in new_s:
            # Insert website before facebook
            ordered_s = {}
            for k, v in new_s.items():
                if k == "facebook":
                    ordered_s["website"] = web
                    ordered_s["website_source"] = src
                ordered_s[k] = v
            new_s = ordered_s
        else:
            new_s["website"] = web
            new_s["website_source"] = src
            
        migrated.append(new_s)
        
    save_schools(migrated)
    print(f"Successfully migrated {len(migrated)} schools to unified 'website' field in data/!")

if __name__ == "__main__":
    migrate()
