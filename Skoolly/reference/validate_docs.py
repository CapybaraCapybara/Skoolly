# -*- coding: utf-8 -*-
"""ตรวจความสอดคล้องระหว่างเอกสาร โค้ด และฐานข้อมูลจริง

รวมทุกการตรวจที่เคยทำแบบมือไว้ในที่เดียว เพื่อให้รันซ้ำได้ทุกครั้งที่แก้อะไร
แทนที่จะต้องหวังว่าจะนึกออกว่าต้องตรวจอะไรบ้าง

วิธีใช้:
    python reference/validate_docs.py            # ตรวจทั้งหมด (ต้องต่อฐานข้อมูลได้)
    python reference/validate_docs.py --offline  # ตรวจเฉพาะส่วนที่ไม่ต้องใช้ฐานข้อมูล

คืนค่า exit code 1 ถ้ามีข้อผิดพลาด เพื่อให้ใส่ใน CI ได้
"""
from __future__ import annotations

import io
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, 'reference', 'use_case_specification_final_v6.md')
ARCH = os.path.join(ROOT, 'reference', 'system_architecture_explained_v6.md')
DICT = os.path.join(ROOT, 'reference', 'data_dictionary.md')
DESIGN = os.path.join(ROOT, 'db', 'DATABASE_DESIGN.md')
SCHEMA = os.path.join(ROOT, 'db', 'schema.sql')
DOCS = {'Use Case Spec': SPEC, 'Architecture': ARCH,
        'Data Dictionary': DICT, 'Database Design': DESIGN}

SCHEMAS = ('school_data', 'community', 'user_data', 'ai', 'ops')

# object ที่เคยมีแล้วถูกลบ — ห้ามมีเอกสารไหนอ้างถึงเหมือนยังมีอยู่
REMOVED = ['curriculum_aliases', 'grade_level_aliases', 'school_curriculums',
           'school_levels', 'review_status']
# คำที่ไม่เหมาะกับเอกสารวิชาการ
INFORMAL = ['พัง', 'เงียบๆ', 'เฉยๆ', 'มั่วๆ', 'ซ้ำๆ', 'เยอะๆ', 'งงๆ', 'โดดๆ', 'ห่วย']

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = '') -> None:
    results.append((name, ok, detail))


def read(p: str) -> str:
    return io.open(p, encoding='utf-8').read()


# ─────────────────────────────────────────────────────────────────────────────
# ส่วนที่ 1 — ตรวจ Use Case Spec ด้วยตัวเอง (ไม่ต้องใช้ฐานข้อมูล)
# ─────────────────────────────────────────────────────────────────────────────
def check_spec_structure() -> None:
    s = read(SPEC)
    lines = s.split('\n')
    fields = ['**Use Case ID:**', '**Use Case Name:**', '**Primary Actor:**',
              '**Secondary Actor:**', '**Description:**', '**Pre Condition:**',
              '**Main Flow', '**Exception Flow**', '**Post Condition:**',
              '**Business Rule:**']

    blocks = re.split(r'\n(?=### UC-\d\d:)', s)[1:]
    ids = [re.match(r'### UC-(\d\d)', b).group(1) for b in blocks]
    check('เลข Use Case เรียงต่อเนื่องไม่ข้ามไม่ซ้ำ',
          ids == ['%02d' % n for n in range(1, len(ids) + 1)],
          'พบ %d ตัว: %s' % (len(ids), ','.join(ids)))

    incomplete = [i for i, b in zip(ids, blocks) if not all(f in b for f in fields)]
    check('ทุก Use Case มีครบ 10 ฟิลด์ตามแม่แบบในหัวข้อ 3', not incomplete,
          'ขาดใน UC-' + ', UC-'.join(incomplete) if incomplete else '')

    ex, step = defaultdict(list), defaultdict(int)
    cur = None
    for ln in lines:
        m = re.match(r'^### UC-(\d\d):', ln)
        if m:
            cur = m.group(1)
            continue
        if re.match(r'^## ', ln):
            cur = None
        if cur:
            m = re.match(r'^- \*\*E(\d+)(b?) —', ln)
            if m and not m.group(2):
                ex[cur].append(int(m.group(1)))
            m2 = re.match(r'^(\d+)\. ', ln)
            if m2:
                step[cur] = max(step[cur], int(m2.group(1)))
    gaps = [u for u in ex if ex[u] != list(range(1, len(ex[u]) + 1))]
    check('เลข Exception Flow ในแต่ละ Use Case เรียงต่อเนื่อง', not gaps,
          'ไม่ต่อเนื่องที่ UC-' + ', UC-'.join(gaps) if gaps else '')

    # อ้างอิงข้าม Use Case ต้องชี้ไปยังของที่มีอยู่จริง
    bad, in_map = [], False
    for i, ln in enumerate(lines, 1):
        if 'ID ใน v6.4' in ln:
            in_map = True
        if in_map and ln.startswith('### 2.6'):
            in_map = False
        if in_map:
            continue
        for m in re.finditer(r'UC-(\d\d)(?:\s+(E\d+)b?)?', ln):
            n, e = m.group(1), m.group(2)
            if n not in ex:
                bad.append('บรรทัด %d: %s' % (i, m.group(0)))
            elif e and int(e[1:]) not in ex[n]:
                bad.append('บรรทัด %d: %s' % (i, m.group(0)))
        for m in re.finditer(r'UC-(\d\d) ข้อ (\d+)', ln):
            n, k = m.group(1), int(m.group(2))
            if n in ex and k > step[n]:
                bad.append('บรรทัด %d: %s (มีแค่ %d ขั้น)' % (i, m.group(0), step[n]))
    check('การอ้างอิงข้าม Use Case ชี้ไปยังของที่มีอยู่จริง', not bad, '; '.join(bad[:4]))

    pri = Counter(re.findall(r'\| (Must|Should|Could) \|', s))
    check('จำนวน Use Case ในตารางภาพรวมตรงกับที่เขียนจริง',
          sum(pri.values()) == len(ids),
          'ตารางภาพรวม %d · เขียนจริง %d (Must %d / Should %d / Could %d)'
          % (sum(pri.values()), len(ids), pri['Must'], pri['Should'], pri['Could']))


def check_cross_doc() -> None:
    texts = {k: read(v) for k, v in DOCS.items()}

    # ของที่ถูกลบไปแล้วต้องไม่ถูกอ้างเหมือนยังมีอยู่
    for name, t in texts.items():
        hits = []
        for obj in REMOVED:
            for m in re.finditer(re.escape(obj), t):
                around = t[max(0, m.start() - 110):m.end() + 110]
                if not re.search(r'เดิม|ถูกลบ|ถูกตัด|แทนที่|ยกเลิก|v6\.[45]', around):
                    hits.append(obj)
                    break
        check('[%s] ไม่อ้างตารางหรือชนิดข้อมูลที่ถูกลบไปแล้ว' % name, not hits, ', '.join(hits))

    # หัวข้อที่อ้างต้องมีอยู่จริง หรือระบุว่าเป็นของเอกสารอื่น
    for name, t in texts.items():
        heads = set(re.findall(r'^#{2,4}\s*(\d+(?:\.\d+)*)', t, re.M))
        heads |= {h.split('.')[0] for h in heads}
        bad = []
        for m in re.finditer(r'หัวข้อ\s*(\d+(?:\.\d+)*)', t):
            num = m.group(1)
            if num in heads:
                continue
            near = t[max(0, m.start() - 80):m.end() + 60]
            if not re.search(r'Architecture|Use Case|schema\.sql|System Arch|แบบฟอร์ม|คง\.101|รายงาน', near):
                bad.append(num)
        check('[%s] อ้างหัวข้อที่มีอยู่จริง หรือระบุชื่อเอกสารกำกับ' % name,
              not bad, 'หัวข้อ ' + ', '.join(sorted(set(bad))))

    # ภาษาที่ไม่เหมาะกับเอกสารวิชาการ
    for name, t in texts.items():
        found = [w for w in INFORMAL if w in t]
        check('[%s] ไม่มีภาษาพูดปนในเอกสาร' % name, not found, ', '.join(found))

    # อักขรวิธี "ๆ" ต้องเว้นวรรคหน้า
    for name, t in texts.items():
        n = len(re.findall(r'[ก-๙]ๆ', t))
        check('[%s] เว้นวรรคหน้า "ๆ" ถูกอักขรวิธี' % name, n == 0, 'พบ %d จุด' % n)

    # ลิงก์ไฟล์ที่อ้างต้องมีจริง
    for name, path in DOCS.items():
        t = read(path)
        links = set(re.findall(r'\]\(([^)]+\.(?:md|sql))\)', t))
        links |= set(re.findall(r'`((?:db|reference|src|microservices)/[^`*]+\.(?:md|sql|py|ts|tsx))`', t))
        base = os.path.dirname(path)
        bad = [l for l in links if '*' not in l
               and not os.path.exists(os.path.join(ROOT, l))
               and not os.path.exists(os.path.join(base, l))]
        check('[%s] ลิงก์ไฟล์ที่อ้างถึงมีอยู่จริง' % name, not bad, ', '.join(bad))


def check_traceability() -> None:
    s = read(SPEC)
    check('Use Case Spec มีตารางสอบกลับ (หัวข้อ 9)', '## 9. ตารางสอบกลับ' in s)
    if '## 9. ตารางสอบกลับ' not in s:
        return
    sec = s[s.index('## 9. ตารางสอบกลับ'):]
    listed = set(re.findall(r'^\| `([a-z_]+)` \|', sec, re.M))
    schema_tables = {t.split('.')[1] for t in
                     re.findall(r'create table if not exists ([a-z_]+\.[a-z_]+)', read(SCHEMA))}
    missing = sorted(schema_tables - listed)
    check('ทุกตารางใน schema.sql ปรากฏในตารางสอบกลับ', not missing, ', '.join(missing))


# ─────────────────────────────────────────────────────────────────────────────
# ส่วนที่ 2 — ตรวจเทียบกับฐานข้อมูลจริง
# ─────────────────────────────────────────────────────────────────────────────
def load_dsn() -> str | None:
    env = os.path.join(ROOT, '.env')
    if os.path.exists(env):
        for line in io.open(env, encoding='utf-8'):
            if line.strip().startswith('DATABASE_URL'):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return os.environ.get('DATABASE_URL')


def check_against_db() -> None:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        check('ต่อฐานข้อมูลเพื่อเทียบของจริง', False, 'ไม่พบ psycopg — ข้ามการตรวจส่วนนี้')
        return
    dsn = load_dsn()
    if not dsn:
        check('ต่อฐานข้อมูลเพื่อเทียบของจริง', False, 'ไม่พบ DATABASE_URL')
        return
    try:
        conn = psycopg.connect(dsn, row_factory=dict_row, connect_timeout=20,
                               prepare_threshold=None)
    except Exception as exc:
        check('ต่อฐานข้อมูลเพื่อเทียบของจริง', False, str(exc)[:80])
        return

    with conn, conn.cursor() as cur:
        cur.execute("""select table_schema||'.'||table_name t from information_schema.tables
                       where table_schema = any(%s) and table_type='BASE TABLE'""", (list(SCHEMAS),))
        db_tables = {r['t'] for r in cur.fetchall()}
        cur.execute("""select count(*) n from information_schema.columns
                       where table_schema = any(%s)""", (list(SCHEMAS),))
        n_col = cur.fetchone()['n']
        cur.execute("""select count(*) n from pg_description d
                       join pg_attribute a on a.attrelid=d.objoid and a.attnum=d.objsubid
                       join pg_class c on c.oid=a.attrelid
                       join pg_namespace ns on ns.oid=c.relnamespace
                       where d.objsubid>0 and ns.nspname = any(%s)""", (list(SCHEMAS),))
        n_cmt = cur.fetchone()['n']

    schema_tables = set(re.findall(r'create table if not exists ([a-z_]+\.[a-z_]+)', read(SCHEMA)))
    diff = schema_tables ^ db_tables
    check('schema.sql ตรงกับฐานข้อมูลจริงทุกตาราง', not diff,
          'ต่างกัน: ' + ', '.join(sorted(diff)) if diff else '%d ตาราง' % len(db_tables))

    check('ทุกคอลัมน์ในฐานข้อมูลมีคำอธิบายกำกับ', n_cmt == n_col,
          '%d จาก %d คอลัมน์' % (n_cmt, n_col))

    # จำนวนตารางที่เอกสารอ้าง ต้องตรงกับของจริง
    for name, path in DOCS.items():
        t = read(path)
        nums = {int(x) for x in re.findall(r'(?<![\d.])(\d+)\s*ตาราง', t)}
        # ตัดเลขที่เป็นเชิงอรรถอื่น เช่น "6 ตารางในแบบเดิม"
        wrong = {n for n in nums if 20 < n < 40 and n != len(db_tables)}
        historical = re.findall(r'(\d+)\s*ตาราง[^\n]{0,40}(?:v6\.\d|ณ v6|เดิม)', t)
        wrong -= {int(x) for x in historical}
        check('[%s] จำนวนตารางที่ระบุตรงกับฐานข้อมูล' % name, not wrong,
              'พบเลข %s แต่ของจริง %d' % (sorted(wrong), len(db_tables)))

    # Data Dictionary ต้องมีครบทุกตาราง
    d = read(DICT)
    listed = set(re.findall(r'^### `([a-z_]+)`', d, re.M))
    missing = sorted({t.split('.')[1] for t in db_tables} - listed)
    check('Data Dictionary ครอบคลุมทุกตารางในฐานข้อมูล', not missing, ', '.join(missing))


# ─────────────────────────────────────────────────────────────────────────────
def main() -> int:
    offline = '--offline' in sys.argv
    check_spec_structure()
    check_cross_doc()
    check_traceability()
    if not offline:
        check_against_db()

    width = max(len(n) for n, _, _ in results)
    failed = [r for r in results if not r[1]]
    print('\n' + '═' * (width + 22))
    print(' ผลตรวจความสอดคล้องของเอกสาร Skoolly')
    print('═' * (width + 22))
    for name, ok, detail in results:
        mark = 'ผ่าน  ' if ok else 'ไม่ผ่าน'
        print(' %-*s  %s  %s' % (width, name, mark, detail if not ok else detail))
    print('─' * (width + 22))
    print(' ผ่าน %d จาก %d ข้อ' % (len(results) - len(failed), len(results)))
    if failed:
        print('\n ต้องแก้ %d ข้อ:' % len(failed))
        for name, _, detail in failed:
            print('   - %s %s' % (name, ('— ' + detail) if detail else ''))
    print()
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
