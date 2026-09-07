-- =============================================================================
-- Skoolly — Database Schema (Postgres / Supabase)
-- =============================================================================
-- ออกแบบจาก:
--   - reference/use_case_specification_final_v6.md  (UC-G01..G08, U01..U09, A01..A12)
--   - reference/system_architecture_explained_v6.md (Schema-per-Service, Golden Rule)
--   - ข้อมูลจริงในโปรเจกต์: data/international_schools_thailand_opec.json (291 โรง)
--     และผลลัพธ์ scraper (tuition_by_grade / hidden_costs / safety_and_security)
--
-- รันตามลำดับไฟล์นี้ได้เลย (idempotent เท่าที่ Postgres อนุญาต)
-- เอกสารเหตุผลการออกแบบ: db/DATABASE_DESIGN.md
-- =============================================================================


-- =============================================================================
-- 0. EXTENSIONS
-- =============================================================================
-- บน Supabase ให้ติดตั้งผ่าน Dashboard > Database > Extensions หรือรัน SQL นี้ตรงๆ
create extension if not exists postgis;      -- แผนที่/ระยะทาง (UC-G01, UC-G03)
create extension if not exists vector;       -- pgvector สำหรับ RAG (UC-A07)
create extension if not exists pg_trgm;      -- fuzzy search ชื่อโรงเรียน (รองรับภาษาไทย)
create extension if not exists unaccent;     -- normalize ตัวอักษรก่อน match
create extension if not exists pg_cron;      -- monthly re-scrape + account-deletion-cron
create extension if not exists pg_net;       -- ให้ Database Webhook ยิง HTTP ออกได้


-- =============================================================================
-- 1. SCHEMAS — 1 schema ต่อ 1 Service (Schema-per-Service ตาม Architecture หัวข้อ 4)
-- =============================================================================
create schema if not exists school_data;   -- School Data Service
create schema if not exists community;     -- Community Service
create schema if not exists user_data;     -- User Service
create schema if not exists ai;            -- AI Service
create schema if not exists ops;           -- Ops Service


-- =============================================================================
-- 2. ENUM TYPES
-- =============================================================================
do $$ begin
  create type school_data.school_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type school_data.version_status as enum
    ('pending_review', 'approved', 'rejected', 'published', 'superseded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type school_data.source_type as enum
    ('admin', 'scraper', 'bulk_import', 'opec_import');
exception when duplicate_object then null; end $$;

-- สะท้อน status จริงที่ scraper_service.py คืนมา (ok / no tuition / blocked / error)
do $$ begin
  create type school_data.scrape_status as enum
    ('ok', 'no_tuition_found', 'nav_failed', 'blocked', 'timeout', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type school_data.fee_frequency as enum
    ('once', 'per_year', 'per_term', 'per_month', 'conditional', 'unknown');
exception when duplicate_object then null; end $$;

-- รีวิวใช้ Pre-Moderation → default 'pending'
do $$ begin
  create type community.review_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type community.report_status as enum
    ('open', 'resolved_no_change', 'resolved_changed');
exception when duplicate_object then null; end $$;

-- ฟอรัมใช้ Post-Moderation (UC-U09 Business Rule) → default 'approved'
-- แยก type จาก review_status เพราะความหมายของค่า default ต่างกันคนละขั้ว
do $$ begin
  create type community.content_status as enum ('approved', 'pending', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type community.forum_report_status as enum ('open', 'dismissed', 'actioned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type community.forum_target as enum ('post', 'comment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type community.forum_category as enum ('Review', 'Question', 'Update', 'Tips');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_data.account_status as enum
    ('active', 'suspended', 'pending_deletion', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ops.actor_type as enum ('admin', 'system', 'user');
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 3. SCHOOL DATA SERVICE  (schema: school_data)
-- =============================================================================

-- ── 3.1 Lookup: หลักสูตร ──────────────────────────────────────────────────────
-- จำเป็นเพราะข้อมูล OPEC จริงเก็บ curriculums เป็น free-text array ภาษาไทยที่ไม่ normalize
-- (เช่น "หลักสูตรสหรัฐอเมริกา", "หลักสูตรราชอาณาจักร", "IB", "IGCSE and A-Level")
-- ถ้าไม่มีตารางนี้ ตัวกรอง "หลักสูตร" ของ UC-G01 จะกรองไม่ได้จริง
create table if not exists school_data.curriculums (
  code           text primary key,              -- BRITISH / AMERICAN / IB / SINGAPORE / ...
  name_th        text not null,
  name_en        text not null,
  sort_order     int  not null default 100
);

-- map ข้อความดิบจาก OPEC → รหัสหลักสูตรมาตรฐาน (เติมได้เรื่อยๆ เมื่อเจอรูปแบบใหม่)
create table if not exists school_data.curriculum_aliases (
  raw_text        text primary key,
  curriculum_code text not null references school_data.curriculums(code),
  created_at      timestamptz not null default now()
);

-- ── 3.2 Lookup: ระดับชั้น ─────────────────────────────────────────────────────
-- OPEC เก็บเป็น array ไทย: เตรียมอนุบาล / อนุบาล / ประถมศึกษา / มัธยมศึกษาตอนต้น / ตอนปลาย
create table if not exists school_data.grade_levels (
  code        text primary key,   -- PRE_K / KINDERGARTEN / PRIMARY / LOWER_SEC / UPPER_SEC
  name_th     text not null,
  name_en     text not null,
  sort_order  int  not null
);

create table if not exists school_data.grade_level_aliases (
  raw_text   text primary key,
  level_code text not null references school_data.grade_levels(code)
);

-- ── 3.3 schools — pointer เบาๆ + read model สำหรับหน้าค้นหา ────────────────────
create table if not exists school_data.schools (
  school_id                     uuid primary key default gen_random_uuid(),

  -- natural key จาก OPEC ทำให้ re-import ซ้ำได้แบบ idempotent (UC-A02 E5)
  opec_school_code              text unique,
  slug                          text unique not null,

  name_th                       text not null,
  name_en                       text,

  status                        school_data.school_status not null default 'active',
  current_published_version_id  uuid,  -- FK เพิ่มท้ายไฟล์ (circular reference)

  -- แหล่งข้อมูล (UC-A02: URL ต้องผ่าน Admin ยืนยัน ≥1 ครั้งก่อน scrape จริง)
  official_website_url          text,
  website_source                text,                      -- 'OPEC Profile' / 'Serper' / 'admin'
  website_confirmed_at          timestamptz,
  website_confirmed_by          uuid,
  opec_profile_url              text,

  -- ติดต่อ / โซเชียล (มีจริงใน dataset แต่ fill rate ต่ำ จึง nullable ทั้งหมด)
  official_phone                text,
  official_mobile               text,
  official_email                text,
  facebook_url                  text,
  line_id                       text,
  instagram_url                 text,
  youtube_url                   text,

  -- ที่ตั้ง
  province                      text not null,
  district                      text,
  subdistrict                   text,
  address                       text,
  geom                          geography(Point, 4326),     -- lat/lng ครบ 291/291 ใน dataset
  gps_precision                 text,                       -- 'Exact' | 'Approximate' | 'None'
  gps_source                    text,

  logo_url                      text,
  level_range                   text,                       -- ข้อความสรุป เช่น "อนุบาล - ประถมศึกษา"
  student_count                 int,
  teacher_count                 int,

  -- ── Read model: projection จากเวอร์ชันที่ published อยู่ ─────────────────────
  -- อัปเดตใน transaction เดียวกับตอน publish (Architecture หัวข้อ 8.5)
  -- มีไว้เพื่อให้ UC-G01 กรอง/เรียงได้ด้วย index ปกติ ไม่ต้อง query เข้าไปใน JSONB
  pub_tuition_min_thb           numeric(12,2),
  pub_tuition_max_thb           numeric(12,2),
  pub_has_safeguarding_policy   boolean,
  pub_data_updated_at           timestamptz,                -- "ข้อมูลเปลี่ยนแปลงล่าสุด" (มิติ 1)

  -- สรุปรีวิว (denormalize เพื่อเลี่ยง join ข้าม schema ตอนแสดงผลค้นหา)
  rating_avg                    numeric(2,1),
  review_count                  int not null default 0,

  last_verified_at              timestamptz,                -- "ตรวจสอบล่าสุด" (มิติ 1, UC-A03 step 5)
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create table if not exists school_data.school_curriculums (
  school_id       uuid not null references school_data.schools(school_id) on delete cascade,
  curriculum_code text not null references school_data.curriculums(code),
  primary key (school_id, curriculum_code)
);

create table if not exists school_data.school_levels (
  school_id  uuid not null references school_data.schools(school_id) on delete cascade,
  level_code text not null references school_data.grade_levels(code),
  primary key (school_id, level_code)
);

-- ── 3.4 school_versions — log แบบ full snapshot ต่อเวอร์ชัน ────────────────────
create table if not exists school_data.school_versions (
  version_id           uuid primary key default gen_random_uuid(),
  school_id            uuid not null references school_data.schools(school_id) on delete cascade,
  version_number       int  not null,
  parent_version_id    uuid references school_data.school_versions(version_id),

  status               school_data.version_status not null default 'pending_review',
  source_type          school_data.source_type    not null,

  -- provenance ดิบจาก scraper (เก็บ payload ที่ AI คืนมาทั้งก้อนไว้ตรวจย้อนหลัง/rollback)
  data_snapshot        jsonb not null,
  diff_summary         jsonb,

  confidence_score     real,          -- มีความหมายเฉพาะ source_type='scraper'
  confidence_reasoning text,          -- scraper คืนมาจริง ใช้โชว์ใน Diff View (UC-A04)
  scraped_page_url     text,

  submitted_by         uuid,
  submitted_at         timestamptz not null default now(),
  reviewed_by          uuid,
  reviewed_at          timestamptz,
  rejection_reason     text,

  created_at           timestamptz not null default now(),

  constraint school_versions_number_uniq unique (school_id, version_number)
);

-- ── 3.5 ค่าเทอมแยกตามระดับชั้น (normalize ออกจาก JSONB) ────────────────────────
-- เหตุผล: (1) numeric ป้องกัน float error ของ UC-U04 E4  (2) หัวข้อ 7.3 บังคับให้
-- academic_year / source_published_at กำกับใน "ระดับฟิลด์" ไม่ใช่ระดับเวอร์ชัน
create table if not exists school_data.version_fees (
  fee_id              uuid primary key default gen_random_uuid(),
  version_id          uuid not null references school_data.school_versions(version_id) on delete cascade,

  grade_label         text not null,          -- ข้อความดิบจากเว็บ เช่น "Year 7 - Year 9"
  level_code          text references school_data.grade_levels(code),  -- map แล้ว (nullable)

  annual_thb          numeric(12,2),
  semester_thb        numeric(12,2),
  currency            char(3) not null default 'THB',

  academic_year       text,                   -- มิติ 3: "2568" / "2026/27"
  source_published_at date,                   -- มิติ 2: ต้นฉบับอัปเดตเมื่อไหร่ (nullable เสมอ)
  source_url          text,
  confidence_score    real,
  notes               text,

  constraint version_fees_has_amount
    check (annual_thb is not null or semester_thb is not null or notes is not null)
);

-- ── 3.6 ค่าใช้จ่ายแฝง (hidden_costs) ──────────────────────────────────────────
create table if not exists school_data.version_extra_fees (
  extra_fee_id        uuid primary key default gen_random_uuid(),
  version_id          uuid not null references school_data.school_versions(version_id) on delete cascade,

  name                text not null,          -- "Application Fee", "Entrance Fee (First Child)"
  amount_thb          numeric(12,2),          -- null ได้ ถ้าเว็บไม่ระบุตัวเลข (UC-U04 E1)
  frequency           school_data.fee_frequency not null default 'unknown',
  refundable          boolean,
  sibling_related     boolean not null default false,  -- รองรับส่วนลดพี่น้องใน UC-U04

  academic_year       text,
  source_published_at date,
  notes               text
);

-- ── 3.7 ความปลอดภัย/นโยบายคุ้มครองเด็ก (Use Case doc หัวข้อ 7.10) ─────────────
-- ผูกกับ version_id ไม่ใช่ school_id เพราะต้องเปลี่ยนตามเวอร์ชันและย้อนดูได้เหมือนข้อมูลอื่น
create table if not exists school_data.version_safety (
  version_id                uuid primary key
                              references school_data.school_versions(version_id) on delete cascade,
  security_guards           boolean,
  cctv_monitoring           boolean,
  nurse_medical_clinic      boolean,
  child_safeguarding_policy boolean,
  air_quality_pm25_protocol boolean,
  visitor_access_control    boolean,
  highlights                text[],
  policy_summary            text,
  policy_url                text,
  source_published_at       date
);
comment on table school_data.version_safety is
  'ทุกฟิลด์ boolean เป็น nullable โดยเจตนา: null = ระบบหาไม่เจอ ไม่ใช่ "โรงเรียนไม่มี" '
  'UI ห้ามแปลง null เป็น false หรือแสดงเป็นกากบาทเด็ดขาด (UC-G02 E2b)';

-- ── 3.8 log การทำงานของ pipeline ──────────────────────────────────────────────
create table if not exists school_data.school_scrape_log (
  log_id         uuid primary key default gen_random_uuid(),
  school_id      uuid references school_data.schools(school_id) on delete set null,
  version_id     uuid references school_data.school_versions(version_id) on delete set null,

  run_id         uuid not null,                 -- 1 รอบการรัน (orchestrator)
  correlation_id uuid,                          -- trace ข้าม Service (Use Case หัวข้อ 8.6)
  phase          text not null,                 -- 'bootstrap' | 'enrichment' | 'navigate' | 'extract' | 'safety'
  status         school_data.scrape_status not null,

  page_scraped   text,
  elapsed_sec    numeric(8,2),
  ai_model       text,
  ai_reasoning   text,                          -- reasoning ของ NAV/EXTRACT ที่โชว์ให้ Admin (UC-A03)
  error_message  text,
  created_at     timestamptz not null default now()
);


-- =============================================================================
-- 4. COMMUNITY SERVICE  (schema: community)
-- =============================================================================

-- ── 4.1 รีวิว — Pre-Moderation (UC-U06 → UC-A06) ─────────────────────────────
create table if not exists community.reviews (
  review_id        uuid primary key default gen_random_uuid(),
  user_id          uuid not null,                    -- logical ref → user_data.user_accounts
  school_id        uuid not null,                    -- logical ref → school_data.schools
  rating           int  not null check (rating between 1 and 5),
  comment          text,
  display_name     text not null,                    -- nickname เท่านั้น (UC-U06 Business Rule)
  status           community.review_status not null default 'pending',
  moderated_by     uuid,
  moderated_at     timestamptz,
  rejection_reason text,
  is_anonymized    boolean not null default false,   -- ตั้งเป็น true ตอน account-deletion-cron
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint reviews_one_per_user_school unique (user_id, school_id)   -- UC-U06 E1
);

-- ── 4.2 แจ้งข้อมูลผิด (UC-U07 → UC-A11) ──────────────────────────────────────
create table if not exists community.data_correction_reports (
  report_id       uuid primary key default gen_random_uuid(),
  school_id       uuid not null,                     -- logical ref
  field_name      text not null,
  description     text,
  evidence_url    text,
  report_count    int  not null default 1,           -- UC-U07 E1 รวม ticket ซ้ำ
  status          community.report_status not null default 'open',
  resolved_by     uuid,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1 ticket ที่ "ยังเปิดอยู่" ต่อ (โรงเรียน, ฟิลด์) — บังคับการรวม ticket ตาม UC-U07 E1 ที่ระดับ DB
-- ใช้ partial unique index แทน unique constraint เพราะ ticket ที่ปิดแล้วต้องมีซ้ำได้ในอนาคต
create unique index if not exists reports_one_open_per_field
  on community.data_correction_reports (school_id, field_name)
  where status = 'open';

create table if not exists community.report_submissions (
  report_id  uuid not null references community.data_correction_reports(report_id) on delete cascade,
  user_id    uuid not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)                   -- กันคนเดิมแจ้งซ้ำนับซ้ำ
);

-- ── 4.3 ฟอรัม (UC-G08 / UC-U09 / UC-A12) — Post-Moderation ───────────────────
-- เผยแพร่ทันที แล้วตรวจเมื่อถูกรายงาน (ต่างจาก reviews ที่ Pre-Moderation)
-- เหตุผลเต็ม: Business Rule ของ UC-U09 — รีวิวกระทบคะแนนเฉลี่ยที่แสดงในผลค้นหาโดยตรง
-- ส่วนฟอรัมเป็นบทสนทนาที่ต้องการความทันที และไม่กระทบตัวเลขทางการใดๆ ที่ระบบแสดง
create table if not exists community.forum_posts (
  post_id          uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  school_id        uuid,                             -- tag โรงเรียน (logical ref, nullable)
  category         community.forum_category not null,
  title            text not null,
  content          text not null,
  status           community.content_status not null default 'approved',   -- ← Post-Moderation
  moderated_by     uuid,
  moderated_at     timestamptz,
  rejection_reason text,
  like_count       int  not null default 0,
  comment_count    int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists community.forum_comments (
  comment_id        uuid primary key default gen_random_uuid(),
  post_id           uuid not null references community.forum_posts(post_id) on delete cascade,
  user_id           uuid not null,
  content           text not null,
  status            community.content_status not null default 'approved',
  deleted_by_author boolean not null default false,  -- แยกจาก rejected: ข้อความที่แสดงต่างกัน (UC-U09 ข้อ 5)
  moderated_by      uuid,
  moderated_at      timestamptz,
  like_count        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- กดถูกใจ: เก็บเป็นแถวเพื่อให้ toggle ได้แบบ idempotent (like_count เป็นแค่ตัวนับ denormalize)
create table if not exists community.forum_likes (
  target_type community.forum_target not null,
  target_id   uuid not null,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);

create table if not exists community.forum_reports (
  report_id        uuid primary key default gen_random_uuid(),
  target_type      community.forum_target not null,
  target_id        uuid not null,
  reporter_user_id uuid not null,
  reason           text not null,
  status           community.forum_report_status not null default 'open',
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),

  -- UC-U09 E4: 1 บัญชีรายงาน 1 เนื้อหาได้ครั้งเดียว บังคับที่ระดับ DB
  constraint forum_reports_once_per_user unique (target_type, target_id, reporter_user_id)
);
comment on table community.forum_reports is
  'จำนวนผู้รายงานใช้จัดลำดับความสำคัญให้ Admin เท่านั้น '
  'ห้ามใช้เป็นเกณฑ์ซ่อนเนื้อหาอัตโนมัติเด็ดขาด (UC-A12 E1)';


-- =============================================================================
-- 5. USER SERVICE  (schema: user_data)
-- =============================================================================

-- FK → auth.users ทำได้ เพราะ auth เป็น platform schema ไม่ใช่ schema ของ Service อื่น
-- หมายเหตุ: schema `auth` มีเฉพาะบน Supabase — ถ้ารันบน Postgres เปล่า (เช่น Neon) ให้สร้าง
-- ตาราง auth.users จำลองก่อน หรือถอด reference นี้ออกแล้วจัดการ identity เอง
create table if not exists user_data.user_accounts (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  display_name          text,
  role                  text not null default 'parent' check (role in ('parent','admin')),
  status                user_data.account_status not null default 'active',
  suspended_reason      text,
  deletion_requested_at timestamptz,                 -- จุดเริ่ม Grace Period (UC-U01 E5)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists user_data.children_profiles (
  profile_id            uuid primary key default gen_random_uuid(),
  user_id               uuid not null references user_data.user_accounts(user_id) on delete cascade,
  nickname              text,
  birth_year            int check (birth_year between 1990 and 2100),
  target_level_code     text,                        -- logical ref → grade_levels.code
  budget_min_thb        numeric(12,2) check (budget_min_thb >= 0),
  budget_max_thb        numeric(12,2) check (budget_max_thb >= 0),
  curriculum_preference text[],                      -- logical ref → curriculums.code
  preferred_area        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint children_budget_range check (
    budget_min_thb is null or budget_max_thb is null or budget_min_thb <= budget_max_thb
  )
);

create table if not exists user_data.favorites (
  user_id    uuid not null references user_data.user_accounts(user_id) on delete cascade,
  school_id  uuid not null,                          -- logical ref ข้าม Service
  created_at timestamptz not null default now(),
  primary key (user_id, school_id)                   -- idempotent ตาม UC-U02 E1
);

create table if not exists user_data.comparison_sets (
  comparison_id uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_data.user_accounts(user_id) on delete cascade,
  name          text not null,
  school_ids    uuid[] not null,                     -- logical ref ข้าม Service
  share_token   text unique,                         -- null = ยังไม่เคยเปิดแชร์ (UC-U08)
  share_enabled boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint comparison_sets_not_empty check (array_length(school_ids, 1) >= 1),
  constraint comparison_share_needs_token check (share_enabled = false or share_token is not null)
);


-- =============================================================================
-- 6. AI SERVICE  (schema: ai)
-- =============================================================================

create table if not exists ai.conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null,                     -- logical ref ข้าม Service
  title           text,
  summary         text,                              -- สรุปเมื่อยาวเกิน context (UC-U05 E2)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists ai.messages (
  message_id          uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references ai.conversations(conversation_id) on delete cascade,
  role                text not null check (role in ('user','assistant','system','tool')),
  content             text not null,
  suggested_replies   text[],                        -- Quick Replies ของ v6 (UC-U05 step 5)
  tool_calls          jsonb,                         -- log ว่าเรียก school-data-api ด้วยพารามิเตอร์อะไร
  grounded_school_ids uuid[],                        -- ใช้ตรวจ grounding/hallucination (UC-U05 E6)
  hallucination_flag  boolean not null default false,
  user_feedback       text check (user_feedback in ('up','down')),
  correlation_id      uuid,
  created_at          timestamptz not null default now()
);

create table if not exists ai.school_embeddings (
  embedding_id      uuid primary key default gen_random_uuid(),
  school_id         uuid not null,                   -- logical ref
  school_version_id uuid not null,                   -- logical ref (key ของการ upsert ตามหัวข้อ 8.4)
  chunk_index       int  not null default 0,
  content           text not null,
  embedding         vector(768),                     -- ปรับตามโมเดล: Gemini text-embedding-004 = 768
  created_at        timestamptz not null default now(),

  constraint school_embeddings_version_chunk_uniq unique (school_version_id, chunk_index)
);


-- =============================================================================
-- 7. OPS SERVICE  (schema: ops)
-- =============================================================================

create table if not exists ops.audit_log (
  log_id          bigint generated always as identity primary key,
  actor_id        uuid,
  actor_type      ops.actor_type not null,
  action          text not null,                     -- 'school.publish', 'forum.reject', ...
  entity_type     text not null,
  entity_id       uuid,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  correlation_id  uuid,
  created_at      timestamptz not null default now()
);

create table if not exists ops.failed_jobs (
  job_id         uuid primary key default gen_random_uuid(),
  job_type       text not null,                      -- 're-embed' | 'pdf-export' | 'scrape' | 'email'
  payload        jsonb not null,
  error_message  text,
  attempt_count  int not null default 1,
  correlation_id uuid,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);


-- =============================================================================
-- 8. FOREIGN KEY ที่ต้องเพิ่มทีหลัง (circular)
-- =============================================================================
alter table school_data.schools
  drop constraint if exists schools_current_version_fk;
alter table school_data.schools
  add constraint schools_current_version_fk
  foreign key (current_published_version_id)
  references school_data.school_versions(version_id)
  deferrable initially deferred;


-- =============================================================================
-- 9. INDEXES
-- =============================================================================

-- ── ค้นหาชื่อ: ใช้ trigram ไม่ใช่ tsvector ─────────────────────────────────────
-- Postgres ไม่มี dictionary ภาษาไทย ตัดคำไทยไม่ได้ → to_tsvector ใช้กับชื่อไทยไม่ได้ผลจริง
-- pg_trgm ทำงานระดับตัวอักษร จึงค้นได้ทั้งไทยและอังกฤษ และรองรับพิมพ์ผิดด้วย
create index if not exists schools_name_th_trgm on school_data.schools using gin (name_th gin_trgm_ops);
create index if not exists schools_name_en_trgm on school_data.schools using gin (name_en gin_trgm_ops);

-- ── หน้าค้นหา (UC-G01): เฉพาะโรงเรียนที่มองเห็นได้จริงเท่านั้น ─────────────────
create index if not exists schools_visible_idx
  on school_data.schools (province, pub_tuition_min_thb)
  where status = 'active' and current_published_version_id is not null;

create index if not exists schools_geom_gix on school_data.schools using gist (geom);
create index if not exists schools_tuition_idx on school_data.schools (pub_tuition_min_thb, pub_tuition_max_thb);
create index if not exists school_curriculums_code_idx on school_data.school_curriculums (curriculum_code);
create index if not exists school_levels_code_idx on school_data.school_levels (level_code);

-- ── versioning / คิวรออนุมัติ (UC-A04) ────────────────────────────────────────
create index if not exists versions_school_idx on school_data.school_versions (school_id, version_number desc);
create index if not exists versions_pending_idx on school_data.school_versions (created_at desc)
  where status = 'pending_review';
create index if not exists versions_snapshot_gin on school_data.school_versions using gin (data_snapshot);

create index if not exists version_fees_version_idx on school_data.version_fees (version_id);
create index if not exists version_extra_fees_version_idx on school_data.version_extra_fees (version_id);
create index if not exists scrape_log_school_idx on school_data.school_scrape_log (school_id, created_at desc);
create index if not exists scrape_log_run_idx on school_data.school_scrape_log (run_id);

-- ── community: รีวิว + ticket ────────────────────────────────────────────────
create index if not exists reviews_school_approved_idx on community.reviews (school_id, created_at desc)
  where status = 'approved';
create index if not exists reviews_pending_idx on community.reviews (created_at) where status = 'pending';
create index if not exists reports_open_idx on community.data_correction_reports (report_count desc)
  where status = 'open';

-- ── community: ฟอรัม ────────────────────────────────────────────────────────
create index if not exists forum_posts_feed_idx on community.forum_posts (created_at desc)
  where status = 'approved';
create index if not exists forum_posts_category_idx on community.forum_posts (category, created_at desc)
  where status = 'approved';
create index if not exists forum_posts_school_idx on community.forum_posts (school_id, created_at desc)
  where school_id is not null and status = 'approved';
create index if not exists forum_comments_post_idx on community.forum_comments (post_id, created_at);
-- คิวของ Admin (UC-A12): เนื้อหาที่ถูกรายงาน + เนื้อหาที่ติด content filter
create index if not exists forum_reports_open_idx on community.forum_reports (created_at)
  where status = 'open';
create index if not exists forum_posts_pending_idx on community.forum_posts (created_at)
  where status = 'pending';

-- ── user_data ────────────────────────────────────────────────────────────────
create index if not exists children_user_idx on user_data.children_profiles (user_id);
create index if not exists comparison_user_idx on user_data.comparison_sets (user_id, updated_at desc);
create unique index if not exists comparison_share_token_idx on user_data.comparison_sets (share_token)
  where share_token is not null;
create index if not exists accounts_pending_deletion_idx on user_data.user_accounts (deletion_requested_at)
  where status = 'pending_deletion';

-- ── ai ───────────────────────────────────────────────────────────────────────
create index if not exists messages_conversation_idx on ai.messages (conversation_id, created_at);
create index if not exists messages_flagged_idx on ai.messages (created_at desc)
  where hallucination_flag = true or user_feedback = 'down';
-- หมายเหตุ: สร้าง vector index ตอนมีข้อมูลจริงแล้วเท่านั้น (ivfflat ต้องมีแถวก่อนถึงจะ train list ได้)
-- create index school_embeddings_hnsw on ai.school_embeddings
--   using hnsw (embedding vector_cosine_ops);

-- ── ops ──────────────────────────────────────────────────────────────────────
create index if not exists audit_entity_idx on ops.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_actor_idx on ops.audit_log (actor_id, created_at desc);
create index if not exists failed_jobs_open_idx on ops.failed_jobs (created_at desc) where resolved_at is null;


-- =============================================================================
-- 10. SERVICE ROLES — บังคับ Golden Rule ที่ระดับ Database จริง
-- =============================================================================
-- นี่คือจุดที่ทำให้คำว่า "Microservices" ในแบบฟอร์ม คง.101 มีของจริงรองรับ:
-- Edge Function ของแต่ละ Service เชื่อมต่อด้วย role ของตัวเอง ซึ่ง "ไม่มีสิทธิ์"
-- แตะ schema ของ Service อื่นเลยแม้จะเขียน SQL ผิดโดยตั้งใจก็ตาม
do $$
declare r text;
begin
  foreach r in array array['svc_school_data','svc_community','svc_user','svc_ai','svc_ops'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;

grant usage on schema school_data to svc_school_data;
grant usage on schema community   to svc_community;
grant usage on schema user_data   to svc_user;
grant usage on schema ai          to svc_ai;
grant usage on schema ops         to svc_ops;

grant all on all tables in schema school_data to svc_school_data;
grant all on all tables in schema community   to svc_community;
grant all on all tables in schema user_data   to svc_user;
grant all on all tables in schema ai          to svc_ai;
grant all on all tables in schema ops         to svc_ops;

-- ข้อยกเว้นตาม Architecture หัวข้อ 4.2: ทุก Service insert log ตรงได้ (infrastructure concern)
grant usage on schema ops to svc_school_data, svc_community, svc_user, svc_ai;
grant insert on ops.audit_log, ops.failed_jobs to svc_school_data, svc_community, svc_user, svc_ai;


-- =============================================================================
-- 10.1 GRANT ให้ role ของ Data API (anon / authenticated)
-- =============================================================================
-- สำคัญ: **RLS policy อย่างเดียวไม่พอ** — PostgREST เชื่อมต่อด้วย role `anon` (ผู้ไม่ล็อกอิน)
-- และ `authenticated` (ผู้ล็อกอินแล้ว) ซึ่งต้องมีสิทธิ์ระดับตาราง (GRANT) ก่อน แล้ว RLS ถึงจะ
-- ทำหน้าที่กรองว่าเห็น "แถวไหน" ได้ ถ้าไม่มี GRANT จะขึ้น permission denied ทั้งที่ policy ถูกต้อง
-- (ตัวเลือก "Automatically expose new tables" ใน Dashboard คือการทำ GRANT ชุดนี้ให้อัตโนมัติ
--  เราปิดไว้แล้วจึงต้องระบุเองตรงนี้ ซึ่งดีกว่าเพราะอยู่ใน version control ตรวจทานได้)

grant usage on schema school_data, community, user_data, ai, ops to anon, authenticated;

-- อ่านสาธารณะได้ (RLS เป็นตัวจำกัดว่าเห็นแถวไหน เช่น เฉพาะเวอร์ชัน published)
grant select on
  school_data.schools, school_data.school_versions,
  school_data.version_fees, school_data.version_extra_fees, school_data.version_safety,
  school_data.curriculums, school_data.grade_levels,
  school_data.school_curriculums, school_data.school_levels,
  community.reviews, community.forum_posts, community.forum_comments
to anon, authenticated;

-- สมาชิกที่ล็อกอิน: จัดการข้อมูลของตัวเองได้ (RLS บังคับว่าต้องเป็นแถวของตัวเองเท่านั้น)
grant select, insert, update, delete on
  user_data.user_accounts, user_data.children_profiles,
  user_data.favorites, user_data.comparison_sets,
  community.forum_likes,
  ai.conversations, ai.messages
to authenticated;

grant insert, update on community.reviews, community.forum_posts, community.forum_comments to authenticated;
grant select, insert, update on community.data_correction_reports to authenticated;
grant select, insert on community.report_submissions, community.forum_reports to authenticated;

-- Admin ใช้ role `authenticated` ตัวเดียวกับผู้ใช้ทั่วไป — แยกสิทธิ์ด้วย RLS (`user_data.is_admin()`)
-- ไม่ใช่ด้วย database role เพราะ Supabase Auth ออก JWT เป็น authenticated ให้ทุกคนที่ล็อกอิน
grant select on
  school_data.school_scrape_log, school_data.curriculum_aliases, school_data.grade_level_aliases,
  ops.audit_log, ops.failed_jobs
to authenticated;
grant insert on ops.audit_log to authenticated;
grant insert, update, delete on
  school_data.schools, school_data.school_versions,
  school_data.version_fees, school_data.version_extra_fees, school_data.version_safety
to authenticated;

-- `ai.school_embeddings` ตั้งใจไม่ grant ให้ใครเลย — เข้าถึงผ่าน Edge Function (service role) เท่านั้น


-- =============================================================================
-- 11. ROW LEVEL SECURITY
-- =============================================================================
alter table user_data.user_accounts           enable row level security;
alter table user_data.children_profiles       enable row level security;
alter table user_data.favorites               enable row level security;
alter table user_data.comparison_sets         enable row level security;
alter table community.reviews                 enable row level security;
alter table community.data_correction_reports enable row level security;
alter table community.forum_posts             enable row level security;
alter table community.forum_comments          enable row level security;
alter table community.forum_likes             enable row level security;
alter table community.forum_reports           enable row level security;
alter table ai.conversations                  enable row level security;
alter table ai.messages                       enable row level security;
alter table ops.audit_log                     enable row level security;
-- เปิดครบทุกตารางที่เหลือด้วย: เมื่อ schema ถูก expose ผ่าน Data API แล้ว ตารางที่ไม่เปิด RLS
-- จะถูกอ่านได้โดย anon ทันที — ต้องเปิดทุกตารางแล้วค่อยเขียน policy ว่าใครเห็นอะไร
alter table school_data.schools               enable row level security;
alter table school_data.school_versions       enable row level security;
alter table school_data.version_fees          enable row level security;
alter table school_data.version_extra_fees    enable row level security;
alter table school_data.version_safety        enable row level security;
alter table school_data.school_scrape_log     enable row level security;
alter table school_data.curriculums           enable row level security;
alter table school_data.curriculum_aliases    enable row level security;
alter table school_data.grade_levels          enable row level security;
alter table school_data.grade_level_aliases   enable row level security;
alter table school_data.school_curriculums    enable row level security;
alter table school_data.school_levels         enable row level security;
alter table community.report_submissions      enable row level security;
alter table ai.school_embeddings              enable row level security;
alter table ops.failed_jobs                   enable row level security;

-- helper: ตรวจว่าเป็น admin จากตารางของเราเอง (ไม่พึ่ง JWT claim ที่ client แก้ได้)
create or replace function user_data.is_admin() returns boolean
language sql stable security definer set search_path = user_data, public as $$
  select exists (
    select 1 from user_data.user_accounts
    where user_id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ── Anti-IDOR: ทุก resource ที่ผูก user_id ต้อง filter ด้วย auth.uid() เสมอ ─────
drop policy if exists own_account on user_data.user_accounts;
create policy own_account on user_data.user_accounts
  for all using (user_id = auth.uid() or user_data.is_admin())
  with check (user_id = auth.uid());

drop policy if exists own_children on user_data.children_profiles;
create policy own_children on user_data.children_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- หมายเหตุ: children_profiles ตั้งใจ "ไม่" ให้ Admin อ่านผ่าน RLS (ข้อมูลอ่อนไหวสุดตาม PDPA)
-- ถ้า UC-A05 ต้องลบข้อมูลนี้ ให้ทำผ่าน account-deletion-cron ที่รันด้วยสิทธิ์ระบบเท่านั้น

drop policy if exists own_favorites on user_data.favorites;
create policy own_favorites on user_data.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_comparisons on user_data.comparison_sets;
create policy own_comparisons on user_data.comparison_sets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ลิงก์แชร์ (UC-G07) "ห้าม" เปิด policy anonymous ที่นี่ —
-- ต้องอ่านผ่าน Edge Function get-shared-comparison ที่ควบคุม field ที่คืนเองเท่านั้น

-- ── รีวิว ────────────────────────────────────────────────────────────────────
drop policy if exists reviews_public_read on community.reviews;
create policy reviews_public_read on community.reviews
  for select using (status = 'approved' or user_id = auth.uid() or user_data.is_admin());

drop policy if exists reviews_own_write on community.reviews;
create policy reviews_own_write on community.reviews
  for insert with check (user_id = auth.uid());

drop policy if exists reviews_own_update on community.reviews;
create policy reviews_own_update on community.reviews
  for update using (user_id = auth.uid() or user_data.is_admin());

drop policy if exists reports_read on community.data_correction_reports;
create policy reports_read on community.data_correction_reports
  for select using (user_data.is_admin() or exists (
    select 1 from community.report_submissions s
    where s.report_id = data_correction_reports.report_id and s.user_id = auth.uid()
  ));

-- ── ฟอรัม: อ่านสาธารณะเฉพาะ approved / เขียนได้เฉพาะของตัวเอง (Use Case 8.1) ──
drop policy if exists forum_posts_public_read on community.forum_posts;
create policy forum_posts_public_read on community.forum_posts
  for select using (status = 'approved' or user_id = auth.uid() or user_data.is_admin());

drop policy if exists forum_posts_own_write on community.forum_posts;
create policy forum_posts_own_write on community.forum_posts
  for insert with check (user_id = auth.uid());

drop policy if exists forum_posts_own_update on community.forum_posts;
create policy forum_posts_own_update on community.forum_posts
  for update using (user_id = auth.uid() or user_data.is_admin());

drop policy if exists forum_comments_public_read on community.forum_comments;
create policy forum_comments_public_read on community.forum_comments
  for select using (status = 'approved' or user_id = auth.uid() or user_data.is_admin());

drop policy if exists forum_comments_own_write on community.forum_comments;
create policy forum_comments_own_write on community.forum_comments
  for insert with check (user_id = auth.uid());

drop policy if exists forum_comments_own_update on community.forum_comments;
create policy forum_comments_own_update on community.forum_comments
  for update using (user_id = auth.uid() or user_data.is_admin());

drop policy if exists forum_likes_own on community.forum_likes;
create policy forum_likes_own on community.forum_likes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- รายงาน: ผู้ใช้สร้างของตัวเองได้ แต่ "อ่านไม่ได้เลย" — เห็นได้เฉพาะ Admin
-- (กันไม่ให้รู้ว่าใครรายงานใคร ซึ่งจะกลายเป็นเครื่องมือกลั่นแกล้งกันเอง)
drop policy if exists forum_reports_insert on community.forum_reports;
create policy forum_reports_insert on community.forum_reports
  for insert with check (reporter_user_id = auth.uid());

drop policy if exists forum_reports_admin_read on community.forum_reports;
create policy forum_reports_admin_read on community.forum_reports
  for select using (user_data.is_admin());

-- ── AI ───────────────────────────────────────────────────────────────────────
drop policy if exists own_conversations on ai.conversations;
create policy own_conversations on ai.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_messages on ai.messages;
create policy own_messages on ai.messages
  for all using (exists (
    select 1 from ai.conversations c
    where c.conversation_id = messages.conversation_id and c.user_id = auth.uid()
  ));

-- ── School Data: เปิดอ่านสาธารณะ "เฉพาะข้อมูลที่ published แล้ว" เท่านั้น ────────
-- บังคับ Business Rule ของ UC-G01 ที่ระดับ database ไม่ใช่แค่เงื่อนไขใน query ของ Frontend
drop policy if exists schools_public_read on school_data.schools;
create policy schools_public_read on school_data.schools
  for select using (
    (status = 'active' and current_published_version_id is not null)
    or user_data.is_admin()
  );

-- เวอร์ชันที่ยังเป็น pending_review/rejected ต้องไม่หลุดออกไปเด็ดขาด
-- (ถ้าไม่มี policy นี้ Guest จะเห็นค่าเทอมที่ Admin ยังไม่อนุมัติผ่าน Auto-API)
drop policy if exists versions_published_read on school_data.school_versions;
create policy versions_published_read on school_data.school_versions
  for select using (status = 'published' or user_data.is_admin());

-- ตารางลูกของเวอร์ชัน: เห็นได้ก็ต่อเมื่อเวอร์ชันแม่เห็นได้
drop policy if exists fees_published_read on school_data.version_fees;
create policy fees_published_read on school_data.version_fees
  for select using (exists (
    select 1 from school_data.school_versions v
    where v.version_id = version_fees.version_id
      and (v.status = 'published' or user_data.is_admin())
  ));

drop policy if exists extra_fees_published_read on school_data.version_extra_fees;
create policy extra_fees_published_read on school_data.version_extra_fees
  for select using (exists (
    select 1 from school_data.school_versions v
    where v.version_id = version_extra_fees.version_id
      and (v.status = 'published' or user_data.is_admin())
  ));

drop policy if exists safety_published_read on school_data.version_safety;
create policy safety_published_read on school_data.version_safety
  for select using (exists (
    select 1 from school_data.school_versions v
    where v.version_id = version_safety.version_id
      and (v.status = 'published' or user_data.is_admin())
  ));

-- ตาราง lookup: อ่านสาธารณะได้หมด (ไม่มีอะไรอ่อนไหว และ Frontend ต้องใช้ทำ dropdown ตัวกรอง)
drop policy if exists curriculums_read on school_data.curriculums;
create policy curriculums_read on school_data.curriculums for select using (true);
drop policy if exists curriculum_aliases_read on school_data.curriculum_aliases;
create policy curriculum_aliases_read on school_data.curriculum_aliases for select using (user_data.is_admin());
drop policy if exists grade_levels_read on school_data.grade_levels;
create policy grade_levels_read on school_data.grade_levels for select using (true);
drop policy if exists grade_level_aliases_read on school_data.grade_level_aliases;
create policy grade_level_aliases_read on school_data.grade_level_aliases for select using (user_data.is_admin());
drop policy if exists school_curriculums_read on school_data.school_curriculums;
create policy school_curriculums_read on school_data.school_curriculums for select using (true);
drop policy if exists school_levels_read on school_data.school_levels;
create policy school_levels_read on school_data.school_levels for select using (true);

-- log การทำงานของ pipeline: ข้อมูลภายใน ไม่เปิดสาธารณะ
drop policy if exists scrape_log_admin_read on school_data.school_scrape_log;
create policy scrape_log_admin_read on school_data.school_scrape_log
  for select using (user_data.is_admin());

-- ── School Data: การเขียนทำได้เฉพาะ Admin (UC-A01/A04 ผ่าน Admin Dashboard) ───
-- ถ้าไม่มี policy กลุ่มนี้ RLS จะปฏิเสธการเขียนของทุกคนรวมทั้ง Admin ด้วย
-- (Data Pipeline กับ Edge Function ใช้ service role ซึ่ง bypass RLS อยู่แล้ว ไม่พึ่ง policy นี้)
drop policy if exists schools_admin_write on school_data.schools;
create policy schools_admin_write on school_data.schools
  for all to authenticated using (user_data.is_admin()) with check (user_data.is_admin());

drop policy if exists versions_admin_write on school_data.school_versions;
create policy versions_admin_write on school_data.school_versions
  for all to authenticated using (user_data.is_admin()) with check (user_data.is_admin());

drop policy if exists fees_admin_write on school_data.version_fees;
create policy fees_admin_write on school_data.version_fees
  for all to authenticated using (user_data.is_admin()) with check (user_data.is_admin());

drop policy if exists extra_fees_admin_write on school_data.version_extra_fees;
create policy extra_fees_admin_write on school_data.version_extra_fees
  for all to authenticated using (user_data.is_admin()) with check (user_data.is_admin());

drop policy if exists safety_admin_write on school_data.version_safety;
create policy safety_admin_write on school_data.version_safety
  for all to authenticated using (user_data.is_admin()) with check (user_data.is_admin());

-- ── แจ้งข้อมูลผิด (UC-U07): สมาชิกสร้าง/อัปเดตจำนวนผู้แจ้งได้ Admin ปิด ticket ได้ ──
drop policy if exists reports_insert on community.data_correction_reports;
create policy reports_insert on community.data_correction_reports
  for insert to authenticated with check (true);

drop policy if exists reports_admin_update on community.data_correction_reports;
create policy reports_admin_update on community.data_correction_reports
  for update to authenticated using (user_data.is_admin());

-- ── report_submissions: เห็นได้เฉพาะเจ้าของรายการกับ Admin ───────────────────
-- เก็บว่า "ใครแจ้งอะไร" จึงเป็นข้อมูลส่วนบุคคล ต้องไม่เปิดให้ผู้ใช้อื่นไล่ดูได้
drop policy if exists report_submissions_own on community.report_submissions;
create policy report_submissions_own on community.report_submissions
  for select using (user_id = auth.uid() or user_data.is_admin());
drop policy if exists report_submissions_insert on community.report_submissions;
create policy report_submissions_insert on community.report_submissions
  for insert with check (user_id = auth.uid());

-- ── ai.school_embeddings / ops.failed_jobs: ไม่มี policy select สำหรับผู้ใช้ ──
-- เปิด RLS ไว้เฉยๆ โดยไม่มี policy = ไม่มีใครอ่านได้ผ่าน Data API เลย
-- ทั้งสองตารางถูกใช้โดย Edge Function ด้วย service role ซึ่ง bypass RLS อยู่แล้ว
-- (failed_jobs.payload อาจมีข้อมูลผู้ใช้ติดมา, embeddings เป็นข้อมูลภายในของ AI Service)
drop policy if exists failed_jobs_admin_read on ops.failed_jobs;
create policy failed_jobs_admin_read on ops.failed_jobs
  for select using (user_data.is_admin());

-- ── audit_log: append-only แม้แต่ Admin ก็แก้/ลบไม่ได้ (UC-A10 E1) ───────────
drop policy if exists audit_admin_read on ops.audit_log;
create policy audit_admin_read on ops.audit_log for select using (user_data.is_admin());
drop policy if exists audit_insert_only on ops.audit_log;
create policy audit_insert_only on ops.audit_log for insert with check (true);
-- ไม่มี policy สำหรับ UPDATE/DELETE = ทำไม่ได้เลยผ่าน API


-- =============================================================================
-- 12. TRANSACTION BOUNDARY ตอน Publish (Architecture หัวข้อ 8.5)
-- =============================================================================
-- ห่อการเปลี่ยน status + ชี้ current_published_version_id + อัปเดต read model
-- ไว้ใน function เดียว เพื่อให้เป็น transaction เดียวเสมอ ไม่ต้องหวังว่า caller จะห่อ BEGIN เอง
create or replace function school_data.publish_version(
  p_version_id uuid,
  p_reviewer   uuid
) returns void
language plpgsql security definer set search_path = school_data, public as $$
declare
  v_school_id uuid;
begin
  select school_id into strict v_school_id
    from school_data.school_versions where version_id = p_version_id;

  update school_data.school_versions
     set status = 'superseded'
   where school_id = v_school_id and status = 'published';

  update school_data.school_versions
     set status = 'published', reviewed_by = p_reviewer, reviewed_at = now()
   where version_id = p_version_id;

  update school_data.schools s
     set current_published_version_id = p_version_id,
         pub_data_updated_at          = now(),
         pub_tuition_min_thb          = (select min(coalesce(annual_thb, semester_thb * 2))
                                           from school_data.version_fees where version_id = p_version_id),
         pub_tuition_max_thb          = (select max(coalesce(annual_thb, semester_thb * 2))
                                           from school_data.version_fees where version_id = p_version_id),
         pub_has_safeguarding_policy  = (select child_safeguarding_policy
                                           from school_data.version_safety where version_id = p_version_id),
         updated_at                   = now()
   where s.school_id = v_school_id;

  insert into ops.audit_log (actor_id, actor_type, action, entity_type, entity_id, after_snapshot)
  values (p_reviewer, 'admin', 'school.publish', 'school_version', p_version_id,
          jsonb_build_object('school_id', v_school_id));
end $$;


-- =============================================================================
-- 12.1 สร้างแถว user_accounts อัตโนมัติเมื่อมีคนสมัครสมาชิก
-- =============================================================================
-- จำเป็นจริง ไม่ใช่ของอำนวยความสะดวก: `children_profiles`/`favorites`/`comparison_sets`
-- ต่างมี FK ไปที่ `user_accounts.user_id` ถ้าไม่มีแถวนี้ ผู้ใช้ที่เพิ่งสมัครตาม UC-G06 จะ
-- ใช้ฟีเจอร์อะไรไม่ได้เลยสักอย่าง — Supabase Auth เขียนเฉพาะ `auth.users` ให้เท่านั้น
-- ไม่รู้จักตารางฝั่งธุรกิจของเรา จึงต้องมี trigger เชื่อมให้
create or replace function user_data.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = user_data, public as $$
begin
  insert into user_data.user_accounts (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function user_data.handle_new_auth_user();

-- ผู้ใช้ที่ถูกสร้างไว้ "ก่อน" ติดตั้ง trigger นี้ (เช่น บัญชี Admin ที่สร้างจาก Dashboard)
-- จะยังไม่มีแถว จึงเติมย้อนหลังให้ครบตรงนี้
insert into user_data.user_accounts (user_id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (user_id) do nothing;


-- =============================================================================
-- 12.2 บันทึกทุกการเปลี่ยน role/status ของบัญชีลง audit_log อัตโนมัติ
-- =============================================================================
-- การเลื่อนขั้นเป็น admin คือ action ที่อันตรายที่สุดในระบบ (เห็นข้อมูลบุตรหลานคนอื่น,
-- ลบข้อมูลโรงเรียนได้) และทำผ่าน SQL ตรงตาม Use Case §6 ซึ่งไม่ผ่าน Edge Function ใดๆ
-- จึงไม่มีอะไรบันทึกให้เลยถ้าไม่ดักที่ระดับ database — trigger นี้ทำให้ต่อให้เปลี่ยนจาก
-- SQL Editor ก็ยังมีร่องรอยเสมอ ตอบ Business Rule ของ UC-A05/UC-A10
create or replace function user_data.audit_account_privilege_change() returns trigger
language plpgsql security definer set search_path = user_data, ops, public as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    insert into ops.audit_log (
      actor_id, actor_type, action, entity_type, entity_id, before_snapshot, after_snapshot
    ) values (
      auth.uid(),
      -- auth.uid() เป็น null เมื่อรันจาก SQL Editor/สคริปต์ = ไม่ได้มาจาก request ของผู้ใช้
      -- ต้อง cast เอง: CASE คืนค่าเป็น text และ Postgres ไม่ implicit cast text → enum ให้
      (case when auth.uid() is null then 'system' else 'admin' end)::ops.actor_type,
      'account.privilege_change', 'user_account', new.user_id,
      jsonb_build_object('role', old.role, 'status', old.status),
      jsonb_build_object('role', new.role, 'status', new.status)
    );
  end if;
  return new;
end $$;

drop trigger if exists on_user_account_privilege_change on user_data.user_accounts;
create trigger on_user_account_privilege_change
  after update on user_data.user_accounts
  for each row execute function user_data.audit_account_privilege_change();


-- =============================================================================
-- 13. SEED — lookup tables (map ค่าดิบที่พบจริงใน dataset OPEC)
-- =============================================================================
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

insert into school_data.grade_levels (code, name_th, name_en, sort_order) values
  ('PRE_K',        'เตรียมอนุบาล',        'Pre-Kindergarten', 10),
  ('KINDERGARTEN', 'อนุบาล',             'Kindergarten',     20),
  ('PRIMARY',      'ประถมศึกษา',          'Primary',          30),
  ('LOWER_SEC',    'มัธยมศึกษาตอนต้น',    'Lower Secondary',  40),
  ('UPPER_SEC',    'มัธยมศึกษาตอนปลาย',   'Upper Secondary',  50)
on conflict (code) do nothing;

-- ค่าที่พบจริงในข้อมูล OPEC ทั้ง 5 ค่า (ตรวจนับแล้วครอบคลุม 100% ของ levels_offered)
insert into school_data.grade_level_aliases (raw_text, level_code) values
  ('ก่อนอนุบาล', 'PRE_K'),
  ('เตรียมอนุบาล', 'PRE_K'),
  ('อนุบาล', 'KINDERGARTEN'),
  ('ประถมศึกษา', 'PRIMARY'),
  ('มัธยมศึกษาตอนต้น', 'LOWER_SEC'),
  ('มัธยมศึกษาตอนปลาย', 'UPPER_SEC')
on conflict (raw_text) do nothing;

-- alias ตั้งต้น = ค่าที่พบบ่อยที่สุดจริงในไฟล์ data/international_schools_thailand_opec.json
-- (ไฟล์นั้นมีข้อความหลักสูตรที่ไม่ซ้ำกันถึง 268 ค่า จึงเป็นไปไม่ได้ที่จะ seed ให้ครบด้วยมือ —
--  ส่วนที่เหลือ `db/import_opec.py` จะ map ด้วย keyword แล้วเขียน alias ที่ได้กลับเข้าตารางนี้
--  ให้ Admin ตรวจทาน/แก้ทีหลังได้ ดู Use Case doc หัวข้อ 7.16)
insert into school_data.curriculum_aliases (raw_text, curriculum_code) values
  ('หลักสูตรสหราชอาณาจักร', 'BRITISH'),
  ('หลักสูตรประเทศอังกฤษ', 'BRITISH'),
  ('หลักสูตรกลางของประเทศอังกฤษ', 'BRITISH'),
  ('The national Curriculum in England', 'BRITISH'),
  ('National Curriculum in England', 'BRITISH'),
  ('UK National Curriculum', 'BRITISH'),
  ('British National Curriculum', 'BRITISH'),
  ('British Curriculum', 'BRITISH'),
  ('National Curriculum for England and Wales', 'BRITISH'),
  ('The Early Years Foundation Stage', 'BRITISH'),
  ('Early years foundation stage statutory framework', 'BRITISH'),
  ('Early Years Foundation Stage (EYFS)', 'BRITISH'),
  ('The Early Years Foundation Stage (EYFS)', 'BRITISH'),
  ('Cambridge International Curriculum', 'BRITISH'),
  ('Cambridge IGCSE', 'BRITISH'),
  ('Cambridge International A & AS Level', 'BRITISH'),
  ('หลักสูตร General Certificate of Secondary Education (GCSE)', 'BRITISH'),
  ('หลักสูตรเวลส์', 'BRITISH'),
  ('หลักสูตรสหรัฐอเมริกัน', 'AMERICAN'),
  ('หลักสูตรอเมริกัน', 'AMERICAN'),
  ('American Curriculum', 'AMERICAN'),
  ('Massachusetts Curriculum Frameworks', 'AMERICAN'),
  ('California Department of Education', 'AMERICAN'),
  ('หลักสูตรแคลิฟอร์เนีย', 'AMERICAN'),
  ('American Education Reaches Out (AERO)', 'AMERICAN'),
  ('หลักสูตร High School Diploma', 'AMERICAN'),
  ('หลักสูตร International Baccalaureate (IB)', 'IB'),
  ('International Baccalaureate (IB)', 'IB'),
  ('IB - International Baccalaureate Organization', 'IB'),
  ('International Baccalaureate (IB) Primary Year Programe (PYP)', 'IB'),
  ('International Baccalaureate Career-related Programme (IB-CP)', 'IB'),
  ('IB', 'IB'),
  ('หลักสูตรสิงคโปร์', 'SINGAPORE'),
  ('หลักสูตรญี่ปุ่น', 'JAPANESE'),
  ('หลักสูตรจีน', 'CHINESE'),
  ('หลักสูตรฝรั่งเศส', 'FRENCH'),
  ('หลักสูตรภาษาไทย วัฒนธรรมไทยและประวัติศาสตร์ไทย', 'THAI_MOE'),
  ('หลักสูตรวิชา ภาษาไทย วัฒนธรรมไทยและประวัติศาสตร์ไทย', 'THAI_MOE'),
  ('International Preschool Curriculum (IPC)', 'OTHER')
on conflict (raw_text) do nothing;
