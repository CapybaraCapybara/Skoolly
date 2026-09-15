-- =============================================================================
-- Migration: จัดฐานข้อมูลให้ตรงกับ Use Case Spec v6.5
-- ใช้กับฐานข้อมูลที่ "เคยรัน db/schema.sql รุ่นก่อนหน้าไปแล้ว" เท่านั้น
-- ถ้าเป็นฐานข้อมูลเปล่า ให้รัน db/schema.sql ตรง ๆ ไฟล์เดียวพอ ไม่ต้องรันไฟล์นี้
--
-- รันทั้งไฟล์ในธุรกรรมเดียว: psql "$DATABASE_URL" -1 -f db/migrations/2026-09-15_v65_alignment.sql
-- =============================================================================

begin;

-- ── 1. schools: คอลัมน์ใหม่ + ยุบ social 4 คอลัมน์เป็น jsonb ───────────────────
alter table school_data.schools
  add column if not exists google_place_id text,
  add column if not exists social_links    jsonb not null default '{}'::jsonb,
  -- ชุด ISAT: เดิมถูกสร้างโดย enrich_from_isat.py ตอนรัน ทำให้ไม่อยู่ใน schema.sql
  add column if not exists is_isat_member   boolean not null default false,
  add column if not exists is_boarding      boolean not null default false,
  add column if not exists year_established int,
  add column if not exists accreditations   text[] not null default '{}',
  add column if not exists isat_school_name text;

-- ย้ายข้อมูลเดิมเข้า jsonb ก่อนลบคอลัมน์ (เก็บเฉพาะคีย์ที่มีค่าจริง)
update school_data.schools
set social_links = coalesce(social_links, '{}'::jsonb)
  || case when nullif(facebook_url,  '') is not null then jsonb_build_object('facebook',  facebook_url)  else '{}'::jsonb end
  || case when nullif(line_id,       '') is not null then jsonb_build_object('line_id',   line_id)       else '{}'::jsonb end
  || case when nullif(instagram_url, '') is not null then jsonb_build_object('instagram', instagram_url) else '{}'::jsonb end
  || case when nullif(youtube_url,   '') is not null then jsonb_build_object('youtube',   youtube_url)   else '{}'::jsonb end
where facebook_url is not null or line_id is not null
   or instagram_url is not null or youtube_url is not null;

alter table school_data.schools
  drop column if exists facebook_url,
  drop column if exists line_id,
  drop column if exists instagram_url,
  drop column if exists youtube_url;

-- ── 2. lookup: alias ของหลักสูตร + ตารางระดับชั้น ────────────────────────────
alter table school_data.curriculums
  add column if not exists aliases text[] not null default '{}';

create table if not exists school_data.grade_levels (
  code       text primary key,
  name_th    text not null,
  name_en    text not null,
  sort_order int  not null default 100,
  aliases    text[] not null default '{}'
);


-- ── 3. รีวิว: เลิกเก็บรีวิวของผู้ใช้ เปลี่ยนเป็น cache จาก Google (UC-02) ────────
create table if not exists school_data.school_google_reviews (
  school_id       uuid primary key references school_data.schools(school_id) on delete cascade,
  google_place_id text not null,
  rating_avg      numeric(2,1),
  review_count    int not null default 0,
  payload         jsonb not null,
  attribution_url text not null,
  fetched_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists google_reviews_expiry_idx
  on school_data.school_google_reviews (expires_at);

-- ⚠️ ลบตารางรีวิวเดิม — ถ้ามีรีวิวของผู้ใช้จริงอยู่และยังอยากเก็บ
--    ให้ comment 3 บรรทัดนี้ออกแล้ว export ข้อมูลเก็บไว้ก่อน
drop table if exists community.reviews cascade;
drop type  if exists community.review_status;

-- ── 4. เลิกใช้ view ที่ไม่มีโค้ดไหนเรียก ──────────────────────────────────────
drop view if exists school_data.school_curriculums;
drop view if exists school_data.school_levels;

-- ── 5. AI: บันทึกว่าข้อความมาจากกดปุ่มหรือพิมพ์เอง (UC-08 v6.5) ────────────────
alter table ai.messages
  add column if not exists entry_mode text;
alter table ai.messages
  drop constraint if exists messages_entry_mode_check;
alter table ai.messages
  add constraint messages_entry_mode_check
  check (entry_mode is null or entry_mode in ('guided','quick_reply','free_text'));

commit;

-- หลังรันเสร็จ: ตัวนับ like_count / comment_count / report_count จะถูก sync
-- อัตโนมัติด้วย trigger ในหัวข้อ 14 ของ db/schema.sql — รัน schema.sql ซ้ำอีกครั้ง
-- เพื่อสร้าง trigger ชุดนั้น (ทั้งไฟล์เป็น idempotent ปลอดภัยที่จะรันซ้ำ)


-- =============================================================================
-- ภาคผนวก: รวมคำศัพท์ของ curriculums / levels_offered ให้เป็นชุดเดียว
-- =============================================================================
-- เดิมคอลัมน์ทั้งสองเก็บ "ข้อความไทย" ที่ pipeline สร้างขึ้น ส่วนตาราง lookup
-- เก็บรหัส ASCII จึง join กันไม่ได้เลยและตัวกรองหน้าเว็บก็แมตช์ไม่ได้
-- ตั้งแต่ v6.5 DB เก็บ "รหัส" เป็นคำศัพท์กลาง แล้ว API แปลงกลับเป็นข้อความไทยตอนส่งออก
-- (หน้าเว็บจึงไม่ต้องแก้) — ขั้นนี้แปลงข้อมูลเดิมที่ยังเป็นข้อความไทย

begin;

-- ต้อง seed คำศัพท์กลางให้ครบก่อน แล้วค่อยแปลงข้อมูลเดิม
-- seed หลักสูตร: code ต้องตรงกับ CURRICULUM_PATTERNS ใน supabase_sync.py
-- name_th คือข้อความที่ผู้ใช้เห็น (API แปลง code → name_th ให้ก่อนส่งออก)
insert into school_data.curriculums (code, name_th, name_en, sort_order) values
  ('BRITISH', 'สหราชอาณาจักร (British)', 'British', 10),
  ('AMERICAN', 'สหรัฐอเมริกา (American)', 'American', 20),
  ('IB', 'นานาชาติ IB (International Baccalaureate)', 'International Baccalaureate', 30),
  ('SINGAPOREAN', 'สิงคโปร์ (Singapore)', 'Singapore', 40),
  ('AUSTRALIAN', 'ออสเตรเลีย (Australian)', 'Australian', 50),
  ('CANADIAN', 'แคนาดา (Canadian)', 'Canadian', 60),
  ('FRENCH', 'ฝรั่งเศส (French)', 'French', 70),
  ('GERMAN', 'เยอรมัน (German)', 'German', 80),
  ('JAPANESE', 'ญี่ปุ่น (Japanese)', 'Japanese', 90),
  ('CHINESE', 'จีน (Chinese)', 'Chinese', 100),
  ('KOREAN', 'เกาหลี (Korean)', 'Korean', 110),
  ('INDIAN', 'อินเดีย (Indian)', 'Indian', 120),
  ('MONTESSORI', 'มอนเตสซอรี (Montessori)', 'Montessori', 130),
  ('FINNISH', 'ฟินแลนด์ (Finnish)', 'Finnish', 140),
  ('EARLY_CHILDHOOD', 'ปฐมวัยสากล (Early Childhood / IPC)', 'Early Childhood / IPC', 150),
  ('THAI_MOE', 'ไทย (กระทรวงศึกษาธิการ)', 'กระทรวงศึกษาธิการ', 160),
  ('SCHOOL_SPECIFIC', 'หลักสูตรเฉพาะของโรงเรียน', 'School Specific', 170)
on conflict (code) do update set name_th = excluded.name_th, name_en = excluded.name_en, sort_order = excluded.sort_order;

-- seed ระดับชั้น: code ต้องตรงกับ GRADE_LEVEL_MAP ใน supabase_sync.py
insert into school_data.grade_levels (code, name_th, name_en, sort_order, aliases) values
  ('PRE_K',        'ก่อนอนุบาล',        'Pre-Kindergarten', 10, '{ก่อนอนุบาล,เตรียมอนุบาล,เนอสเซอรี่,Nursery,Pre-K}'),
  ('KINDERGARTEN', 'อนุบาล',            'Kindergarten',     20, '{อนุบาล,Kindergarten,Early Years}'),
  ('PRIMARY',      'ประถมศึกษา',         'Primary',          30, '{ประถมศึกษา,ประถม,Primary,Elementary}'),
  ('LOWER_SEC',    'มัธยมศึกษาตอนต้น',   'Lower Secondary',  40, '{มัธยมศึกษาตอนต้น,ม.ต้น,Lower Secondary,Middle School}'),
  ('UPPER_SEC',    'มัธยมศึกษาตอนปลาย',  'Upper Secondary',  50, '{มัธยมศึกษาตอนปลาย,ม.ปลาย,Upper Secondary,High School}')
on conflict (code) do update set
  name_th = excluded.name_th, name_en = excluded.name_en,
  sort_order = excluded.sort_order, aliases = excluded.aliases;

update school_data.schools s
set curriculums = coalesce((
      select array_agg(distinct l.code order by l.code)
      from unnest(s.curriculums) raw
      join school_data.curriculums l on l.name_th = raw or raw = any(l.aliases)
    ), '{}')
where exists (
  select 1 from unnest(s.curriculums) raw
  where not exists (select 1 from school_data.curriculums l where l.code = raw)
);

update school_data.schools s
set levels_offered = coalesce((
      select array_agg(distinct g.code order by g.code)
      from unnest(s.levels_offered) raw
      join school_data.grade_levels g on g.name_th = raw or raw = any(g.aliases)
    ), '{}')
where exists (
  select 1 from unnest(s.levels_offered) raw
  where not exists (select 1 from school_data.grade_levels g where g.code = raw)
);

commit;

-- ตรวจผลหลังรัน: ทั้งสองคิวรีนี้ต้องคืน 0 แถว
--   select school_id, curriculums from school_data.schools s
--    where exists (select 1 from unnest(s.curriculums) c
--                   where not exists (select 1 from school_data.curriculums l where l.code = c));
--   select school_id, levels_offered from school_data.schools s
--    where exists (select 1 from unnest(s.levels_offered) v
--                   where not exists (select 1 from school_data.grade_levels g where g.code = v));


-- =============================================================================
-- ภาคผนวก 2: ผลการตรวจ schema/code รอบละเอียด (v6.6)
-- =============================================================================
-- แก้ปัญหาที่เป็น data-integrity risk ไม่ใช่แค่เรื่องความสวยงาม
-- ส่วน trigger / constraint / index ใหม่ทั้งหมดอยู่ใน db/schema.sql (หัวข้อ 17-20)
-- ซึ่งเป็น idempotent — รัน schema.sql ซ้ำหลังไฟล์นี้ได้เลย

begin;

-- ── 1. เก็บกวาดค่าที่อาจไม่ผ่าน CHECK ใหม่ก่อนเพิ่ม constraint ────────────────
update school_data.schools set rating_avg = null   where rating_avg   is not null and (rating_avg < 0 or rating_avg > 5);
update school_data.schools set review_count = 0    where review_count < 0;
update school_data.schools set student_count = null where student_count is not null and student_count < 0;
update school_data.schools set teacher_count = null where teacher_count is not null and teacher_count < 0;
update community.forum_posts    set like_count = 0, comment_count = 0 where like_count < 0 or comment_count < 0;
update community.forum_comments set like_count = 0 where like_count < 0;

-- ── 2. ปรับ log ให้เป็น bigint identity (append-only ปริมาณสูง) ───────────────
-- log_id ไม่ถูกอ้างจากที่ไหนเลย จึงสร้างใหม่ได้ปลอดภัย
alter table school_data.school_scrape_log drop constraint if exists school_scrape_log_pkey;
alter table school_data.school_scrape_log drop column if exists log_id;
alter table school_data.school_scrape_log
  add column log_id bigint generated always as identity primary key;

-- ── 3. ตัด GIN บน data_snapshot ที่ยังไม่มีคิวรีไหนใช้ ────────────────────────
drop index if exists school_data.versions_snapshot_gin;

commit;

-- ── 4. (ทำหลัง commit) ซิงก์ตัวนับที่เคยเพี้ยนเพราะไม่มี trigger ──────────────
update community.forum_posts p set
  like_count    = (select count(*) from community.forum_likes l
                    where l.target_type = 'post' and l.target_id = p.post_id),
  comment_count = (select count(*) from community.forum_comments c
                    where c.post_id = p.post_id and c.status = 'approved' and c.deleted_by_author = false);

update community.forum_comments c set
  like_count = (select count(*) from community.forum_likes l
                 where l.target_type = 'comment' and l.target_id = c.comment_id);

update community.data_correction_reports r set
  report_count = (select count(*) from community.report_submissions s where s.report_id = r.report_id);

-- ── 5. เก็บกวาด like/report ที่ชี้เนื้อหาซึ่งถูกลบไปแล้ว ─────────────────────
delete from community.forum_likes l
 where (l.target_type = 'post'    and not exists (select 1 from community.forum_posts    p where p.post_id    = l.target_id))
    or (l.target_type = 'comment' and not exists (select 1 from community.forum_comments c where c.comment_id = l.target_id));
delete from community.forum_reports r
 where (r.target_type = 'post'    and not exists (select 1 from community.forum_posts    p where p.post_id    = r.target_id))
    or (r.target_type = 'comment' and not exists (select 1 from community.forum_comments c where c.comment_id = r.target_id));

-- ── 6. Optimistic Locking ของ UC-11 E1 (เดิมประกาศไว้แต่ไม่มีคอลัมน์รองรับ) ───
alter table school_data.schools
  add column if not exists row_version int not null default 1;
