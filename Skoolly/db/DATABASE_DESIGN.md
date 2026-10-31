# Skoolly — Database Design & Tooling Decision

เอกสารนี้อธิบายเหตุผลเบื้องหลัง [`db/schema.sql`](schema.sql) และการเลือกเครื่องมือแบบ free tier
วิเคราะห์จาก **Use Case จริง** (`reference/use_case_specification_final_v6.md` — v6.6, 19 Use Case, Data Dictionary 25 ตาราง)
และ **โค้ด/ข้อมูลที่มีอยู่จริง** ในโปรเจกต์ ไม่ใช่จากทฤษฎีอย่างเดียว

---

## 0. สถานะปัจจุบันของโปรเจกต์ (ตรวจจากโค้ดและฐานข้อมูลจริง 31 ต.ค. 2569)

| สิ่งที่มีอยู่ | รายละเอียด | ผลต่อการออกแบบ |
|---|---|---|
| **มีฐานข้อมูลจริงแล้ว** (Supabase Postgres 17.6) | `schools` 290 (active ทั้งหมด), `school_versions` 766, `version_fees` 1,956, `version_extra_fees` 2,005, `version_safety` 476, `school_scrape_log` 1,544, `official_website_registry` 291, `user_accounts` 3 (admin 2) ส่วนตารางฟอรัม ผู้ใช้ และ AI ยังว่าง รายละเอียดอยู่ในหัวข้อ 8 | pipeline OPEC และ scraper เขียนลง Postgres โดยตรงแล้ว ชุด Saga (`db_service.py`, `results.json`) ไม่ได้อยู่ในเส้นทางหลักอีก |
| **ข้อมูล OPEC 290 โรงเรียน** | `data/international_schools_thailand_opec.json` — lat/lng ครบ 290/290, website 283/290, curriculums 256/290 (free-text ไทย), levels 285/290 | ต้องมีตาราง lookup + alias เพื่อ normalize ก่อน ไม่งั้นตัวกรองของ UC-01 ใช้ไม่ได้จริง |
| **ผลลัพธ์ scraper** | `tuition_by_grade`, `hidden_costs` (มี `frequency` ของแต่ละรายการ), `safety_and_security`, `signature_programs`, `facilities`, `confidence`, `confidence_reasoning` | เป็นตัวกำหนดหน้าตาตาราง `version_fees` / `version_extra_fees` / `version_safety` โดยตรง ส่วน `signature_programs` กับ `facilities` อ่านจาก `data_snapshot` |
| **Frontend React 19 + Vite** | หน้าเว็บอ่านข้อมูลผ่าน FastAPI `microservices/opec_service.py` (Vite proxy `/api` ไปพอร์ต 8004) ซึ่งต่อ Postgres ตรงด้วย `DATABASE_URL` ในฐานะ role `postgres` ส่วน `@supabase/supabase-js` ใช้แค่ระบบล็อกอิน | Data API (Auto-API) กับ RLS ยังไม่ได้ถูกใช้โดยหน้าเว็บ แต่ยังเปิดอยู่ จึงยังต้องดูแลสิทธิ์ให้ถูก (หัวข้อ 8.3) |
| **หน้า Forum** | `src/pages/ForumPage.tsx` อ่านผ่าน `GET /api/public/forum/posts` ยังไม่มีการเขียนกระทู้ | ตาราง `forum_*` พร้อมแล้วแต่ยังไม่มีแถว |
| **scraper เก็บ safety/safeguarding** | `EXTRACT_SCHEMA.safety_and_security` | ✅ ผนวกเข้าเอกสารแล้ว → แท็บใน UC-02, แถวเปรียบเทียบใน UC-03, ตาราง `version_safety` |

**ขนาดข้อมูลจริง:** ประมาณการเดิมคือ OPEC ~2.3 KB/โรง และผลลัพธ์ scraper ~3.9 KB/โรง รวม ~6.3 KB ต่อโรงต่อเวอร์ชัน
290 โรง × 24 เวอร์ชัน (สแครปเดือนละครั้ง 2 ปี) ≈ **44 MB**
ขนาดจริงวันที่ 31 ต.ค. 2569 ที่ 766 เวอร์ชัน: ทั้งฐาน 29 MB (รวมตารางระบบและ PostGIS) ส่วนตารางของแอปรวม 8.7 MB ยังอยู่ในกรอบที่ประมาณไว้

---

## 1. RDB หรือ NoSQL? → **RDB (PostgreSQL) ตัวเดียว** ไม่ต้องมี NoSQL แยก

คำตอบสั้น: **ใช้ Postgres อย่างเดียว แต่ใช้ทั้ง 2 สไตล์ในตัวมันเอง** — ตารางแบบ relational สำหรับสิ่งที่ต้องกรอง/join
และคอลัมน์ **JSONB** สำหรับสิ่งที่โครงสร้างไม่แน่นอน (snapshot ดิบจาก AI)

### เหตุผลที่ต้องเป็น RDB

| หลักฐานจาก Use Case | ทำไม NoSQL ตอบไม่ได้ |
|---|---|
| UC-01 กรองด้วยหลักสูตร + ระดับชั้น + ช่วงค่าเทอม + ระยะทาง พร้อมกัน | เป็น multi-attribute range query แบบคลาสสิก — Document DB ต้องสร้าง index ผสมเองหรือ denormalize หนัก |
| Architecture 8.5: publish ต้องแก้ `schools` + `school_versions` ใน **transaction เดียว** | MongoDB free tier ทำ multi-document transaction ได้ก็จริงแต่แพงและซับซ้อนกว่า `BEGIN/COMMIT` มาก |
| Architecture 4.2: `account-deletion-cron` แก้ **3 schema พร้อมกันในธุรกรรมเดียว** | ต้องมี ACID ข้าม collection — จุดที่ Document DB เสียเปรียบชัดที่สุด |
| Use Case 8.1: **RLS ทำหน้าที่ authorization แทน API Gateway** | ไม่มีใน NoSQL ตัวไหนในระดับเดียวกับ Postgres RLS |
| Use Case 8.2: **Postgres Advisory Lock** กัน scraper job ซ้อน | ต้องมี Redis หรือ lock service เพิ่มถ้าไม่ใช้ Postgres |
| UC-07 คำนวณเงิน ต้อง decimal-safe | JSON number = float64 → ปัดเศษพลาดได้จริง ต้องใช้ `numeric` ของ SQL |
| RAG (Use Case Spec หัวข้อ 3.4.1) — **ยังไม่เปิดใช้ในเฟสนี้** แต่ถ้าเปิดต้องการ vector search | `pgvector` อยู่ใน Postgres แล้ว ไม่ต้องมี Pinecone/Chroma แยก |
| UC-01 และ UC-02 ต้องการระยะทางและแผนที่ | `PostGIS` อยู่ใน Postgres แล้ว |
| UC-05 ต้องบังคับ "1 บัญชีรายงาน 1 เนื้อหาได้ครั้งเดียว" | unique constraint 1 บรรทัด vs เขียน logic กันเองทุกจุดที่เขียนข้อมูล |

**ข้อมูลมีแค่ 290 แถว** — เหตุผลคลาสสิกที่คนเลือก NoSQL (scale แนวนอน, write throughput สูง) ไม่มีอยู่ในระบบนี้เลย

### แล้ว NoSQL ใช้ตรงไหน → ใช้ในรูป **JSONB คอลัมน์** ไม่ใช่ database แยก

| ข้อมูล | เก็บแบบไหน | เหตุผล |
|---|---|---|
| `school_versions.data_snapshot` | **JSONB** | payload ดิบจาก AI ที่ schema เปลี่ยนได้ตลอด เก็บไว้เป็นหลักฐาน/rollback |
| `messages.tool_calls`, `failed_jobs.payload`, `audit_log.before/after` | **JSONB** | โครงสร้างต่างกันทุก event |
| ค่าเทอมรายชั้น, hidden cost, safety | **ตาราง normalize** | ต้องคำนวณเงิน (numeric) + Use Case Spec หัวข้อ 7.3 บังคับให้ `academic_year`/`source_published_at` กำกับ **ระดับฟิลด์** ซึ่งเป็นแถวโดยธรรมชาติ |
| ตัวกรองหน้าค้นหา | **คอลัมน์ typed** | filter ใน JSONB ช้าและเขียน query ยากกว่ามาก |

> **หลักที่ใช้ตัดสิน:** ถ้าฟิลด์นั้นถูก **filter / sort / คำนวณ** → ทำเป็นคอลัมน์
> ถ้าถูกอ่านทั้งก้อนเพื่อแสดงผลหรือเก็บเป็นหลักฐาน → JSONB

---

## 2. เครื่องมือที่แนะนำ (เน้น free tier)

### 2.1 ตัวหลัก: **Supabase Free** ✅

ตรวจสอบจากหน้า pricing จริง (กันยายน 2569):

| ทรัพยากร | Free plan | ระบบนี้ใช้จริงเท่าไหร่ | เหลือ |
|---|---|---|---|
| Database | **500 MB** | ~44 MB (2 ปี) | ~11× |
| File storage | **1 GB** | โลโก้ 290 ไฟล์ + PDF export | เหลือเยอะ |
| Monthly Active Users | **50,000** | ผู้ปกครองทดสอบ + UAT 5-10 คน | เหลือเยอะ |
| Egress | **5 GB** + cached 5 GB | เว็บ demo | พอ |
| Edge Function invocations | **500,000/เดือน** | 7 functions | พอ |
| Active projects | **2 โปรเจกต์** | ใช้จริง 1 (Production) — Dev รัน local | เหลือ 1 เผื่อเพิ่ม staging ทีหลัง |
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

1. **Architecture 13.2 เดิมเขียนว่าจะใช้ Supabase project แยกสำหรับ Dev / Staging / Production
   (3 ตัว) แต่ free tier ให้ active project ได้แค่ 2 — และพอดูบริบทจริงแล้วแม้แต่ 2 ก็เกินจำเป็น**
   → ข้อสรุป: **ใช้ cloud project เดียว**
   - **Dev = Supabase CLI รัน local ด้วย Docker** (ฟรี ไม่จำกัด ไม่นับโควตา เสียหายแล้ว reset ใหม่ได้)
   - **Production = cloud project เดียว** ใช้ทั้ง demo/UAT/ผู้ใช้จริง
   - **ยังไม่ทำ Staging** เพราะ local กันความเสี่ยงส่วนใหญ่ไปแล้ว และตอนนี้ยังไม่มีข้อมูลจริงของ
     ใครเลย (290 โรงเรียนสร้างใหม่จาก JSON ได้ทุกเมื่อ) — การมี staging ที่ไม่มีใครแตะบน free tier
     ที่หยุดโปรเจกต์เองหลัง 1 สัปดาห์ จะกลายเป็นภาระต้องคอยปลุก 2 ที่โดยไม่ได้ป้องกันอะไรเพิ่ม
   - **เพิ่ม Staging เมื่อ:** เริ่ม UAT กับผู้ปกครองจริง เพราะจะมี `children_profiles` ที่เป็น
     ข้อมูลเด็กจริงตาม PDPA ซึ่งสร้างใหม่ไม่ได้
2. **โปรเจกต์ถูกหยุดอัตโนมัติเมื่อไม่มี activity 1 สัปดาห์** — เสี่ยงมากกับวันสอบ/วัน demo เพราะ
   pg_cron ก็ไม่รันตอนโปรเจกต์หยุด แนะนำตั้ง GitHub Actions cron ยิง health-check สัปดาห์ละครั้ง
   (ฟรี) และซ้อม restore ไว้ล่วงหน้าอย่างน้อย 1 วันก่อน demo

### 2.4 โปรแกรม/เครื่องมือประกอบ (ฟรีทั้งหมด)

| งาน | เครื่องมือ | หมายเหตุ |
|---|---|---|
| Migration + local dev | **Supabase CLI** (`supabase init` / `db diff` / `db push`) | เก็บไฟล์ migration ใน git — ตอบข้อ CI/CD ของ Architecture 13.2 |
| จัดการ/ดูข้อมูล | **Supabase Studio** (มาในตัว) หรือ **DBeaver CE** / **pgAdmin 4** | |
| วาด ERD ประกอบเล่ม | **dbdiagram.io** (DBML) | เลือกตัวนี้เพราะรูปที่ได้อ่านง่ายกว่าตอนย่อลงหน้ากระดาษ ไฟล์ต้นทางอยู่ที่ `report/images/er-diagram.dbml` และ export เป็น `er-diagram.png` ใส่ในรายงาน ส่วนไฟล์ Mermaid ที่เคยทำไว้ยังอยู่ที่ `reference/er_diagram*.mmd` ใช้ดูแยกรายบริการได้ |
| ทดสอบ RLS | **pgTAP** | Architecture 13.1 ระบุไว้แล้ว |
| ฝั่ง Python (pipeline) | **`psycopg[binary]` v3** + `COPY` สำหรับ bulk insert | เร็วกว่า REST API มากตอน import 290 แถว — เพิ่มใน `requirements.txt` |
| ฝั่ง Frontend | **`@supabase/supabase-js`** (เฉพาะล็อกอิน) | ข้อมูลอื่นอ่านผ่าน FastAPI `/api` ด้วย `fetch` ธรรมดา ไม่ได้ใช้ SWR / TanStack Query ตามที่ Architecture หัวข้อ 9 วางไว้ |

---

## 3. โครงสร้างที่ออกแบบ (สรุปจาก `schema.sql`)

```
school_data ─┬─ schools ─┬─ curriculums    (lookup พร้อม aliases[])  ← curriculums[] อ้างด้วย code
(School Data │            ├─ grade_levels  (lookup พร้อม aliases[])  ← levels_offered[] อ้างด้วย code
   Service)  │            ├─ school_google_reviews   (cache รีวิวจาก Google Places)
             │            └─ school_versions ─┬─ version_fees        (ค่าเทอมรายชั้น)
             │                                ├─ version_extra_fees  (ค่าใช้จ่ายแฝง)
             │                                └─ version_safety      (ความปลอดภัย/คุ้มครองเด็ก)
             ├─ school_scrape_log            (บันทึกการทำงานของ pipeline)
             └─ official_website_registry    (ทะเบียน URL ที่ยืนยันแล้ว)

community   ── data_correction_reports ─ report_submissions
               forum_posts ─ forum_comments     (Post-Moderation)
               forum_likes │ forum_reports

user_data   ── user_accounts ─┬─ children_profiles 🔒
                              ├─ favorites
                              └─ comparison_sets (share_token / share_enabled)
ai          ── conversations ─ messages │ school_embeddings (pgvector, ⏸ ยังไม่เปิดใช้)
ops         ── audit_log (append-only) │ failed_jobs
```

### จุดออกแบบสำคัญ 8 ข้อ

1. **`opec_school_code` เป็น natural key** — OPEC มีรหัสโรงเรียน 10 หลักครบทุกแถว ใช้เป็น unique key
   ทำให้ re-import ซ้ำกี่รอบก็ไม่เกิดข้อมูลซ้ำ (ตอบ UC-12 E5 ที่ระดับ database ไม่ใช่แค่ logic)

2. **คอลัมน์ `aliases` ในตาราง lookup ของหลักสูตร/ระดับชั้น** — ข้อมูลจริงเก็บเป็น free-text ไทย
   ที่ไม่ normalize (`"หลักสูตรราชอาณาจักร"`, `"IB"`, `"IGCSE and A-Level"`,
   `"United State (Californian) Common Core"`) ถ้าไม่ map เป็นรหัสมาตรฐาน ตัวกรอง "หลักสูตร: British"
   ของ UC-01 จะกรองไม่เจอโรงเรียนครึ่งหนึ่ง — เก็บ alias เป็น `text[]` ในตาราง lookup เอง
   แทนการแยกเป็นตาราง `*_aliases` ต่างหาก เพราะเป็นความสัมพันธ์ที่ไม่มี attribute อื่นเลย

3. **คอลัมน์ `pub_*` บน `schools` เป็น read model** — projection จากเวอร์ชันที่ published อยู่
   อัปเดตใน transaction เดียวกับ publish ทำให้หน้าค้นหากรอง/เรียงด้วย
   index ปกติได้ และ**ไม่ถือเป็น "search index แยกที่ต้อง sync"** ตามที่ UC-01 E4 ยืนยันไว้
   เพราะอัปเดตพร้อมกันแบบ atomic
   ตัวที่ใช้งานจริงคือ `approve_school_version()` ใน `supabase_sync.py` ซึ่งคิด `pub_tuition_min/max_thb`
   จาก `annual_thb` อย่างเดียว ฟังก์ชัน `school_data.publish_version()` ที่เคยออกแบบไว้ไม่มีโค้ดเรียก
   จึงลบออกทั้งจาก `schema.sql` และจากฐานจริงแล้ว (`db/migrations/2026-10-31_live_alignment.sql`)

4. **ค้นหาชื่อโรงเรียนใช้ `pg_trgm` ไม่ใช่ full-text search** — **Postgres ไม่มี dictionary
   ภาษาไทย จึงตัดคำไทยไม่ได้** `to_tsvector` ใช้กับ `name_th` ไม่ได้ผลจริง ขณะที่ `pg_trgm`
   ทำงานที่ระดับตัวอักษร ใช้ได้ทั้งไทยและอังกฤษ และทนการพิมพ์ผิด
   (Architecture หัวข้อ 5 เดิมเขียนว่าใช้ full-text search และแก้ให้ตรงกันแล้วตั้งแต่ v6.3)

5. **Database role ต่อ Service** (ข้อ 10 ใน `schema.sql`) — เอกสารพูดถึง Golden Rule ไว้เยอะแต่ไม่เคย
   ระบุว่าจะ**บังคับ**ยังไง ตอนนี้บังคับด้วย `GRANT` จริง: `svc_ai` ไม่มีสิทธิ์แตะ schema `school_data`
   เลยแม้เขียน SQL ผิด — ใช้ defend คำว่า "Microservices" ได้จริง ไม่ใช่แค่แบ่งชื่อ schema
   สถานะจริง: role `svc_*` ทั้ง 5 ตัวมีอยู่ในฐานแล้ว แต่ backend ทุกตัวยังต่อด้วย `DATABASE_URL` ของ role `postgres`
   การแยกสิทธิ์นี้จึงยังไม่มีผลตอนรันจริง

6. **`children_profiles` ไม่เปิด RLS ให้ Admin อ่าน** — เป็นข้อมูลอ่อนไหวสุดตาม PDPA
   UC-15 ต้องการแค่ "ลบ" ไม่ใช่ "อ่าน" จึงให้ `account-deletion-cron` ทำด้วยสิทธิ์ระบบแทน

7. **ฟอรัมใช้ `content_status` ที่มี default เป็น `approved`** — เผยแพร่ทันทีแล้วตรวจเมื่อถูกรายงาน
   (Post-Moderation) ตั้งแต่ v6.5 ฟอรัมเป็นเนื้อหาจากผู้ใช้ชนิดเดียวที่ระบบเป็นเจ้าของ เพราะรีวิว
   ย้ายไปใช้ข้อมูลจาก Google แล้ว — แยก enum ของฟอรัมออกจากคิวตรวจอื่นไว้ เพื่อไม่ให้เผลอ
   เปลี่ยน default ผิดในอนาคต ซึ่งจะทำให้กระทู้ทุกอันค้างรอตรวจและฟอรัมหยุดเคลื่อนไหว

8. **`forum_reports` ผู้ใช้ทั่วไป select ไม่ได้เลย** — insert ได้อย่างเดียว อ่านได้เฉพาะ Admin
   ป้องกันไม่ให้ใครรู้ว่าใครรายงานใคร ซึ่งจะกลายเป็นเครื่องมือกลั่นแกล้งกันเองในชุมชน

---

## 4. การแมปข้อมูลที่มีอยู่ → ตารางใหม่

| ต้นทาง | ปลายทาง |
|---|---|
| `international_schools_thailand_opec.json` → `school_code, name_th/en, province, address, lat/lng, website, logo, student/teacher_count` | `school_data.schools` (+ `geom` จาก `ST_MakePoint(lng, lat)`) |
| `.curriculums[]` (ไทย free-text) | `supabase_sync.opec_curriculum_codes()` แปลงเป็น code → `schools.curriculums text[]` (ตรวจด้วย trigger `schools_vocab_check` กับ lookup `curriculums`) ข้อมูลจาก OPEC เป็นแหล่งหลัก วิชาภาษา/วัฒนธรรม/ประวัติศาสตร์ไทยที่ทุกโรงเรียนต้องสอนไม่นับเป็นหลักสูตร ถ้า OPEC ไม่ได้ระบุหลักสูตร (ว่าง หรือมีแค่ "หลักสูตรนานาชาติ") จึงใช้หลักสูตรจากเวอร์ชันเว็บโรงเรียนที่อนุมัติแล้ว การอนุมัติร่างค่าเทอมไม่เปลี่ยนหลักสูตรของโรงเรียนที่ OPEC มีข้อมูล โรงเรียนที่ OPEC กับเว็บบอกคนละหลักสูตรโดยไม่มีตัวไหนตรงกันเลย จะขึ้นในแท็บ "หลักสูตรที่ขัดกัน" ของหน้าแอดมินให้คนตัดสิน ค่าที่ยืนยันเก็บใน `schools.curriculums_confirmed_at/_by` และการนำเข้า OPEC จะไม่ทับ (ตัดสินใจ 31 ต.ค. 2569 ทดสอบอยู่ใน `microservices/opec/test_curriculums.py`) |
| `.levels_offered[]` (ไทย) | `GRADE_LEVEL_MAP` แปลงเป็น code → `schools.levels_offered text[]` (ตรวจกับ lookup `grade_levels`) |
| รายชื่อโรงเรียนนานาชาติของ OPEC (มี/ไม่มีในรายชื่อ) | ขั้น "ดึงข้อมูล OPEC" และปุ่ม "ตรวจกับรายชื่อ OPEC" (หน้า Data Pipeline ไม่นำเข้าข้อมูลอื่น) เรียก `supabase_sync.mark_opec_presence()` บันทึกวันที่โรงเรียนหายจากรายชื่อใน `schools.opec_missing_since` (ล้างเมื่อกลับมา) ระบบไม่ซ่อนโรงเรียนเอง แอดมินกรองดูในหน้ารายชื่อโรงเรียน แล้วกดปิดจากหน้ารายละเอียด ปิดโรงเรียน = `status = 'archived'` พร้อม `archived_at` (และ `archived_reason` เมื่อหายจาก OPEC) ผู้ใช้ไม่เห็นแต่ข้อมูลยังอยู่และเปิดคืนได้ (ตัดสินใจ 31 ต.ค. ปรับ 1 พ.ย. 2569: เงื่อนไขเดาอื่น เช่น นักเรียน 0 คน หรือไม่มีเว็บ จับโรงเรียนที่ยังเปิดอยู่ 3 ใน 4 แห่ง จึงใช้แค่รายชื่อ OPEC) ตั้งแต่ปลายปี 2569 API ค้นหาของ OPEC ต้องระบุจังหวัด `fetch_opec.search_international_schools()` จึงดึงทีละจังหวัด 77 ครั้ง |
| `.vision / mission / school_history / uniqueness` (vision 25, mission 21, school_history 22, uniqueness 15 จาก 290) | เก็บใน `data_snapshot` — เป็นข้อความอิสระชุดเดียวที่มีอยู่ตอนนี้ จึงเป็นจุดตั้งต้นที่ดีที่สุดถ้าวันหนึ่งเปิดใช้ RAG (Use Case Spec หัวข้อ 3.4.1) แต่ **ยังไม่เปิดใช้ในเฟสนี้** และปริมาณระดับ 15-25 จาก 290 โรงเรียนยังน้อยเกินกว่าจะทำให้ vector search มีความหมาย |
| ผลลัพธ์ scraper ทั้งก้อน | `school_versions.data_snapshot` (JSONB) |
| `.tuition_by_grade[]` | `version_fees` (numeric + `academic_year` แกะจาก `notes` เช่น `"Academic Year 2026/27"`) `annual_thb` คือค่าเทอมรวมทั้งปี ส่วน `semester_thb` คือค่าต่อหนึ่งเทอมหรือภาคตามที่เว็บเขียน ไม่ได้คูณ ระบบไม่เอา `semester_thb` ไปคำนวณเป็นค่าต่อปี เพราะโรงเรียนมีทั้งแบบ 2 และ 3 เทอม ตอนส่งให้เครื่องคิดค่าเทอม `grade_years.py` จะแยกแถวที่ครอบหลายปี (เช่น "Year 7 - Year 9") เป็นปีละแถว และเหลือแถวเดียวต่อปีเมื่อหน้าเว็บมีหลายตัวเลือก (ครึ่งวัน/เต็มวัน) |
| `.hidden_costs[]` | `version_extra_fees` (`frequency` มาจากช่อง `frequency` ที่ Gemini ตอบ: `once` / `per_year` / `per_semester` (ปีละ 2) / `per_term` (ปีละ 3) / `per_month` / `conditional` / `unknown` ถ้าได้ `unknown` จะเดาจากข้อความด้วย `guess_fee_frequency()` แถวที่บันทึกก่อนมีช่องนี้ยังเป็น `unknown` อยู่ 580 แถว) |
| `.safety_and_security` | `version_safety` |
| `.confidence`, `.confidence_reasoning`, `.page_scraped` | `school_versions` |
| `scrape_log.json`, `.elapsed_sec`, `.status` | `school_scrape_log` |
| ฟอรัม (`Post`/`Comment` ใน `src/api/forumApi.ts`) | `community.forum_posts` / `forum_comments` (`category` ตรงกับ enum เดิม 4 ค่า) ตอนนี้อ่านอย่างเดียวผ่าน `fetch_forum_posts()` ใน `public_queries.py` |

---

## 5. ลำดับการลงมือ (แนะนำ)

### 5.0 ค่าที่ต้องเลือกตอนสร้างโปรเจกต์ Supabase

| ตัวเลือก | เลือก | เหตุผล |
|---|---|---|
| Region | **Southeast Asia (Singapore)** | ใกล้ผู้ใช้ไทยที่สุด |
| Enable Data API | ✅ เปิด | Frontend เรียก Auto-API ของแต่ละ schema ตรงตาม Architecture หัวข้อ 5/9 |
| Automatically expose new tables | ❌ **ปิด** | เราต้องคุมเองว่าตารางไหนเปิดให้เข้าถึง — ตารางอย่าง `school_versions` (มีเวอร์ชัน `pending_review`), `report_submissions`, `ops.failed_jobs` ห้ามหลุดออกสาธารณะ |
| Enable automatic RLS | ✅ เปิด | safety net ฟรี (มีผลกับ schema `public` ซึ่งเราไม่ได้ใช้) กันกรณีเผลอสร้างตารางทดสอบทิ้งไว้ |
| Postgres Type | **Postgres (DEFAULT)** | OrioleDB เป็น alpha และไม่การันตีว่ารองรับ PostGIS/pgvector/pg_cron — **ตัวเลือกนี้แก้ทีหลังไม่ได้** |

**สร้าง cloud project เดียวพอ** (ตั้งชื่อให้เป็น production ไปเลย) — ส่วน Dev ใช้ `supabase start`
รัน local ไม่ต้องสร้าง project เพิ่ม ดูเหตุผลข้อ 2.3

**ลำดับที่ถูกต้อง: รัน `schema.sql` ก่อน แล้วค่อยมาตั้ง Exposed schemas** — dropdown ของ Supabase
list เฉพาะ schema ที่มีอยู่จริงในฐานข้อมูลแล้วเท่านั้น ถ้ายังไม่รัน DDL จะเห็นแค่ `public` กับ
`graphql_public` เลือกอะไรไม่ได้

**หลังรัน `schema.sql` แล้วไปตั้งที่ Data API → แท็บ Settings → Exposed schemas:** ค่า default มีแค่ `public`
ต้องเพิ่ม `school_data`, `community`, `user_data`, `ai`, `ops` เข้าไป (Admin Dashboard ต้องใช้ทั้ง 5
ตาม Architecture หัวข้อ 9) โดยตารางที่ไม่ควรให้ใครอ่านผ่าน API เลย (`ai.school_embeddings`) จงใจเปิด RLS
ไว้โดยไม่มี policy select และไม่ GRANT ให้ใคร ซึ่งเท่ากับปิดสนิท ส่วน Edge Function/Pipeline ใช้ service role
ที่ bypass RLS อยู่แล้ว

> ฐานจริงตั้งค่าไว้ตามนี้แล้ว (ตรวจ 31 ต.ค. 2569: exposed คือ `public`, `graphql_public`, `school_data`,
> `user_data`, `community`, `ops`, `ai`) มี 3 ตารางที่ไม่เปิด RLS แต่เข้าถึงได้แค่อ่านหรือเข้าไม่ได้เลย (หัวข้อ 8.1)
> สิทธิ์ของ `user_accounts` ที่เคยให้ผู้ใช้เลื่อนตัวเองเป็น admin ได้ ปิดแล้ว 31 ต.ค. 2569 (หัวข้อ 8.3)

> **ไม่ต้องไปกดทีละตารางในช่อง "Exposed tables" ของ Dashboard** — ช่องนั้นคือ UI สำหรับสั่ง `GRANT`
> ให้ role `anon`/`authenticated` ซึ่ง `schema.sql` หัวข้อ 10.1 ทำให้ครบแล้วในรูปแบบที่อยู่ใน
> version control ตรวจทานได้และ deploy ซ้ำได้ ต่างจากการกดใน UI ที่ไม่มีร่องรอยว่าใครเปลี่ยนอะไร
> ตอนไหน — เหตุผลเดียวกับที่ปิด "Automatically expose new tables" ไว้ตั้งแต่แรก

### 5.1 ขั้นตอนถัดไป

**หลังรัน `schema.sql` เสร็จ ตรวจก่อนว่าลงครบจริง:**

```sql
select table_schema, count(*) from information_schema.tables
where table_schema in ('school_data','community','user_data','ai','ops')
group by 1 order by 1;                                   -- ต้องได้รวม 25
select extname from pg_extension order by 1;             -- ต้องมี postgis, vector, pg_trgm, pg_cron
select count(*) from school_data.curriculums;            -- 17
select count(*) from school_data.grade_levels;           -- 5

-- ค่าใน array ต้องอ้าง lookup ได้ทุกตัว (ทั้งสองคิวรีต้องคืน 0)
select count(*) from school_data.schools s where exists (
  select 1 from unnest(s.curriculums) x
  where not exists (select 1 from school_data.curriculums l where l.code = x));
select count(*) from school_data.schools s where exists (
  select 1 from unnest(s.levels_offered) x
  where not exists (select 1 from school_data.grade_levels g where g.code = x));
```

**สร้างบัญชี Admin** — RLS เช็ค role จาก `user_data.user_accounts` ไม่ได้เช็คจาก JWT claim
ดังนั้นการเป็น owner ของ Supabase project ไม่ได้ทำให้เข้า Admin Dashboard ได้เอง:
สร้าง user ที่ Authentication → Users → Add user ก่อน แล้วรัน

แถว `user_accounts` ถูกสร้างให้อัตโนมัติแล้วโดย trigger ในหัวข้อ 12.1 ของ `schema.sql`
เหลือแค่เลื่อนขั้นเป็น admin — **ต้องระบุตัวคนเสมอ ห้าม `update` ทั้งตาราง** เพราะคำสั่งแบบนั้น
จะเลื่อนขั้นผู้ปกครองทุกคนที่สมัครเข้ามาให้เป็น admin ทันทีถ้าเผลอรันซ้ำในอนาคต:

```sql
update user_data.user_accounts a set role = 'admin'
from auth.users u
where u.id = a.user_id and u.email = 'อีเมลที่ต้องการ';

-- ตรวจผลทุกครั้ง จำนวนแถวต้องเท่ากับจำนวน admin ที่ตั้งใจมีจริง
select u.email, a.role from user_data.user_accounts a
join auth.users u on u.id = a.user_id where a.role = 'admin';
```

Admin เป็นใครก็ได้ ไม่ได้ล็อกไว้ที่ทีมงาน — เพิ่ม/ถอดได้ตลอดด้วยคำสั่งเดียวกัน (เปลี่ยนเป็น
`'parent'` เพื่อถอดสิทธิ์) และทุกการเปลี่ยน `role`/`status` ถูกบันทึกลง `ops.audit_log`
โดยอัตโนมัติผ่าน trigger ในหัวข้อ 12.2 ของ `schema.sql` แม้จะเปลี่ยนจาก SQL Editor ก็ตาม

**Import ข้อมูล OPEC 290 โรงเรียน** ด้วย `db/import_opec.py`:

```bash
pip install "psycopg[binary]"
# เอา connection string จากปุ่ม Connect ของ Dashboard → แท็บ Session pooler
# (aws-0-<region>.pooler.supabase.com:5432 — ไม่ใช่ :6543 ซึ่งเป็น Transaction pooler
#  และไม่ใช่ db.xxx.supabase.co ซึ่งเป็น IPv6 อย่างเดียว)
# ใส่ลง .env เป็น DATABASE_URL — .env ถูก gitignore อยู่แล้ว
python db/import_opec.py --dry-run     # ลองก่อน rollback ไม่เขียนจริง
python db/import_opec.py               # เขียนจริง
```

สคริปต์นี้เรียกตัวนำเข้าตัวเดียวกับปุ่ม "ดึงข้อมูล OPEC" ในหน้า admin (`execute_opec_import` ใน
`microservices/opec/supabase_sync.py`) หลักสูตรถูก map ด้วย keyword pattern เป็นรหัสในตาราง `curriculums`
ค่าที่ map ไม่ได้จะตกเป็น `SCHOOL_SPECIFIC` ส่วนระดับชั้นที่ map ไม่ได้จะถูกรายงานออกมาตอนจบ
ตาม Business Rule ของหัวข้อ 7.16 ใน Use Case Spec

ถัดไป (สถานะ ณ 31 ต.ค. 2569):

1. `supabase init` + ย้าย `db/schema.sql` เป็น migration แรก เพื่อให้ CI/CD deploy ซ้ำได้ (ยังไม่ทำ)
   เรื่องนี้สำคัญขึ้นแล้ว เพราะตอนนี้การแก้ `schema.sql` ไม่ได้ไปถึงฐานจริงเอง ต้องมีคนรันไฟล์ซ้ำหรือรัน migration
   และที่ผ่านมาไม่มีใครรัน ฐานกับไฟล์จึงค่อย ๆ ต่างกัน (ดูหัวข้อ 8.2) ส่วนการแก้ที่ `create table if not exists`
   ทำให้ไม่ได้ (เปลี่ยน nullable, ถอนสิทธิ์, ลบฟังก์ชัน) ต้องเขียนเป็นคำสั่ง `alter` / `revoke` / `drop` ไว้ในไฟล์ด้วย
2. ✅ pipeline เขียนลง Postgres โดยตรงแล้ว ชุด Saga (`db_service.py`, `orchestrator.py`, `batch_scrape_runner.py`, `run_all.py`) ไม่ได้อยู่ในเส้นทางหลัก
   ลบออกได้ ยกเว้น `validator_service.validate_result()` ที่ `opec_service.py` เรียกใช้อยู่
3. ✅ `psycopg[binary]` อยู่ใน `requirements.txt` และ `@supabase/supabase-js` อยู่ใน `package.json` แล้ว (ใช้กับระบบล็อกอิน)
4. ✅ หน้าเว็บเลิกใช้ mock แล้ว แต่เลือกอ่านผ่าน FastAPI `/api` แทน Supabase client
5. เขียน pgTAP test ของ RLS อย่างน้อย 5 เคส: อ่าน `children_profiles` ข้ามบัญชี,
   อ่าน `comparison_sets` ข้ามบัญชี, แก้ `audit_log`, select `forum_reports` ด้วยบัญชีที่ไม่ใช่ admin,
   และผู้ใช้ทั่วไปแก้ `role` ของตัวเองใน `user_accounts` ไม่ได้ (ปิดแล้ว 31 ต.ค. 2569 ดูหัวข้อ 8.3 test นี้กันไม่ให้ช่องนี้กลับมา)
6. ค่อยเพิ่ม `hnsw` index ของ pgvector **หลังมีข้อมูลจริงแล้ว**

---

## 6. สิ่งที่ยังไม่ตัดสินใจ (ต้องให้ทีมเลือก)

| ประเด็น | ทางเลือก |
|---|---|
| มิติ `embedding vector(768)` | ตอนนี้ตั้งตาม Gemini `text-embedding-004` (768) — ถ้าเปลี่ยนไป OpenAI `text-embedding-3-small` ต้องเป็น 1536 **และเปลี่ยนทีหลังไม่ได้โดยไม่ล้างตาราง** |
| เก็บกี่เวอร์ชันย้อนหลัง | ยังไม่ได้ตั้ง retention — 500 MB รับได้สบาย แต่ควรมีนโยบายเขียนไว้ |
| Rate limiter counter | เอกสารบอกว่ามี rate limit แต่ไม่ระบุที่เก็บ — แนะนำตาราง `ops.rate_limits` เล็ก ๆ (ไม่มี Redis ในสแตกนี้) |
| ~~ตัวนับ `like_count` / `comment_count`~~ | ✅ **ตัดสินใจแล้ว (v6.6)** — ใช้ trigger ที่ระดับ DB (`forum_likes_sync`, `forum_comments_sync`, `report_submissions_sync`) ไม่ปล่อยให้โค้ดแอปอัปเดตเอง เพราะพลาดได้ทุกจุดที่ลืมเรียก โดยเฉพาะตอน client ลองใหม่ |

---

## 7. สถานะส่วนต่างระหว่างโค้ดกับเอกสาร

| ประเด็น | สถานะ |
|---|---|
| ฟอรัมไม่มีใน Use Case | ✅ **แก้แล้ว (v6.2)** — เพิ่ม UC-05 (อ่าน), UC-05 (เขียน/รายงาน), UC-16 (moderate) + ตาราง 7.11-7.13 |
| `safety_and_security` ไม่มีในเอกสาร | ✅ **แก้แล้ว (v6.2)** — เพิ่มแท็บใน UC-02 (+ E2b), แถวเปรียบเทียบใน UC-03, ขั้นตอนสกัดใน UC-13, ตาราง 7.10 |
| Architecture หัวข้อ 5: full-text search ภาษาไทย | ✅ **แก้แล้ว (v6.3)** — เปลี่ยนเป็น `pg_trgm` พร้อมเหตุผลว่า Postgres ไม่มี dictionary ภาษาไทย |
| Architecture หัวข้อ 13.2: 3 Supabase projects | ✅ **แก้แล้ว (v6.3)** — เหลือ Dev local (Supabase CLI) + Production cloud **project เดียว** พร้อมเงื่อนไขชัดเจนว่าจะเพิ่ม staging เมื่อเริ่ม UAT กับผู้ใช้จริง และเตือนเรื่องโปรเจกต์ถูกหยุดหลังไม่มี activity 1 สัปดาห์ |
| เอกสารหัวข้อ 7 ไม่ตรงกับ `schema.sql` | ✅ **แก้แล้ว (v6.6)** — ตรงกันครบ 3 ทาง: เอกสาร 25 ตาราง = `schema.sql` 25 ตาราง = ฐานข้อมูลจริง 25 ตาราง ตรวจด้วยสคริปต์เทียบชื่อตารางแล้วไม่มีตัวไหนต่างกัน |
| `community.reviews` เป็นรีวิวที่ผู้ใช้เขียนเอง | ✅ **แก้แล้ว (v6.5/v6.6)** — แทนด้วย `school_data.school_google_reviews` ที่เป็น cache จาก Google Places พร้อมย้าย schema ให้ตรงกับเจ้าของข้อมูล |
| ตาราง lookup `curriculums` ไม่เคยถูกใช้ (คำศัพท์ 3 ชุดไม่ตรงกัน) | ✅ **แก้แล้ว (v6.6)** — รวมเป็นชุดเดียว DB เก็บ code, API แปลงกลับเป็นภาษาไทยตอนส่งออก, trigger `schools_vocab_check` บังคับความถูกต้อง |
| คอลัมน์ ISAT + `official_website_registry` ไม่อยู่ใน `schema.sql` (schema drift) | ✅ **แก้แล้ว (v6.6)** — ย้ายมาประกาศใน `schema.sql` ทั้งหมด ไม่ต้องพึ่ง `ALTER TABLE` ตอนรันอีก |
| `updated_at` ไม่มีอะไรอัปเดตให้ 8 ตาราง | ✅ **แก้แล้ว (v6.6)** — trigger `set_updated_at` |
| `src/api/schoolsApi.ts` คอมเมนต์อ้าง `testz.py` ที่ไม่มีแล้ว | ✅ **แก้แล้ว** — ชี้ไป `microservices/scraper_service.py` |
| FE ใช้ `id: number` แต่ schema เป็น `uuid` | ⏳ **ยังไม่แก้** — หน้าเว็บใช้รหัส OPEC 10 หลักแปลงเป็นตัวเลขเป็น `id` (`parseNumericId` ใน `src/api/schoolsApi.ts`) ส่วน `school_id` ที่เป็น uuid ใช้เฉพาะฝั่ง backend |
| `requirements.txt` ยังไม่มี driver | ✅ **แก้แล้ว** — `psycopg[binary]` อยู่ใน `requirements.txt` และมีโค้ดเรียกใช้จริงสามไฟล์ คือ `supabase_sync.py` `fetch_official_websites.py` และ `website_registry.py` |
| `package.json` ยังไม่มี `@supabase/supabase-js` | ✅ **แก้แล้ว** — เพิ่มแล้วและใช้กับระบบล็อกอิน (`src/lib/supabase.ts`, `src/lib/auth.tsx`) ส่วนข้อมูลโรงเรียนอ่านผ่าน FastAPI |
| ตารางและคอลัมน์ใน `schema.sql` เทียบกับฐานจริงระดับคอลัมน์ | ✅ **แก้แล้ว (31 ต.ค. 2569)** — ไฟล์ปรับตามฐานจริง และรัน `db/migrations/2026-10-31_live_alignment.sql` กับฐานจริงแล้ว (nullable 3 คอลัมน์, สิทธิ์ `user_accounts`, ลบ `publish_version()`) ดูหัวข้อ 8.2 |

---

## 8. ฐานข้อมูลจริงเทียบกับ `schema.sql` (ตรวจ 31 ต.ค. 2569)

ตรวจด้วย connection แบบ read-only จาก `DATABASE_URL` อ่านเฉพาะโครงสร้าง สิทธิ์ และจำนวนแถว ไม่ได้อ่านข้อมูลผู้ใช้

### 8.1 ภาพรวม

| รายการ | ค่าในฐานจริง |
|---|---|
| Postgres | 17.6 |
| Extension | `postgis`, `vector`, `pg_trgm`, `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `unaccent`, `pg_stat_statements`, `supabase_vault` |
| ตาราง | 25 ตารางใน 5 schema ตรงกับไฟล์ (ไม่นับ `public.spatial_ref_sys` ของ PostGIS) |
| งาน `pg_cron` | ยังไม่มีสักงาน |
| ตารางที่ไม่เปิด RLS | `grade_levels`, `school_google_reviews`, `official_website_registry` (ไม่เปิดทั้งในไฟล์และในฐาน) สองตัวแรก grant ให้แค่ `select` จึงอ่านได้อย่างเดียว ตัวสุดท้ายไม่มี grant ให้ `anon`/`authenticated` จึงเข้าผ่าน API ไม่ได้ |
| ตารางที่ไม่มีในฐาน | `public.profiles` (จาก `db/migrations/2026-10-02_auth_profiles.sql`) และ `school_data.grade_level_aliases` (จาก `db/add_grade_level_aliases.sql`) ทั้งสองไฟล์ยังไม่เคยรันกับฐานจริง |
| trigger บน `auth.users` | `on_auth_user_created` เรียก `user_data.handle_new_auth_user()` ตาม `schema.sql` (ไม่ใช่ตัวใน migration profiles ซึ่งใช้ชื่อ trigger เดียวกัน ถ้ารัน migration นั้นจะทับตัวนี้ และผู้ใช้ใหม่จะไม่ได้แถวใน `user_accounts`) |

จำนวนแถวและสถานะข้อมูล:

| ตาราง | แถว | หมายเหตุ |
|---|---|---|
| `school_data.schools` | 290 | active ทั้งหมด มีเวอร์ชันที่ published ครบ 290 มีค่าเทอมบนการ์ด (`pub_tuition_min_thb`) 120 โรง |
| `school_data.school_versions` | 766 | `opec_import`: published 15, superseded 275 · `scraper`: published 275, superseded 198, pending_review 2, rejected 1 |
| `school_data.version_fees` | 1,956 | ไม่มี `annual_thb` 138 แถว ในนั้น 116 แถวมีแค่ `semester_thb` · มี `level_code` แค่ 15 แถว |
| `school_data.version_extra_fees` | 2,005 | `frequency`: unknown 580, once 570, per_year 541, per_term 223, per_semester 67, per_month 24 |
| `school_data.version_safety` | 476 | |
| `school_data.school_scrape_log` | 1,544 | |
| `school_data.official_website_registry` | 291 | |
| `school_data.curriculums` / `grade_levels` | 17 / 5 | มีคอลัมน์ `aliases` ทั้งคู่ |
| `user_data.user_accounts` | 3 | admin 2, parent 1 |
| `ops.audit_log` | 2 | |
| ตารางอื่นใน `community`, `user_data`, `ai`, `ops` | 0 | |

### 8.2 จุดที่ไฟล์กับฐานจริงไม่ตรงกัน และสถานะการแก้

`schema.sql` เขียนให้รันซ้ำกับฐานที่มีอยู่ได้ (หัวข้อ 19 ของไฟล์มี `alter table ... add column if not exists`
ไว้ตามคอลัมน์ที่เพิ่มทีหลัง) ฐานจริงต่างจากไฟล์เพราะยังไม่ได้รันไฟล์ซ้ำหลังการแก้ช่วงปลายเดือนกันยายน
31 ต.ค. 2569 ปรับไฟล์ให้ตรงกับที่ใช้จริงแล้ว ส่วนที่ต้องเปลี่ยนในฐานรวมไว้ใน `db/migrations/2026-10-31_live_alignment.sql`

| จุด | เดิมในไฟล์ | ในฐานจริง | สถานะ |
|---|---|---|---|
| `version_fees.order_start`, `order_end`, `display_name` | มี | ไม่มี | ✅ ลบออกจาก `schema.sql` แล้ว `/api/public/fees` คำนวณสามค่านี้ตอนอ่านด้วย `microservices/opec/grade_years.py` (เรียงตามลำดับในหน้าเว็บโรงเรียนจาก `data_snapshot` แล้วแปลงชื่อชั้นเป็นสเกล 0-16) |
| enum `fee_frequency` | มี `per_semester` | มีแล้ว | ✅ ตรงกัน |
| `schools.is_isat_member`, `is_boarding`, `accreditations` | `not null` | nullable (มี default) | ✅ ไฟล์ถูกอยู่แล้วและเพิ่ม `alter column ... set not null` ในหัวข้อ 19 ฐานจริงเป็น `not null` แล้วหลังรัน migration |
| `official_website_registry.website_url`, `source` | nullable | `not null` default `''` และ `'Manual Registry'` | ✅ แก้ไฟล์ให้ตรงกับฐานแล้ว |
| ฟังก์ชัน `publish_version()` | สูตร `min(nullif(annual_thb, 0))` | สูตรเก่า `coalesce(annual_thb, semester_thb * 2)` | ✅ ไม่มีโค้ดเรียก ลบออกทั้งจากไฟล์และฐานจริงแล้ว เดิมใครที่มี anon key ก็เรียกผ่าน `/rest/v1/rpc/publish_version` ได้ เพราะฟังก์ชันไม่ได้จำกัดสิทธิ์ EXECUTE และรันด้วยสิทธิ์ `postgres` |
| `schools.opec_missing_since`, `archived_at`, `archived_reason` | มี (เพิ่ม 31 ต.ค. 2569) | มี (รัน `db/migrations/2026-10-31_school_closure.sql` แล้ว) | ✅ |
| `schools.opec_missing_checked_at` | ลบแล้ว 1 พ.ย. 2569 | ยังมี (ว่างทุกแถว) | ⏳ รัน `db/migrations/2026-11-01_drop_opec_missing_checked_at.sql` โค้ดไม่ได้ใช้ช่องนี้แล้ว ไม่รันก็ไม่พัง |

### 8.3 สิทธิ์ที่ต้องแก้

✅ แก้ใน `schema.sql` หัวข้อ 10.1 และรันกับฐานจริงแล้ว 31 ต.ค. 2569 (ตอนนี้ `authenticated` มีแค่ SELECT ทั้งตาราง และ UPDATE เฉพาะ `display_name`) ข้อความด้านล่างเก็บไว้เป็นที่มาของการแก้

- `user_data.user_accounts`: role `authenticated` มีสิทธิ์ `insert, update, delete` ทุกคอลัมน์ และ policy `own_account`
  เช็กแค่ `user_id = auth.uid()` schema `user_data` เปิดผ่าน Data API อยู่ ผู้ใช้ที่สมัครเองจึงแก้ `role` เป็น `admin`
  (หรือแก้ `status` ปลดตัวเองจากการถูกระงับ) ได้ทันที แล้ว `user_data.is_admin()` จะคืน true ทำให้เขียนตาราง `school_data.*`
  ผ่าน policy `*_admin_write` ได้ trigger `on_user_account_privilege_change` แค่บันทึกลง `ops.audit_log` (และบันทึกผู้กระทำเป็น `admin`) ไม่ได้ห้าม
  แก้โดยจำกัดสิทธิ์ให้แก้ได้เฉพาะชื่อที่แสดง:

  ```sql
  revoke insert, update, delete on user_data.user_accounts from authenticated;
  grant select, update (display_name) on user_data.user_accounts to authenticated;
  ```

  ถ้าวันหนึ่งเปิดให้ผู้ใช้ขอลบบัญชีเอง (UC-06) ต้องเพิ่ม `deletion_requested_at` ในรายการคอลัมน์ที่แก้ได้

  แถวของผู้ใช้ใหม่ยังถูกสร้างได้ตามเดิม เพราะ `handle_new_auth_user()` เป็น `security definer`
- `public.spatial_ref_sys` (ของ PostGIS, เจ้าของคือ `supabase_admin`): `anon` และ `authenticated` มีสิทธิ์เขียนทุกอย่าง และ RLS ปิดอยู่
  เพราะ schema `public` ถูก expose ไว้ ตอนนี้หน้าเว็บไม่ได้ใช้ Data API ของ `public` เลย จึงเอา `public` ออกจาก Exposed schemas ได้

---

**Sources:**
- [Supabase Pricing](https://supabase.com/pricing)
- [Neon Pricing](https://neon.com/pricing)
