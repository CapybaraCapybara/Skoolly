import sys
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from fetch_official_websites import resolve_all_official_websites

logs = []
def update_progress(title, current, total, log_line=None):
    if log_line:
        print(log_line)
        logs.append(log_line)

print("Starting resolve_all_official_websites...")
schools = resolve_all_official_websites(update_progress)
print(f"Finished. Total schools processed: {len(schools)}")
