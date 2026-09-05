# Skoolly — Database Design & Tooling Decision

เอกสารนี้อธิบายเหตุผลเบื้องหลัง [`db/schema.sql`](schema.sql) และการเลือกเครื่องมือแบบ free tier
วิเคราะห์จาก **Use Case จริง** (`reference/use_case_specification_final_v6.md` — v6.3, 29 Use Case, Data Dictionary 28 ตาราง)
และ **โค้ด/ข้อมูลที่มีอยู่จริง** ในโปรเจกต์ ไม่ใช่จากทฤษฎีอย่างเดียว

---

## 0. สถานะปัจจุบันของโปรเจกต์ (สิ่งที่ตรวจพบจากโค้ดจริง)

| สิ่งที่มีอยู่ | รายละเอียด | ผลต่อการออกแบบ |
|---|---|---|
| **ยังไม่มี Database เลย** | `microservices/db_service.py` เขียนลง `results.json` + `scrape_log.json` และทำ Saga rollback ด้วยไฟล์ `.bak` | งานนี้คือการย้ายจาก file-based → Postgres จริง โค้ด compensate ด้วย `.bak` จะถูกแทนด้วย transaction ของ DB |
| **ข้อมูล OPEC 291 โรงเรียน** | `data/international_schools_thailand_opec.json` — lat/lng ครบ 291/291, website 182/291, curriculums 257/291 (free-text ไทย), levels 286/291 | ต้องมีตาราง lookup + alias เพื่อ normalize ก่อน ไม่งั้นตัวกรองของ UC-G01 ใช้ไม่ได้จริง |
| **ผลลัพธ์ scraper** | `tuition_by_grade`, `hidden_costs`, `safety_and_security`, `confidence`, `confidence_reasoning` | เป็นตัวกำหนดหน้าตาตาราง `version_fees` / `version_extra_fees` / `version_safety` โดยตรง |
| **Frontend React 19 + Vite** | `src/api/*.ts` เป็นชั้น service layer ที่ออกแบบมาให้สลับไป backend จริงได้อยู่แล้ว | ไม่ต้องรื้อ FE ตอนต่อ DB — เปลี่ยนแค่ body ของฟังก์ชันใน `src/api/` |
| **หน้า Forum** | `src/pages/ForumPage.tsx`, type `Post`/`Comment` | ✅ ยืนยันแล้วว่าจะทำจริง → เพิ่ม UC-G08/U09/A12 เข้าเอกสาร และตาราง `forum_*` เข้า schema |
| **scraper เก็บ safety/safeguarding** | `EXTRACT_SCHEMA.safety_and_security` | ✅ ผนวกเข้าเอกสารแล้ว → แท็บใน UC-G02, แถวเปรียบเทียบใน UC-U03, ตาราง `version_safety` |

**ขนาดข้อมูลจริง:** OPEC ~2.3 KB/โรง, ผลลัพธ์ scraper ~3.9 KB/โรง → รวม ~6.3 KB ต่อโรงต่อเวอร์ชัน
291 โรง × เก็บ 24 เวอร์ชัน (สแครปเดือนละครั้ง 2 ปี) ≈ **44 MB** — ตัวเลขนี้สำคัญต่อการเลือกเครื่องมือในข้อ 2

---

## 1. RDB หรือ NoSQL? → **RDB (PostgreSQL) ตัวเดียว** ไม่ต้องมี NoSQL แยก

คำตอบสั้น: **ใช้ Postgres อย่างเดียว แต่ใช้ทั้ง 2 สไตล์ในตัวมันเอง** — ตารางแบบ relational สำหรับสิ่งที่ต้องกรอง/join
และคอลัมน์ **JSONB** สำหรับสิ่งที่โครงสร้างไม่แน่นอน (snapshot ดิบจาก AI)

### เหตุผลที่ต้องเป็น RDB

| หลักฐานจาก Use Case | ทำไม NoSQL ตอบไม่ได้ |
|---|---|
| UC-G01 กรองด้วยหลักสูตร + ระดับชั้น + ช่วงค่าเทอม + ระยะทาง พร้อมกัน | เป็น multi-attribute range query แบบคลาสสิก — Document DB ต้องสร้าง index ผสมเองหรือ denormalize หนัก |
| Architecture 8.5: publish ต้องแก้ `schools` + `school_versions` ใน **transaction เดียว** | MongoDB free tier ทำ multi-document transaction ได้ก็จริงแต่แพงและซับซ้อนกว่า `BEGIN/COMMIT` มาก |
| Architecture 4.2: `account-deletion-cron` แก้ **3 schema พร้อมกันในธุรกรรมเดียว** | ต้องมี ACID ข้าม collection — จุดที่ Document DB เสียเปรียบชัดที่สุด |
| Use Case 8.1: **RLS ทำหน้าที่ authorization แทน API Gateway** | ไม่มีใน NoSQL ตัวไหนในระดับเดียวกับ Postgres RLS |
| Use Case 8.2: **Postgres Advisory Lock** กัน scraper job ซ้อน | ต้องมี Redis หรือ lock service เพิ่มถ้าไม่ใช้ Postgres |
| UC-U04 คำนวณเงิน ต้อง decimal-safe | JSON number = float64 → ปัดเศษพลาดได้จริง ต้องใช้ `numeric` ของ SQL |
| UC-A07 ต้องการ vector search | `pgvector` อยู่ใน Postgres แล้ว ไม่ต้องมี Pinecone/Chroma แยก |
| UC-G01/G03 ต้องการระยะทาง | `PostGIS` อยู่ใน Postgres แล้ว |
| UC-U09 ต้องบังคับ "1 บัญชีรายงาน 1 เนื้อหาได้ครั้งเดียว" | unique constraint 1 บรรทัด vs เขียน logic กันเองทุกจุดที่เขียนข้อมูล |

**ข้อมูลมีแค่ 291 แถว** — เหตุผลคลาสสิกที่คนเลือก NoSQL (scale แนวนอน, write throughput สูง) ไม่มีอยู่ในระบบนี้เลย

### แล้ว NoSQL ใช้ตรงไหน → ใช้ในรูป **JSONB คอลัมน์** ไม่ใช่ database แยก

| ข้อมูล | เก็บแบบไหน | เหตุผล |
|---|---|---|
| `school_versions.data_snapshot` | **JSONB** | payload ดิบจาก AI ที่ schema เปลี่ยนได้ตลอด เก็บไว้เป็นหลักฐาน/rollback |
| `messages.tool_calls`, `failed_jobs.payload`, `audit_log.before/after` | **JSONB** | โครงสร้างต่างกันทุก event |
| ค่าเทอมรายชั้น, hidden cost, safety | **ตาราง normalize** | ต้องคำนวณเงิน (numeric) + หัวข้อ 7.3 บังคับให้ `academic_year`/`source_published_at` กำกับ **ระดับฟิลด์** ซึ่งเป็นแถวโดยธรรมชาติ |
| ตัวกรองหน้าค้นหา | **คอลัมน์ typed** | filter ใน JSONB ช้าและเขียน query ยากกว่ามาก |

> **หลักที่ใช้ตัดสิน:** ถ้าฟิลด์นั้นถูก **filter / sort / คำนวณ** → ทำเป็นคอลัมน์
> ถ้าถูกอ่านทั้งก้อนเพื่อแสดงผลหรือเก็บเป็นหลักฐาน → JSONB

---

## 2. เครื่องมือที่แนะนำ (เน้น free tier)

### 2.1 ตัวหลัก: **Supabase Free** ✅

ตรวจสอบจากหน้า pricing จริง (กันยายน 2026):

| ทรัพยากร | Free plan | ระบบนี้ใช้จริงเท่าไหร่ | เหลือ |
|---|---|---|---|
| Database | **500 MB** | ~44 MB (2 ปี) | ~11× |
| File storage | **1 GB** | โลโก้ 291 ไฟล์ + PDF export | เหลือเยอะ |
| Monthly Active Users | **50,000** | ผู้ปกครองทดสอบ + UAT 5-10 คน | เหลือเยอะ |
| Egress | **5 GB** + cached 5 GB | เว็บ demo | พอ |
| Edge Function invocations | **500,000/เดือน** | 7 functions | พอ |
| Active projects | **2 โปรเจกต์** | ⚠️ ดู 2.3 | ติดเพดาน |
| นโยบายหยุด | **หยุดอัตโนมัติหลังไม่มี activity 1 สัปดาห์** | ⚠️ ดู 2.3 | ต้องมีแผนรับมือ |

**เหตุผลที่ชนะตัวอื่นสำหรับโปรเจกต์นี้:** ได้ Postgres + Auth + Storage + Edge Functions + pg_cron +
Database Webhooks + PostGIS + pgvector **ในที่เดียวและฟรีทั้งหมด** — ตรงกับสิ่งที่เอกสาร Architecture
ออกแบบไว้แบบ 1:1 อยู่แล้ว ถ้าเปลี่ยนไปตัวอื่นต้องประกอบเองหลายชิ้นและได้ของฟรีไม่ครบ

### 2.2 ทางเลือกอื่นที่พิจารณาแล้ว

| ตัวเลือก | Free tier | ทำไมไม่เลือกเป็นตัวหลัก |
|---|---|---|
| **Neon** | 0.5 GB/project, 100 CU-hours/เดือน, 10 branches, scale-to-zero 5 นาที | Postgres ดีมากและ branching เหมาะกับงานพัฒนา แต่**ไม่มี Auth/Storage/Edge Functions/pg_cron** ต้องหาของพวกนี้เพิ่มเอง |
| **MongoDB Atlas** | 512 MB | เสีย RLS, ACID ข้ามคอลเลกชัน, PostGIS, pgvector, pg_cron ทั้งหมดที่ Use Case เขียนพึ่งไว้ |
| **Cloudflare D1 / Turso** (SQLite) | มี free tier ดี | ไม่มี PostGIS/pgvector, ไม่มี RLS แบบ Postgres |
| **Firebase Firestore** | มี free tier | ไม่มี SQL join/aggregate ที่หน้าค้นหาต้องใช้, ราคาโตตามจำนวน read |
| **Railway / Render Postgres** | Render free Postgres หมดอายุใน 30 วัน | ไม่เหมาะกับ thesis ที่ต้องอยู่ยาวข้ามเทอม |

> **ข้อเสนอ:** ใช้ **Supabase เป็นหลัก** และเก็บ **Neon ไว้เป็นแผนสำรอง** — ทั้งคู่เป็น Postgres แท้
> `schema.sql` ไฟล์นี้ย้ายข้ามได้เกือบทั้งหมด ยกเว้นส่วนที่อ้าง `auth.users` และ RLS policy

### 2.3 ⚠️ 2 ข้อจำกัด free tier ที่กระทบเอกสารที่เขียนไว้แล้ว

1. **Architecture 13.2 เขียนว่าจะใช้ Supabase project แยกสำหรับ Dev / Staging / Production (3 ตัว)
   แต่ free tier ให้ active project ได้แค่ 2** → แนะนำ:
   - **Dev = Supabase CLI รัน local ด้วย Docker** (ฟรี ไม่จำกัด ไม่นับโควตา)
   - **Staging + Production = 2 cloud projects** (พอดีเพดาน)
2. **โปรเจกต์ถูกหยุดอัตโนมัติเมื่อไม่มี activity 1 สัปดาห์** — เสี่ยงมากกับวันสอบ/วัน demo เพราะ
   pg_cron ก็ไม่รันตอนโปรเจกต์หยุด แนะนำตั้ง GitHub Actions cron ยิง health-check สัปดาห์ละครั้ง
   (ฟรี) และซ้อม restore ไว้ล่วงหน้าอย่างน้อย 1 วันก่อน demo

### 2.4 โปรแกรม/เครื่องมือประกอบ (ฟรีทั้งหมด)

| งาน | เครื่องมือ | หมายเหตุ |
|---|---|---|
| Migration + local dev | **Supabase CLI** (`supabase init` / `db diff` / `db push`) | เก็บไฟล์ migration ใน git — ตอบข้อ CI/CD ของ Architecture 13.2 |
| จัดการ/ดูข้อมูล | **Supabase Studio** (มาในตัว) หรือ **DBeaver CE** / **pgAdmin 4** | |
| วาด ERD ประกอบเล่ม | **dbdiagram.io** (DBML) หรือ **Mermaid ER diagram** | Mermaid commit ลง git ได้ ไม่ต้องแนบรูป |
| ทดสอบ RLS | **pgTAP** | Architecture 13.1 ระบุไว้แล้ว |
| ฝั่ง Python (pipeline) | **`psycopg[binary]` v3** + `COPY` สำหรับ bulk insert | เร็วกว่า REST API มากตอน import 291 แถว — เพิ่มใน `requirements.txt` |
| ฝั่ง Frontend | **`@supabase/supabase-js`** + **SWR / TanStack Query** | ตรงกับ Architecture หัวข้อ 9 |

---

## 3. โครงสร้างที่ออกแบบ (สรุปจาก `schema.sql`)

```
school_data ── schools ─┬─ school_curriculums ─ curriculums ─ curriculum_aliases
 (School Data Svc)      ├─ school_levels ────── grade_levels ─ grade_level_aliases
                        └─ school_versions ─┬─ version_fees        (ค่าเทอมรายชั้น)
                                            ├─ version_extra_fees  (hidden cost)
                                            └─ version_safety      (safeguarding/ความปลอดภัย)
                           school_scrape_log

community   ── reviews                          (Pre-Moderation)
               data_correction_reports ─ report_submissions
               forum_posts ─ forum_comments     (Post-Moderation)
               forum_likes │ forum_reports

user_data   ── user_accounts ─┬─ children_profiles 🔒
                              ├─ favorites
                              └─ comparison_sets (share_token / share_enabled)
ai          ── conversations ─ messages │ school_embeddings (pgvector)
ops         ── audit_log (append-only) │ failed_jobs
```

### จุดออกแบบสำคัญ 8 ข้อ

1. **`opec_school_code` เป็น natural key** — OPEC มีรหัสโรงเรียน 10 หลักครบทุกแถว ใช้เป็น unique key
   ทำให้ re-import ซ้ำกี่รอบก็ไม่เกิดข้อมูลซ้ำ (ตอบ UC-A02 E5 ที่ระดับ database ไม่ใช่แค่ logic)

2. **ตาราง alias สำหรับหลักสูตร/ระดับชั้น** — ข้อมูลจริงเก็บเป็น free-text ไทยที่ไม่ normalize
   (`"หลักสูตรราชอาณาจักร"`, `"IB"`, `"IGCSE and A-Level"`, `"United State (Californian) Common Core"`)
   ถ้าไม่ map เป็นรหัสมาตรฐาน ตัวกรอง "หลักสูตร: British" ของ UC-G01 จะกรองไม่เจอโรงเรียนครึ่งหนึ่ง

3. **คอลัมน์ `pub_*` บน `schools` เป็น read model** — projection จากเวอร์ชันที่ published อยู่
   อัปเดตใน transaction เดียวกับ publish (ฟังก์ชัน `publish_version()`) ทำให้หน้าค้นหากรอง/เรียงด้วย
   index ปกติได้ และ**ไม่ถือเป็น "search index แยกที่ต้อง sync"** ตามที่ UC-G01 E4 ยืนยันไว้
   เพราะอัปเดตพร้อมกันแบบ atomic

4. **ค้นหาชื่อโรงเรียนใช้ `pg_trgm` ไม่ใช่ full-text search** — ⚠️ จุดที่ยังต้องแก้ในเอกสาร:
   Architecture หัวข้อ 5 เขียนว่า "full-text search ของ Postgres พอสำหรับค้นหาชื่อโรงเรียนแบบ fuzzy"
   แต่ **Postgres ไม่มี dictionary ภาษาไทย ตัดคำไทยไม่ได้** `to_tsvector` จึงใช้กับ `name_th`
   ไม่ได้ผลจริง — `pg_trgm` ทำงานระดับตัวอักษร ใช้ได้ทั้งไทย/อังกฤษ และทนพิมพ์ผิด

5. **Database role ต่อ Service** (ข้อ 10 ใน `schema.sql`) — เอกสารพูดถึง Golden Rule ไว้เยอะแต่ไม่เคย
   ระบุว่าจะ**บังคับ**ยังไง ตอนนี้บังคับด้วย `GRANT` จริง: `svc_ai` ไม่มีสิทธิ์แตะ schema `school_data`
   เลยแม้เขียน SQL ผิด — ใช้ defend คำว่า "Microservices" ได้จริง ไม่ใช่แค่แบ่งชื่อ schema

6. **`children_profiles` ไม่เปิด RLS ให้ Admin อ่าน** — เป็นข้อมูลอ่อนไหวสุดตาม PDPA
   UC-A05 ต้องการแค่ "ลบ" ไม่ใช่ "อ่าน" จึงให้ `account-deletion-cron` ทำด้วยสิทธิ์ระบบแทน

7. **ฟอรัมใช้ `content_status` แยก type จาก `review_status`** — ค่าเหมือนกันแต่ **default ต่างกันคนละขั้ว**
   (`forum_posts` default `approved` = Post-Moderation, `reviews` default `pending` = Pre-Moderation)
   แยก type ไว้เพื่อไม่ให้เผลอ copy default ผิดกันในอนาคต ซึ่งจะทำให้ฟอรัมเงียบหรือรีวิวหลุด moderation

8. **`forum_reports` ผู้ใช้ทั่วไป select ไม่ได้เลย** — insert ได้อย่างเดียว อ่านได้เฉพาะ Admin
   ป้องกันไม่ให้ใครรู้ว่าใครรายงานใคร ซึ่งจะกลายเป็นเครื่องมือกลั่นแกล้งกันเองในชุมชน

---

## 4. การแมปข้อมูลที่มีอยู่ → ตารางใหม่

| ต้นทาง | ปลายทาง |
|---|---|
| `international_schools_thailand_opec.json` → `school_code, name_th/en, province, address, lat/lng, website, logo, student/teacher_count` | `school_data.schools` (+ `geom` จาก `ST_MakePoint(lng, lat)`) |
| `.curriculums[]` (ไทย free-text) | `curriculum_aliases` → `school_curriculums` |
| `.levels_offered[]` (ไทย) | `grade_level_aliases` → `school_levels` |
| `.vision / mission / school_history / uniqueness` (มีแค่ ~20/291) | เก็บใน `data_snapshot` และใช้เป็น**เนื้อหาตั้งต้นของ pgvector** — ตอบช่องว่าง "ไม่มี free text ให้ vector search" ที่ Architecture หัวข้อ 12 บอกไว้ ได้บางส่วนโดยไม่ต้องสแครปเพิ่ม |
| ผลลัพธ์ scraper ทั้งก้อน | `school_versions.data_snapshot` (JSONB) |
| `.tuition_by_grade[]` | `version_fees` (numeric + `academic_year` แกะจาก `notes` เช่น `"Academic Year 2026/27"`) |
| `.hidden_costs[]` | `version_extra_fees` (`frequency` แกะจาก `notes`: "once only" → `once`, "Billed termly" → `per_term`) |
| `.safety_and_security` | `version_safety` |
| `.confidence`, `.confidence_reasoning`, `.page_scraped` | `school_versions` |
| `scrape_log.json`, `.elapsed_sec`, `.status` | `school_scrape_log` |
| `src/api/mock/forumPosts.ts` (`Post`/`Comment`) | `community.forum_posts` / `forum_comments` (`category` ตรงกับ enum เดิม 4 ค่า) |

---

## 5. ลำดับการลงมือ (แนะนำ)

1. `supabase init` + วาง `db/schema.sql` เป็น migration แรก แล้ว `supabase db reset` ทดสอบ local ก่อน
2. เขียนสคริปต์ import ครั้งเดียว: OPEC JSON → `schools` + join tables (291 แถว)
3. แก้ `microservices/db_service.py` ให้เขียนลง Postgres แทนไฟล์ JSON —
   **ลบกลไก Saga ด้วย `.bak` ออกได้เลย** เพราะ `BEGIN/COMMIT` จริงทำหน้าที่นี้แทนแบบปลอดภัยกว่า
4. เพิ่ม `psycopg[binary]` ใน `requirements.txt`, เพิ่ม `@supabase/supabase-js` ใน `package.json`
5. เปลี่ยน body ของ `src/api/schoolsApi.ts` / `opecApi.ts` / `forumApi.ts` จาก mock → Supabase client
   (โครง FE ไม่ต้องแก้)
6. เขียน pgTAP test ของ RLS อย่างน้อย 4 เคส: อ่าน `children_profiles` ข้ามบัญชี,
   อ่าน `comparison_sets` ข้ามบัญชี, แก้ `audit_log`, และ select `forum_reports` ด้วยบัญชีที่ไม่ใช่ admin
7. ค่อยเพิ่ม `hnsw` index ของ pgvector **หลังมีข้อมูลจริงแล้ว**

---

## 6. สิ่งที่ยังไม่ตัดสินใจ (ต้องให้ทีมเลือก)

| ประเด็น | ทางเลือก |
|---|---|
| มิติ `embedding vector(768)` | ตอนนี้ตั้งตาม Gemini `text-embedding-004` (768) — ถ้าเปลี่ยนไป OpenAI `text-embedding-3-small` ต้องเป็น 1536 **และเปลี่ยนทีหลังไม่ได้โดยไม่ล้างตาราง** |
| เก็บกี่เวอร์ชันย้อนหลัง | ยังไม่ได้ตั้ง retention — 500 MB รับได้สบาย แต่ควรมีนโยบายเขียนไว้ |
| Rate limiter counter | เอกสารบอกว่ามี rate limit แต่ไม่ระบุที่เก็บ — แนะนำตาราง `ops.rate_limits` เล็กๆ (ไม่มี Redis ในสแตกนี้) |
| ตัวนับ `like_count` / `comment_count` | ตอนนี้เป็นคอลัมน์ denormalize — ควรอัปเดตด้วย trigger หรือคำนวณสดตอนอ่าน ยังไม่ได้ตัดสิน |

---

## 7. สถานะส่วนต่างระหว่างโค้ดกับเอกสาร

| ประเด็น | สถานะ |
|---|---|
| ฟอรัมไม่มีใน Use Case | ✅ **แก้แล้ว (v6.2)** — เพิ่ม UC-G08 (อ่าน), UC-U09 (เขียน/รายงาน), UC-A12 (moderate) + ตาราง 7.11-7.13 |
| `safety_and_security` ไม่มีในเอกสาร | ✅ **แก้แล้ว (v6.2)** — เพิ่มแท็บใน UC-G02 (+ E2b), แถวเปรียบเทียบใน UC-U03, ขั้นตอนสกัดใน UC-A03, ตาราง 7.10 |
| Architecture หัวข้อ 5: full-text search ภาษาไทย | ✅ **แก้แล้ว (v6.3)** — เปลี่ยนเป็น `pg_trgm` พร้อมเหตุผลว่า Postgres ไม่มี dictionary ภาษาไทย |
| Architecture หัวข้อ 13.2: 3 Supabase projects | ✅ **แก้แล้ว (v6.3)** — ปรับเป็น Dev local (Supabase CLI) + Staging + Production = 2 cloud projects พอดีเพดาน พร้อมเตือนเรื่องโปรเจกต์ถูกหยุดหลังไม่มี activity 1 สัปดาห์ |
| เอกสารหัวข้อ 7 ไม่ตรงกับ `schema.sql` (ขาด 10 ตาราง + คอลัมน์/enum/type ไม่ตรง) | ✅ **แก้แล้ว (v6.3)** — Use Case doc หัวข้อ 7 เป็น Data Dictionary ครบ 28 ตารางตรงกับ DDL แบบคอลัมน์ต่อคอลัมน์ (7.14-7.21 เป็นของใหม่) และเคลียร์ว่า JSONB เป็น provenance ส่วนตาราง normalize เป็นค่าที่ระบบใช้จริง |
| `src/api/schoolsApi.ts` คอมเมนต์อ้าง `testz.py` ที่ไม่มีแล้ว | ✅ **แก้แล้ว** — ชี้ไป `microservices/scraper_service.py` |
| FE ใช้ `id: number` แต่ schema เป็น `uuid` | ⏳ **ยังไม่แก้โดยตั้งใจ** — เป็นงานที่ต้องทำพร้อมกันตอนต่อ DB จริง (ขั้นที่ 5 ของหัวข้อ 5) แก้ตอนนี้จะทำให้ mock data พังโดยไม่ได้อะไร |
| `requirements.txt` / `package.json` ยังไม่มี driver | ⏳ **ยังไม่แก้โดยตั้งใจ** — เพิ่ม dependency ที่ยังไม่มีโค้ดเรียกใช้ จะกลายเป็น dead dependency ให้เพิ่มตอนขั้นที่ 3-4 ของหัวข้อ 5 |

---

**Sources:**
- [Supabase Pricing](https://supabase.com/pricing)
- [Neon Pricing](https://neon.com/pricing)
