import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('data/international_schools_thailand_opec.json', 'r', encoding='utf-8') as f:
    schools = json.load(f)

targets = ['นานาชาติจีน', 'รีเจ้นท์-หลังสวน', 'บ้านอินทนิล', 'อคาเซีย พรีสคูล กรุงเทพ', 'เด่นหล้า บริติช']

print("=== VERIFY SPECIFIC TARGETS ===")
for s in schools:
    name = s.get('school_name_th', '')
    if any(t in name for t in targets):
        print(f"\n[{s.get('gps_precision')}] {name} ({s.get('school_name_en')})")
        print(f"  -> GPS:    {s.get('latitude')}, {s.get('longitude')}")
        print(f"  -> Source: {s.get('gps_source')}")

exact_count = sum(1 for s in schools if s.get('gps_precision') == 'Exact')
approx_count = sum(1 for s in schools if s.get('gps_precision') == 'Approximate')
missing_count = sum(1 for s in schools if not s.get('latitude') or not s.get('longitude'))

print("\n=== OVERALL DATASET AUDIT ===")
print(f"Total Schools in OPEC DB: {len(schools)}")
print(f"✅ Exact Building/Campus/Street Pins: {exact_count} ({round(exact_count/len(schools)*100, 1)}%)")
print(f"⚠️ Approximate Centroid Pins:        {approx_count} ({round(approx_count/len(schools)*100, 1)}%)")
print(f"❌ Missing GPS:                       {missing_count}")
