"""
grade_years.py
Turns a school's tuition rows into one row per school year, in grade order, for the Cost Calculator.

Schools label grades in their own way ("Year 7 - Year 9", "Key Stage 2 (Year 3 - 6)", "K1 (FS2)",
"Nursery (3 days)"), and the calculator counts one row as one year. Each label is read as a span on
the same 0-16 scale as db/add_grade_level_aliases.sql (0-1 pre-nursery, 2-4 อ.1-3, 5-10 ป.1-6,
11-13 ม.1-3, 14-16 ม.4-6), then multi-year rows are expanded and option rows (half day / full day,
3 or 5 days) for the same year are reduced to one.
"""

import re

MAX_INDEX = 16

# Noise that carries numbers but no grade: ages, clock times, academic years, days per week
_NOISE = [
    r"\(?\b(?:ages?|aged)\s*\d+(?:\s*(?:-|to)\s*\d+)?(?:\s*(?:years?|yrs?))?(?:\s*old)?(?:\s*(?:and|&)\s*up)?\)?",
    r"\(?\b\d+(?:\s*-\s*\d+)?\s*(?:years?|yrs?)(?:\s*old)?(?:\s*(?:and|&)\s*up)?\)?",
    r"\(\s*\d+\s*-\s*\d+\s*\)",
    r"\b\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}\b",
    r"\b20\d\d(?:\s*[-/]\s*(?:20)?\d\d)?\b",
    r"\b\d\s*(?:half\s*|full\s*)?(?:days?|mornings?)\b(?:\s*(?:/|per)\s*week)?",
]

_SEP = r"\s*(?:-|to|through|&|and|,|/)\s*"

# (family, pattern, index of the matched number); checked in this order, and each match is blanked
# out before the next pattern runs so "Pre-Kindergarten" is not read again as "Kindergarten"
_NUMBERED = [
    ("KS", r"\bkey\s*stage\s*(\d)", None),
    ("EY", r"\b(?:early\s*years?|ey|fs|foundation\s*stage)\s*(\d)(?:" + _SEP + r"(?:early\s*years?|ey|fs|foundation\s*stage)?\s*(\d))?\b", lambda n: n + 1),
    ("PREK", r"\bpre[-\s]?k(?:indergarten|g)?\s*(\d)(?:" + _SEP + r"(?:pre[-\s]?k(?:indergarten|g)?)?\s*(\d))?\b", lambda n: n - 1),
    ("NURSERY", r"\bnursery\s*(\d)(?:" + _SEP + r"(?:nursery)?\s*(\d))?\b", lambda n: n - 1),
    ("TH_KG", r"(?:อนุบาล|\banuban)\s*(\d)", lambda n: n + 1),
    ("TH_P", r"(?:ประถม(?:ศึกษา)?(?:ปีที่)?|\bpratum|ป\.)\s*(\d)", lambda n: n + 4),
    ("TH_M", r"(?:มัธยม(?:ศึกษา)?(?:ปีที่)?|\bmathayom|ม\.)\s*(\d)", lambda n: n + 10),
    ("DP", r"\b(?:ib\s*)?diploma(?:\s*programme)?\s*(\d)\b", lambda n: n + 14),
    ("SEC", r"\bsecondary\s*(\d)\b", lambda n: n + 10),
    ("K", r"\b(?:kg|k|kindergarten|kinder)\s*(?:level\s*)?(\d)(?:" + _SEP + r"(?:kg|k|kindergarten)?\s*(\d))?\b", "K"),
    ("YEAR", r"\byears?\s*(\d{1,2})(?:" + _SEP + r"(?:years?\s*)?(\d{1,2}))?\b", "YEAR"),
    ("GRADE", r"\b(?:grades?|g|class|standard|primary)\s*(\d{1,2})(?:" + _SEP + r"(?:grades?|g)?\s*(\d{1,2}))?\b", lambda n: n + 4),
    ("GRADE", r"\b(\d{1,2})(?:st|nd|rd|th)\s*grade\b", lambda n: n + 4),
]

_KEY_STAGES = {1: (4, 5), 2: (6, 9), 3: (10, 12), 4: (13, 14), 5: (15, 16)}
_KS_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

# Grades named by a word, no number
_NAMED = [
    (r"\bjunior\s*pre[-\s]?k(?:indergarten)?\b", 0),
    (r"\bsenior\s*pre[-\s]?k(?:indergarten)?\b", 1),
    (r"\bpre[-\s]?nursery\b|\bpn\b|\btoddlers?(?:\s*prep)?\b|\bplaygroup\b|\btps\b|\btiger cubs\b|\blion cubs\b|\bmini dragons\b|\bpre[-\s]?early\s*years\b|เตรียมอนุบาล", 0),
    (r"\bpre[-\s]?k(?:indergarten|indy|g)?\b|\bk0\b", 1),
    (r"\bnursery\b", 1),
    (r"\bpre[-\s]?reception\b", 2),
    (r"\bjunior\s*kindergarten\b|\bjunior\s*k\b", 2),
    (r"\bsenior\s*kindergarten\b|\bsenior\s*k\b", 3),
    (r"\breception\b", 3),
    (r"\b(?:kindergarten|kinder|kg|kindy|prep)\b", 4),
    (r"\bfoundation\b", 4),
]

# Whole school stages, used only when a label names no single grade ("Primary School", "IB Diploma Studies")
_STAGES = [
    (r"\bearly\s*years?\b", (1, 3)),
    (r"\bpre[-\s]?school\b", (0, 3)),
    (r"\blower\s*elementary\b", (5, 7)),
    (r"\bupper\s*elementary\b", (8, 10)),
    (r"\bsixth\s*form\b|\ba[-\s]?levels?\b|\bib\s*diploma\b|\bdiploma\s*programme\b", (15, 16)),
    (r"\bigcse\b", (13, 14)),
    (r"\bmiddle(?:\s*school)?\b", (11, 13)),
    (r"\bhigh(?:\s*school)?\b", (14, 16)),
    (r"\bprimary\b|\belementary\b|ประถม", (5, 10)),
]


def _clean(label):
    text = (label or "").replace("–", "-").replace("—", "-")
    for pattern in _NOISE:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)
    return text


def _tokens(text, year_offset):
    """[(start, end, family)] for every grade named in `text`."""
    found = []

    def take(m, start, end, family):
        nonlocal text
        found.append((start, end, family))
        text = text[:m.start()] + " " * (m.end() - m.start()) + text[m.end():]

    for family, pattern, convert in _NUMBERED:
        for m in list(re.finditer(pattern, text, re.IGNORECASE)):
            if family == "KS":
                start, end = _KEY_STAGES.get(int(m.group(1)), (None, None))
                if start is not None:
                    take(m, start, end, family)
                continue
            nums = [int(g) for g in m.groups() if g is not None]
            if convert == "K":
                # K1-K3 count from อ.1, but a label that goes up to K4/K5 counts by age (K3 = 3 years old)
                by_age = max(nums) >= 4
                idx = [n - 1 if by_age else n + 1 for n in nums]
            elif convert == "YEAR":
                idx = [n + year_offset for n in nums]
            else:
                idx = [convert(n) for n in nums]
            take(m, min(idx), max(idx), family)

    for m in list(re.finditer(r"\bkey\s*stage\s*(one|two|three|four|five)\b", text, re.IGNORECASE)):
        start, end = _KEY_STAGES[_KS_WORDS[m.group(1).lower()]]
        take(m, start, end, "KS")
    for m in list(re.finditer(r"\bk(?:g)?\s*-\s*(\d{1,2})\b", text, re.IGNORECASE)):  # "Grades K-5"
        take(m, 4, int(m.group(1)) + 4, "GRADE")
    for pattern, idx in _NAMED:
        for m in list(re.finditer(pattern, text, re.IGNORECASE)):
            take(m, idx, idx, "NAMED")
    return found


def _width(found):
    return max(e for _, e, _ in found) - min(s for s, _, _ in found)


def grade_span(label, curriculums=()):
    """(first, last, family) on the 0-16 scale for one tuition label, or None when it can't be read."""
    year_offset = 4 if "AUSTRALIAN" in curriculums and "BRITISH" not in curriculums else 3
    text = _clean(label)
    outside = re.sub(r"\([^)]*\)", " ", text)
    found = _tokens(outside, year_offset)
    inside = _tokens(" ".join(re.findall(r"\(([^)]*)\)", text)), year_offset)
    # "Key Stage 2 (Year 3 - 6)" and "Kindergarten (K1-K3)" give the grades inside the brackets;
    # otherwise the brackets hold a synonym ("K1 (FS2)", "Nursery (EY1)") and are ignored
    if inside and (not found or (all(f == "NAMED" for _, _, f in found)
                                 and _width(inside) > _width(found))):
        found = inside
    if not found:
        for pattern, (start, end) in _STAGES:
            if re.search(pattern, text, re.IGNORECASE):
                return start, end, "STAGE"
        return None
    # "Prep Center to Grade 12" names one end of a range only
    if len(found) == 1 and found[0][0] == found[0][1] and re.search(r"\b(?:to|through)\b", outside, re.IGNORECASE):
        return None
    start = min(s for s, _, _ in found)
    end = max(e for _, e, _ in found)
    if not (0 <= start <= end <= MAX_INDEX):
        return None
    families = {f for _, _, f in found}
    return start, end, families.pop() if len(families) == 1 else "MIXED"


def thai_grade(idx):
    if idx <= 1:
        return "เตรียมอนุบาล"
    if idx <= 4:
        return f"อ.{idx - 1}"
    if idx <= 10:
        return f"ป.{idx - 4}"
    return f"ม.{idx - 10}"


def _year_name(idx, family, label, year_offset):
    if family == "YEAR":
        return f"Year {idx - year_offset}"
    if family == "GRADE":
        return f"Grade {idx - 4}" if idx >= 5 else "Kindergarten"
    return label


def year_rows(rows, curriculums=()):
    """
    One tuition row per school year, youngest first. `rows` are dicts with grade_level, annual_thb
    and page_pos (the row's place on the school's own page). Every row keeps its fields and gains
    order_start/order_end and display_name. If any label can't be read, the rows come back in page
    order unchanged, one row per year as before, rather than guessing.
    """
    year_offset = 4 if "AUSTRALIAN" in curriculums and "BRITISH" not in curriculums else 3
    by_page = sorted(rows, key=lambda r: r.get("page_pos") or 0)
    # A boarding fee sits in the tuition table on some pages but is not a school year
    grades = [r for r in by_page if not re.search(r"\bboarding\b", r.get("grade_level") or "", re.IGNORECASE)]
    spans = [grade_span(r.get("grade_level"), curriculums) for r in grades]
    if not grades or any(s is None for s in spans):
        return by_page
    by_page = grades

    out = []
    for idx in sorted({i for start, end, _ in spans for i in range(start, end + 1)}):
        covering = [(r, s) for r, s in zip(by_page, spans) if s[0] <= idx <= s[1]]
        # The row made for this year beats a row for a whole stage; between options for the same
        # year (half/full day, 3/5 days, two campuses) the full-time price is the safer estimate
        row, (start, end, family) = min(covering, key=lambda c: (c[1][1] - c[1][0], -(c[0].get("annual_thb") or 0)))
        name = row.get("grade_level") if start == end else _year_name(idx, family, row.get("grade_level"), year_offset)
        out.append({**row, "grade_level": name, "display_name": f"{thai_grade(idx)} ({name})",
                    "order_start": idx, "order_end": idx})
    return out
