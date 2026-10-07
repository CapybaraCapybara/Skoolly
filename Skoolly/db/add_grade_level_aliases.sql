-- =============================================================================
-- Migration: Create and Seed school_data.grade_level_aliases
-- =============================================================================
-- สารบัญอ้างอิงเทียบเคียงระดับชั้นข้ามหลักสูตรสากล (15 หลักสูตร) เข้าสู่มาตรฐานไทย
-- สามารถ Copy ไปรันใน Supabase SQL Editor หรือ psql ได้โดยตรง

-- 0. สร้าง Schema school_data หากยังไม่มีในระบบ
create schema if not exists school_data;
grant usage on schema school_data to anon, authenticated;

-- 0.1 สร้างตารางแม่ curriculums หากยังไม่มี (จำเป็นเพราะ grade_level_aliases ต้องอ้างอิง Foreign Key)
create table if not exists school_data.curriculums (
  code           text primary key,
  name_th        text not null,
  name_en        text not null,
  sort_order     int  not null default 100
);
alter table school_data.curriculums enable row level security;
grant select on school_data.curriculums to anon, authenticated;

do $$ begin
  create policy curriculums_read on school_data.curriculums for select using (true);
exception when duplicate_object then null; end $$;

insert into school_data.curriculums (code, name_th, name_en, sort_order) values
  ('BRITISH',   'หลักสูตรอังกฤษ',        'British',            10),
  ('AMERICAN',  'หลักสูตรอเมริกัน',       'American',           20),
  ('IB',        'หลักสูตร IB',           'International Baccalaureate', 30),
  ('SINGAPORE', 'หลักสูตรสิงคโปร์',       'Singapore',          40),
  ('CANADIAN',  'หลักสูตรแคนาดา',        'Canadian',           50),
  ('AUSTRALIAN','หลักสูตรออสเตรเลีย',     'Australian',         60),
  ('CHINESE',   'หลักสูตรจีน',           'Chinese',            70),
  ('JAPANESE',  'หลักสูตรญี่ปุ่น',         'Japanese',           80),
  ('INDIAN',    'หลักสูตรอินเดีย',        'Indian',             90),
  ('FRENCH',    'หลักสูตรฝรั่งเศส',       'French',             91),
  ('GERMAN',    'หลักสูตรเยอรมัน',        'German',             92),
  ('KOREAN',    'หลักสูตรเกาหลี',         'Korean',             93),
  ('MONTESSORI','แนวมอนเตสซอรี',         'Montessori',         94),
  ('THAI_MOE',  'หลักสูตรกระทรวงศึกษาธิการ','Thai MOE',          95),
  ('OTHER',     'อื่นๆ',                 'Other',             999)
on conflict (code) do nothing;

-- 1. สร้างตาราง Lookup (grade_level_aliases)
create table if not exists school_data.grade_level_aliases (
  curriculum_code  text not null references school_data.curriculums(code),
  source_grade     text not null,              -- ชื่อดิบจากเว็บโรงเรียน เช่น 'Year 2', 'Grade 1'
  level_code       text not null,              -- 'PRE_NURSERY','KINDERGARTEN','PRIMARY','LOWER_SECONDARY','UPPER_SECONDARY'
  order_index      int  not null               -- 0-1=ก่อนอนุบาล, 2-4=อนุบาล, 5-10=ประถม, 11-13=มัธยมต้น, 14-16=มัธยมปลาย
                   check (order_index between 0 and 16),
  display_name     text not null,              -- เช่น 'ป.1 (Year 2)' — ภาษาไทยพร้อมชื่อหลักสูตร
  primary key (curriculum_code, source_grade)
);

-- 2. กำหนดสิทธิ์และการเข้าถึง (Permissions & RLS)
grant select on school_data.grade_level_aliases to anon, authenticated;
alter table school_data.grade_level_aliases enable row level security;

do $$ begin
  create policy grade_level_aliases_read on school_data.grade_level_aliases for select using (true);
exception when duplicate_object then null; end $$;

-- 3. ข้อมูลสารบัญตั้งต้น (Seed Data) สำหรับ 15 หลักสูตร

-- ── British Curriculum ────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('BRITISH', 'Pre Nursery',         'PRE_NURSERY',     0,  'เตรียมอนุบาล 1 (Pre-Nursery)'),
  ('BRITISH', 'Pre-Nursery',         'PRE_NURSERY',     0,  'เตรียมอนุบาล 1 (Pre-Nursery)'),
  ('BRITISH', 'Nursery',             'PRE_NURSERY',     1,  'เตรียมอนุบาล 2 (Nursery)'),
  ('BRITISH', 'Early Years 1',       'KINDERGARTEN',    2,  'อ.1 (Early Years 1)'),
  ('BRITISH', 'Foundation Stage 1',  'KINDERGARTEN',    2,  'อ.1 (Foundation Stage 1)'),
  ('BRITISH', 'Early Years 2',       'KINDERGARTEN',    3,  'อ.2 (Early Years 2)'),
  ('BRITISH', 'Foundation Stage 2',  'KINDERGARTEN',    3,  'อ.2 (Foundation Stage 2)'),
  ('BRITISH', 'Reception',           'KINDERGARTEN',    3,  'อ.2 (Reception)'),
  ('BRITISH', 'Year 1',              'KINDERGARTEN',    4,  'อ.3 (Year 1)'),
  ('BRITISH', 'Year 2',              'PRIMARY',         5,  'ป.1 (Year 2)'),
  ('BRITISH', 'Year 3',              'PRIMARY',         6,  'ป.2 (Year 3)'),
  ('BRITISH', 'Year 4',              'PRIMARY',         7,  'ป.3 (Year 4)'),
  ('BRITISH', 'Year 5',              'PRIMARY',         8,  'ป.4 (Year 5)'),
  ('BRITISH', 'Year 6',              'PRIMARY',         9,  'ป.5 (Year 6)'),
  ('BRITISH', 'Year 7',              'PRIMARY',        10,  'ป.6 (Year 7)'),
  ('BRITISH', 'Year 8',              'LOWER_SECONDARY', 11, 'ม.1 (Year 8)'),
  ('BRITISH', 'Year 9',              'LOWER_SECONDARY', 12, 'ม.2 (Year 9)'),
  ('BRITISH', 'Year 10',             'LOWER_SECONDARY', 13, 'ม.3 (Year 10)'),
  ('BRITISH', 'Year 11',             'UPPER_SECONDARY', 14, 'ม.4 (Year 11)'),
  ('BRITISH', 'Year 12',             'UPPER_SECONDARY', 15, 'ม.5 (Year 12)'),
  ('BRITISH', 'Year 13',             'UPPER_SECONDARY', 16, 'ม.6 (Year 13)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── American Curriculum ───────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('AMERICAN', 'Pre-K 1',            'PRE_NURSERY',     0,  'เตรียมอนุบาล 1 (Pre-K 1)'),
  ('AMERICAN', 'Pre-K 2',            'PRE_NURSERY',     1,  'เตรียมอนุบาล 2 (Pre-K 2)'),
  ('AMERICAN', 'Pre-K',              'PRE_NURSERY',     1,  'เตรียมอนุบาล (Pre-K)'),
  ('AMERICAN', 'Pre-Kindergarten',   'PRE_NURSERY',     1,  'เตรียมอนุบาล (Pre-K)'),
  ('AMERICAN', 'Kindergarten 1',     'KINDERGARTEN',    2,  'อ.1 (KG 1)'),
  ('AMERICAN', 'KG 1',               'KINDERGARTEN',    2,  'อ.1 (KG 1)'),
  ('AMERICAN', 'Kindergarten 2',     'KINDERGARTEN',    3,  'อ.2 (KG 2)'),
  ('AMERICAN', 'KG 2',               'KINDERGARTEN',    3,  'อ.2 (KG 2)'),
  ('AMERICAN', 'Kindergarten',       'KINDERGARTEN',    4,  'อ.3 (Kindergarten)'),
  ('AMERICAN', 'KG',                 'KINDERGARTEN',    4,  'อ.3 (KG)'),
  ('AMERICAN', 'Grade 1',            'PRIMARY',         5,  'ป.1 (Grade 1)'),
  ('AMERICAN', 'Grade 2',            'PRIMARY',         6,  'ป.2 (Grade 2)'),
  ('AMERICAN', 'Grade 3',            'PRIMARY',         7,  'ป.3 (Grade 3)'),
  ('AMERICAN', 'Grade 4',            'PRIMARY',         8,  'ป.4 (Grade 4)'),
  ('AMERICAN', 'Grade 5',            'PRIMARY',         9,  'ป.5 (Grade 5)'),
  ('AMERICAN', 'Grade 6',            'PRIMARY',        10,  'ป.6 (Grade 6)'),
  ('AMERICAN', 'Grade 7',            'LOWER_SECONDARY', 11, 'ม.1 (Grade 7)'),
  ('AMERICAN', 'Grade 8',            'LOWER_SECONDARY', 12, 'ม.2 (Grade 8)'),
  ('AMERICAN', 'Grade 9',            'LOWER_SECONDARY', 13, 'ม.3 (Grade 9)'),
  ('AMERICAN', 'Grade 10',           'UPPER_SECONDARY', 14, 'ม.4 (Grade 10)'),
  ('AMERICAN', 'Grade 11',           'UPPER_SECONDARY', 15, 'ม.5 (Grade 11)'),
  ('AMERICAN', 'Grade 12',           'UPPER_SECONDARY', 16, 'ม.6 (Grade 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── IB Curriculum ────────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('IB', 'Pre-K',          'PRE_NURSERY',     0,  'เตรียมอนุบาล (Pre-K)'),
  ('IB', 'Pre-KG',         'PRE_NURSERY',     0,  'เตรียมอนุบาล (Pre-KG)'),
  ('IB', 'K1',             'KINDERGARTEN',    2,  'อ.1 (K1)'),
  ('IB', 'K2',             'KINDERGARTEN',    3,  'อ.2 (K2)'),
  ('IB', 'KG',             'KINDERGARTEN',    4,  'อ.3 (KG)'),
  ('IB', 'PYP Year 1',     'PRIMARY',         5,  'ป.1 (PYP Year 1)'),
  ('IB', 'PYP Year 2',     'PRIMARY',         6,  'ป.2 (PYP Year 2)'),
  ('IB', 'PYP Year 3',     'PRIMARY',         7,  'ป.3 (PYP Year 3)'),
  ('IB', 'PYP Year 4',     'PRIMARY',         8,  'ป.4 (PYP Year 4)'),
  ('IB', 'PYP Year 5',     'PRIMARY',         9,  'ป.5 (PYP Year 5)'),
  ('IB', 'MYP Year 6',     'PRIMARY',        10,  'ป.6 (MYP Year 6)'),
  ('IB', 'MYP Year 7',     'LOWER_SECONDARY', 11, 'ม.1 (MYP Year 7)'),
  ('IB', 'MYP Year 8',     'LOWER_SECONDARY', 12, 'ม.2 (MYP Year 8)'),
  ('IB', 'MYP Year 9',     'LOWER_SECONDARY', 13, 'ม.3 (MYP Year 9)'),
  ('IB', 'MYP Year 10',    'UPPER_SECONDARY', 14, 'ม.4 (MYP Year 10)'),
  ('IB', 'DP Year 11',     'UPPER_SECONDARY', 15, 'ม.5 (DP Year 11)'),
  ('IB', 'DP Year 12',     'UPPER_SECONDARY', 16, 'ม.6 (DP Year 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Singapore Curriculum ─────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('SINGAPORE', 'Nursery 1',      'PRE_NURSERY',     0,  'เตรียมอนุบาล 1 (Nursery 1)'),
  ('SINGAPORE', 'Nursery 2',      'PRE_NURSERY',     1,  'เตรียมอนุบาล 2 (Nursery 2)'),
  ('SINGAPORE', 'K1',             'KINDERGARTEN',    2,  'อ.1 (K1)'),
  ('SINGAPORE', 'K2',             'KINDERGARTEN',    3,  'อ.2 (K2)'),
  ('SINGAPORE', 'K3',             'KINDERGARTEN',    4,  'อ.3 (K3)'),
  ('SINGAPORE', 'Primary 1',      'PRIMARY',         5,  'ป.1 (Primary 1)'),
  ('SINGAPORE', 'Primary 2',      'PRIMARY',         6,  'ป.2 (Primary 2)'),
  ('SINGAPORE', 'Primary 3',      'PRIMARY',         7,  'ป.3 (Primary 3)'),
  ('SINGAPORE', 'Primary 4',      'PRIMARY',         8,  'ป.4 (Primary 4)'),
  ('SINGAPORE', 'Primary 5',      'PRIMARY',         9,  'ป.5 (Primary 5)'),
  ('SINGAPORE', 'Primary 6',      'PRIMARY',        10,  'ป.6 (Primary 6)'),
  ('SINGAPORE', 'Secondary 1',    'LOWER_SECONDARY', 11, 'ม.1 (Secondary 1)'),
  ('SINGAPORE', 'Secondary 2',    'LOWER_SECONDARY', 12, 'ม.2 (Secondary 2)'),
  ('SINGAPORE', 'Secondary 3',    'LOWER_SECONDARY', 13, 'ม.3 (Secondary 3)'),
  ('SINGAPORE', 'Secondary 4',    'UPPER_SECONDARY', 14, 'ม.4 (Secondary 4)'),
  ('SINGAPORE', 'JC 1',           'UPPER_SECONDARY', 15, 'ม.5 (JC 1)'),
  ('SINGAPORE', 'JC 2',           'UPPER_SECONDARY', 16, 'ม.6 (JC 2)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Canadian Curriculum ──────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('CANADIAN', 'Pre-K',        'PRE_NURSERY',     0,  'เตรียมอนุบาล (Pre-K)'),
  ('CANADIAN', 'Junior K',     'KINDERGARTEN',    2,  'อ.1 (Junior K)'),
  ('CANADIAN', 'Senior K',     'KINDERGARTEN',    3,  'อ.2 (Senior K)'),
  ('CANADIAN', 'Kindergarten', 'KINDERGARTEN',    4,  'อ.3 (Kindergarten)'),
  ('CANADIAN', 'Grade 1',      'PRIMARY',         5,  'ป.1 (Grade 1)'),
  ('CANADIAN', 'Grade 2',      'PRIMARY',         6,  'ป.2 (Grade 2)'),
  ('CANADIAN', 'Grade 3',      'PRIMARY',         7,  'ป.3 (Grade 3)'),
  ('CANADIAN', 'Grade 4',      'PRIMARY',         8,  'ป.4 (Grade 4)'),
  ('CANADIAN', 'Grade 5',      'PRIMARY',         9,  'ป.5 (Grade 5)'),
  ('CANADIAN', 'Grade 6',      'PRIMARY',        10,  'ป.6 (Grade 6)'),
  ('CANADIAN', 'Grade 7',      'LOWER_SECONDARY', 11, 'ม.1 (Grade 7)'),
  ('CANADIAN', 'Grade 8',      'LOWER_SECONDARY', 12, 'ม.2 (Grade 8)'),
  ('CANADIAN', 'Grade 9',      'LOWER_SECONDARY', 13, 'ม.3 (Grade 9)'),
  ('CANADIAN', 'Grade 10',     'UPPER_SECONDARY', 14, 'ม.4 (Grade 10)'),
  ('CANADIAN', 'Grade 11',     'UPPER_SECONDARY', 15, 'ม.5 (Grade 11)'),
  ('CANADIAN', 'Grade 12',     'UPPER_SECONDARY', 16, 'ม.6 (Grade 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Australian Curriculum ────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('AUSTRALIAN', 'Pre-K',        'PRE_NURSERY',     0,  'เตรียมอนุบาล (Pre-K)'),
  ('AUSTRALIAN', 'Kindy',        'KINDERGARTEN',    4,  'อ.3 (Kindy)'),
  ('AUSTRALIAN', 'Prep',         'KINDERGARTEN',    4,  'อ.3 (Prep)'),
  ('AUSTRALIAN', 'Year 1',       'PRIMARY',         5,  'ป.1 (Year 1)'),
  ('AUSTRALIAN', 'Year 2',       'PRIMARY',         6,  'ป.2 (Year 2)'),
  ('AUSTRALIAN', 'Year 3',       'PRIMARY',         7,  'ป.3 (Year 3)'),
  ('AUSTRALIAN', 'Year 4',       'PRIMARY',         8,  'ป.4 (Year 4)'),
  ('AUSTRALIAN', 'Year 5',       'PRIMARY',         9,  'ป.5 (Year 5)'),
  ('AUSTRALIAN', 'Year 6',       'PRIMARY',        10,  'ป.6 (Year 6)'),
  ('AUSTRALIAN', 'Year 7',       'LOWER_SECONDARY', 11, 'ม.1 (Year 7)'),
  ('AUSTRALIAN', 'Year 8',       'LOWER_SECONDARY', 12, 'ม.2 (Year 8)'),
  ('AUSTRALIAN', 'Year 9',       'LOWER_SECONDARY', 13, 'ม.3 (Year 9)'),
  ('AUSTRALIAN', 'Year 10',      'UPPER_SECONDARY', 14, 'ม.4 (Year 10)'),
  ('AUSTRALIAN', 'Year 11',      'UPPER_SECONDARY', 15, 'ม.5 (Year 11)'),
  ('AUSTRALIAN', 'Year 12',      'UPPER_SECONDARY', 16, 'ม.6 (Year 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── French Curriculum ────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('FRENCH', 'Petite Section',    'KINDERGARTEN',    2,  'อ.1 (Petite Section)'),
  ('FRENCH', 'Moyenne Section',   'KINDERGARTEN',    3,  'อ.2 (Moyenne Section)'),
  ('FRENCH', 'Grande Section',    'KINDERGARTEN',    4,  'อ.3 (Grande Section)'),
  ('FRENCH', 'CP',                'PRIMARY',         5,  'ป.1 (CP)'),
  ('FRENCH', 'CE1',               'PRIMARY',         6,  'ป.2 (CE1)'),
  ('FRENCH', 'CE2',               'PRIMARY',         7,  'ป.3 (CE2)'),
  ('FRENCH', 'CM1',               'PRIMARY',         8,  'ป.4 (CM1)'),
  ('FRENCH', 'CM2',               'PRIMARY',         9,  'ป.5 (CM2)'),
  ('FRENCH', '6ème',              'PRIMARY',        10,  'ป.6 (6ème)'),
  ('FRENCH', '5ème',              'LOWER_SECONDARY', 11, 'ม.1 (5ème)'),
  ('FRENCH', '4ème',              'LOWER_SECONDARY', 12, 'ม.2 (4ème)'),
  ('FRENCH', '3ème',              'LOWER_SECONDARY', 13, 'ม.3 (3ème)'),
  ('FRENCH', '2nde',              'UPPER_SECONDARY', 14, 'ม.4 (2nde)'),
  ('FRENCH', '1ère',              'UPPER_SECONDARY', 15, 'ม.5 (1ère)'),
  ('FRENCH', 'Terminale',         'UPPER_SECONDARY', 16, 'ม.6 (Terminale)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── German Curriculum ────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('GERMAN', 'Vorschule',     'KINDERGARTEN',    4,  'อ.3 (Vorschule)'),
  ('GERMAN', 'Klasse 1',      'PRIMARY',         5,  'ป.1 (Klasse 1)'),
  ('GERMAN', 'Klasse 2',      'PRIMARY',         6,  'ป.2 (Klasse 2)'),
  ('GERMAN', 'Klasse 3',      'PRIMARY',         7,  'ป.3 (Klasse 3)'),
  ('GERMAN', 'Klasse 4',      'PRIMARY',         8,  'ป.4 (Klasse 4)'),
  ('GERMAN', 'Klasse 5',      'PRIMARY',         9,  'ป.5 (Klasse 5)'),
  ('GERMAN', 'Klasse 6',      'PRIMARY',        10,  'ป.6 (Klasse 6)'),
  ('GERMAN', 'Klasse 7',      'LOWER_SECONDARY', 11, 'ม.1 (Klasse 7)'),
  ('GERMAN', 'Klasse 8',      'LOWER_SECONDARY', 12, 'ม.2 (Klasse 8)'),
  ('GERMAN', 'Klasse 9',      'LOWER_SECONDARY', 13, 'ม.3 (Klasse 9)'),
  ('GERMAN', 'Klasse 10',     'UPPER_SECONDARY', 14, 'ม.4 (Klasse 10)'),
  ('GERMAN', 'Klasse 11',     'UPPER_SECONDARY', 15, 'ม.5 (Klasse 11)'),
  ('GERMAN', 'Klasse 12',     'UPPER_SECONDARY', 16, 'ม.6 (Klasse 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Japanese Curriculum ──────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('JAPANESE', '年少',         'KINDERGARTEN',    2,  'อ.1 (年少 / Nenshō)'),
  ('JAPANESE', '年中',         'KINDERGARTEN',    3,  'อ.2 (年中 / Nenchū)'),
  ('JAPANESE', '年長',         'KINDERGARTEN',    4,  'อ.3 (年長 / Nenchō)'),
  ('JAPANESE', '小学1年',      'PRIMARY',         5,  'ป.1 (小学1年)'),
  ('JAPANESE', '小学2年',      'PRIMARY',         6,  'ป.2 (小学2年)'),
  ('JAPANESE', '小学3年',      'PRIMARY',         7,  'ป.3 (小学3年)'),
  ('JAPANESE', '小学4年',      'PRIMARY',         8,  'ป.4 (小学4年)'),
  ('JAPANESE', '小学5年',      'PRIMARY',         9,  'ป.5 (小学5年)'),
  ('JAPANESE', '小学6年',      'PRIMARY',        10,  'ป.6 (小学6年)'),
  ('JAPANESE', '中学1年',      'LOWER_SECONDARY', 11, 'ม.1 (中学1年)'),
  ('JAPANESE', '中学2年',      'LOWER_SECONDARY', 12, 'ม.2 (中学2年)'),
  ('JAPANESE', '中学3年',      'LOWER_SECONDARY', 13, 'ม.3 (中学3年)'),
  ('JAPANESE', '高校1年',      'UPPER_SECONDARY', 14, 'ม.4 (高校1年)'),
  ('JAPANESE', '高校2年',      'UPPER_SECONDARY', 15, 'ม.5 (高校2年)'),
  ('JAPANESE', '高校3年',      'UPPER_SECONDARY', 16, 'ม.6 (高校3年)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Chinese Curriculum ───────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('CHINESE', '小班',         'KINDERGARTEN',    2,  'อ.1 (小班 / Xiǎo bān)'),
  ('CHINESE', '中班',         'KINDERGARTEN',    3,  'อ.2 (中班 / Zhōng bān)'),
  ('CHINESE', '大班',         'KINDERGARTEN',    4,  'อ.3 (大班 / Dà bān)'),
  ('CHINESE', '一年级',       'PRIMARY',         5,  'ป.1 (一年级)'),
  ('CHINESE', '二年级',       'PRIMARY',         6,  'ป.2 (二年级)'),
  ('CHINESE', '三年级',       'PRIMARY',         7,  'ป.3 (三年级)'),
  ('CHINESE', '四年级',       'PRIMARY',         8,  'ป.4 (四年级)'),
  ('CHINESE', '五年级',       'PRIMARY',         9,  'ป.5 (五年级)'),
  ('CHINESE', '六年级',       'PRIMARY',        10,  'ป.6 (六年级)'),
  ('CHINESE', '初一',         'LOWER_SECONDARY', 11, 'ม.1 (初一)'),
  ('CHINESE', '初二',         'LOWER_SECONDARY', 12, 'ม.2 (初二)'),
  ('CHINESE', '初三',         'LOWER_SECONDARY', 13, 'ม.3 (初三)'),
  ('CHINESE', '高一',         'UPPER_SECONDARY', 14, 'ม.4 (高一)'),
  ('CHINESE', '高二',         'UPPER_SECONDARY', 15, 'ม.5 (高二)'),
  ('CHINESE', '高三',         'UPPER_SECONDARY', 16, 'ม.6 (高三)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Indian Curriculum (CBSE/ICSE) ────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('INDIAN', 'Nursery',       'PRE_NURSERY',     1,  'เตรียมอนุบาล (Nursery)'),
  ('INDIAN', 'LKG',           'KINDERGARTEN',    2,  'อ.1 (LKG)'),
  ('INDIAN', 'UKG',           'KINDERGARTEN',    3,  'อ.2 (UKG)'),
  ('INDIAN', 'KG',            'KINDERGARTEN',    4,  'อ.3 (KG)'),
  ('INDIAN', 'Class 1',       'PRIMARY',         5,  'ป.1 (Class 1)'),
  ('INDIAN', 'Class 2',       'PRIMARY',         6,  'ป.2 (Class 2)'),
  ('INDIAN', 'Class 3',       'PRIMARY',         7,  'ป.3 (Class 3)'),
  ('INDIAN', 'Class 4',       'PRIMARY',         8,  'ป.4 (Class 4)'),
  ('INDIAN', 'Class 5',       'PRIMARY',         9,  'ป.5 (Class 5)'),
  ('INDIAN', 'Class 6',       'PRIMARY',        10,  'ป.6 (Class 6)'),
  ('INDIAN', 'Class 7',       'LOWER_SECONDARY', 11, 'ม.1 (Class 7)'),
  ('INDIAN', 'Class 8',       'LOWER_SECONDARY', 12, 'ม.2 (Class 8)'),
  ('INDIAN', 'Class 9',       'LOWER_SECONDARY', 13, 'ม.3 (Class 9)'),
  ('INDIAN', 'Class 10',      'UPPER_SECONDARY', 14, 'ม.4 (Class 10)'),
  ('INDIAN', 'Class 11',      'UPPER_SECONDARY', 15, 'ม.5 (Class 11)'),
  ('INDIAN', 'Class 12',      'UPPER_SECONDARY', 16, 'ม.6 (Class 12)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Korean Curriculum ────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('KOREAN', '유치원 1',       'KINDERGARTEN',    2,  'อ.1 (유치원 1)'),
  ('KOREAN', '유치원 2',       'KINDERGARTEN',    3,  'อ.2 (유치원 2)'),
  ('KOREAN', '유치원 3',       'KINDERGARTEN',    4,  'อ.3 (유치원 3)'),
  ('KOREAN', '초등 1',         'PRIMARY',         5,  'ป.1 (초등 1)'),
  ('KOREAN', '초등 2',         'PRIMARY',         6,  'ป.2 (초등 2)'),
  ('KOREAN', '초등 3',         'PRIMARY',         7,  'ป.3 (초등 3)'),
  ('KOREAN', '초등 4',         'PRIMARY',         8,  'ป.4 (초등 4)'),
  ('KOREAN', '초등 5',         'PRIMARY',         9,  'ป.5 (초등 5)'),
  ('KOREAN', '초등 6',         'PRIMARY',        10,  'ป.6 (초등 6)'),
  ('KOREAN', '중등 1',         'LOWER_SECONDARY', 11, 'ม.1 (중등 1)'),
  ('KOREAN', '중등 2',         'LOWER_SECONDARY', 12, 'ม.2 (중등 2)'),
  ('KOREAN', '중등 3',         'LOWER_SECONDARY', 13, 'ม.3 (중등 3)'),
  ('KOREAN', '고등 1',         'UPPER_SECONDARY', 14, 'ม.4 (고등 1)'),
  ('KOREAN', '고등 2',         'UPPER_SECONDARY', 15, 'ม.5 (고등 2)'),
  ('KOREAN', '고등 3',         'UPPER_SECONDARY', 16, 'ม.6 (고등 3)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Montessori ───────────────────────────────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('MONTESSORI', 'Toddler',           'PRE_NURSERY',  0,  'เตรียมอนุบาล (Toddler)'),
  ('MONTESSORI', 'Primary (Casa)',     'KINDERGARTEN', 2,  'อ.1–อ.3 (Primary / Casa)'),
  ('MONTESSORI', 'Lower Elementary',   'PRIMARY',      5,  'ป.1–ป.3 (Lower Elementary)'),
  ('MONTESSORI', 'Upper Elementary',   'PRIMARY',      8,  'ป.4–ป.6 (Upper Elementary)'),
  ('MONTESSORI', 'Middle School',      'LOWER_SECONDARY', 11, 'ม.1–ม.3 (Middle School)'),
  ('MONTESSORI', 'High School',        'UPPER_SECONDARY', 14, 'ม.4–ม.6 (High School)')
on conflict (curriculum_code, source_grade) do nothing;

-- ── Thai MOE (หลักสูตรกระทรวงศึกษาธิการ) ─────────────────────────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('THAI_MOE', 'เตรียมอนุบาล',        'PRE_NURSERY',   0,  'เตรียมอนุบาล'),
  ('THAI_MOE', 'อนุบาล 1',           'KINDERGARTEN',    2,  'อ.1'),
  ('THAI_MOE', 'อนุบาล 2',           'KINDERGARTEN',    3,  'อ.2'),
  ('THAI_MOE', 'อนุบาล 3',           'KINDERGARTEN',    4,  'อ.3'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 1',   'PRIMARY',         5,  'ป.1'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 2',   'PRIMARY',         6,  'ป.2'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 3',   'PRIMARY',         7,  'ป.3'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 4',   'PRIMARY',         8,  'ป.4'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 5',   'PRIMARY',         9,  'ป.5'),
  ('THAI_MOE', 'ประถมศึกษาปีที่ 6',   'PRIMARY',        10,  'ป.6'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 1',   'LOWER_SECONDARY', 11, 'ม.1'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 2',   'LOWER_SECONDARY', 12, 'ม.2'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 3',   'LOWER_SECONDARY', 13, 'ม.3'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 4',   'UPPER_SECONDARY', 14, 'ม.4'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 5',   'UPPER_SECONDARY', 15, 'ม.5'),
  ('THAI_MOE', 'มัธยมศึกษาปีที่ 6',   'UPPER_SECONDARY', 16, 'ม.6')
on conflict (curriculum_code, source_grade) do nothing;

-- ── OTHER (Fallback สำหรับหลักสูตรที่ไม่อยู่ในรายการข้างบน) ──────────────────────
insert into school_data.grade_level_aliases (curriculum_code, source_grade, level_code, order_index, display_name) values
  ('OTHER', 'Pre-K',         'PRE_NURSERY',     0,  'เตรียมอนุบาล (Pre-K)'),
  ('OTHER', 'Kindergarten',  'KINDERGARTEN',    4,  'อ.3 (Kindergarten)'),
  ('OTHER', 'Grade 1',       'PRIMARY',         5,  'ป.1 (Grade 1)'),
  ('OTHER', 'Grade 2',       'PRIMARY',         6,  'ป.2 (Grade 2)'),
  ('OTHER', 'Grade 3',       'PRIMARY',         7,  'ป.3 (Grade 3)'),
  ('OTHER', 'Grade 4',       'PRIMARY',         8,  'ป.4 (Grade 4)'),
  ('OTHER', 'Grade 5',       'PRIMARY',         9,  'ป.5 (Grade 5)'),
  ('OTHER', 'Grade 6',       'PRIMARY',        10,  'ป.6 (Grade 6)'),
  ('OTHER', 'Grade 7',       'LOWER_SECONDARY', 11, 'ม.1 (Grade 7)'),
  ('OTHER', 'Grade 8',       'LOWER_SECONDARY', 12, 'ม.2 (Grade 8)'),
  ('OTHER', 'Grade 9',       'LOWER_SECONDARY', 13, 'ม.3 (Grade 9)'),
  ('OTHER', 'Grade 10',      'UPPER_SECONDARY', 14, 'ม.4 (Grade 10)'),
  ('OTHER', 'Grade 11',      'UPPER_SECONDARY', 15, 'ม.5 (Grade 11)'),
  ('OTHER', 'Grade 12',      'UPPER_SECONDARY', 16, 'ม.6 (Grade 12)')
on conflict (curriculum_code, source_grade) do nothing;
