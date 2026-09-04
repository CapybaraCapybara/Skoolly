from data_manager import load_schools

schools = load_schools()
for s in schools:
    if s.get("school_code") in ["1157700005", "1162700001", "1110700023", "1110700027", "1110700076", "1110700136", "1145700001", "1150700010", "1157700002", "1186700002"]:
        print(f"[{s.get('school_code')}] {s.get('school_name_th')} | OPEC Web: {s.get('opec_website')}")
