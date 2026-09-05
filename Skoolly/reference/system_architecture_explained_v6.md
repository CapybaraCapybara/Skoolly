# System Architecture — คำอธิบาย (v6)

เอกสารนี้อธิบายภาพรวมสถาปัตยกรรมระบบทั้งหมด คู่กับไดอะแกรม `system_architecture.mermaid`
โดยแยกอธิบายทีละส่วนว่า **ใช้อะไร → เพื่ออะไร → ทำงานยังไง**

**v2 ปรับตาม Use Case Specification** ที่เพิ่ม Actor (Guest/Parent/Admin), รีวิว,
เปรียบเทียบ, เครื่องคำนวณค่าใช้จ่าย, chatbot แบบมี history, PDF export และ PDPA compliance

**v3 ปรับให้สอดคล้องกับแบบฟอร์ม คง.101** ที่ระบุไว้ว่าจะใช้สถาปัตยกรรม **Microservices**
(หัวข้อ 7.2 และ 9.5 ของแบบฟอร์ม) — v2 เคยตัดแนวคิด Microservices ออกทั้งหมดเพราะมองว่าเอกสาร
Use Case สมมติ pattern แบบ decentralized services เต็มรูป ซึ่งเกินกำลังทีม 2 คน แต่เนื่องจากฟอร์ม
ที่ยื่นไปแล้วระบุ Microservices ไว้ชัดเจน 2 จุด ทีมจึงยืนยันเก็บคำนี้ไว้ โดยเลือก implement แบบ
**"Schema-per-Service"**: ยังคง Postgres instance เดียวของ Supabase project เดียวกัน (เพราะงบ/ทีมเล็ก
ยังไม่พร้อมดูแลหลาย database instance จริง) แต่แบ่งเป็นหลาย schema ตาม bounded context และบังคับ
กฎการเข้าถึงข้ามกันแบบ service จริง (ดูหัวข้อ 4) — เป็น **"pragmatic/lightweight microservices"**
ไม่ใช่ pure microservices 100% ตามตำรา แต่มีของจริงรองรับคำว่า "Microservices" ในฟอร์ม ไม่ใช่แค่
ป้ายชื่อเฉยๆ

**v4 แก้ความไม่สอดคล้องภายในที่พบจากการตรวจทานละเอียด** — ปิดช่องว่างที่ v3 ทิ้งไว้: (1) แก้
Section 5 ที่ยังเรียกตัวเองว่า "all-in-one" ขัดกับ Service boundary ใน Section 4 (2) เพิ่ม Golden
Rule ข้อยกเว้นที่ 4 สำหรับงาน hard-delete บัญชีที่ต้องแก้ 3 schema พร้อมกัน (3) แก้ตาราง 4.3 ให้
ตรงกับความจริงที่ว่า Community Service ไม่มี Edge Function ของตัวเอง (4) เติม `user_data`/`ai`
schema เข้าไปใน Admin Dashboard (5) แยกตาราง `users`/`user_accounts` ให้ตรงกับข้อจำกัดจริงของ
Supabase Auth — รายละเอียดดูในแต่ละหัวข้อที่เกี่ยวข้อง

**v5 เติมเนื้อหาที่แบบฟอร์ม คง.101 สัญญาไว้แต่เอกสารรุ่นก่อนหน้ายังไม่เคยพูดถึงเลย** (ตรวจสอบด้วย
การไล่เทียบทุกข้อของฟอร์มกับเอกสารโดยตรง ไม่ใช่แค่ตรวจความสอดคล้องภายใน): เพิ่ม **หัวข้อ 13
DevOps & QA Plan** ทั้งชุด (Automated Testing ครบ 5 ประเภทตามข้อ 7.5 ของฟอร์ม, CI/CD Pipeline
ตามข้อ 7.6, Centralized Logging & Error Tracking ตามข้อ 7.6) และเพิ่มย่อหน้า **Responsive
Design** เข้า Section 9 (ตอบข้อ 5.1/8.2 ของฟอร์มที่พูดถึง "รองรับการแสดงผลบนอุปกรณ์หลากหลาย" ซึ่ง
ไม่เคยถูกกล่าวถึงในเอกสารสถาปัตยกรรมเลยแม้แต่ครั้งเดียวก่อนหน้านี้) — ส่วนข้อ 7.3 ของฟอร์ม
("ปรับแต่งโมเดล LLM") ยังคงเป็นช่องว่างที่ตั้งใจพักไว้ก่อน รอการตัดสินใจเพิ่มเติมว่าจะเขียนเป็น
deviation note (แบบเดียวกับที่ทำกับ Microservices ใน v3) หรือจะเพิ่มงาน fine-tuning จริงเข้าไป

**v6 เพิ่ม 3 ฟีเจอร์ใหม่ตามที่ทีมขอปรับ:** (1) **Guided Prompts/Quick Replies** ใน UC-U05 —
Chatbot แสดงปุ่มคำถามนำทางตอนเริ่มบทสนทนา และแนบคำถามต่อยอด 2-3 ข้อท้ายทุกคำตอบ (`chatbot-api`
คืน structured output แยก `answer`/`suggested_replies` ดูหัวข้อ 6) (2) **`source_published_at`**
เพิ่มเป็นมิติเวลาที่ 2 แยกจาก system fetch timestamp และ effective period เดิม (ดู Use Case doc
หัวข้อ 7.3) — ตอบคำถาม "ต้นฉบับเก่าแค่ไหน" ที่ 2 มิติเดิมตอบไม่ได้ (3) **ลิงก์แชร์ผลเปรียบเทียบ**
(UC-G07 ใหม่ + UC-U08 ขยายจาก PDF-only) — เพิ่ม Edge Function `get-shared-comparison` (User
Service) เป็น public read-only endpoint, เพิ่มตาราง `comparison_sets` (7.9 ของ Use Case doc)
พร้อม `share_token`/`share_enabled`, และเพิ่มข้อยกเว้น Anti-IDOR ที่ตั้งใจสำหรับ resource ที่
เจ้าของเปิดแชร์เอง (ดูหัวข้อ 4.4 และ Use Case doc หัวข้อ 8.1)

**v6.1 ตรวจทานความสอดคล้องข้ามเอกสาร (Architecture ↔ Use Case) แล้วแก้จุดที่ขัดกัน:** (1) เติม
`user_accounts` เข้าเป็นตารางของ User Service ทั้งในตาราง 4.1 และหัวข้อ 7 (v4 สร้างตารางนี้ขึ้นใน
Use Case doc แต่ไม่เคยถูกใส่กลับเข้าเอกสารนี้) (2) เติม `school_embeddings` เข้าตาราง 4.1 ของ AI
Service ให้ตรงกับหัวข้อ 7 (3) เพิ่ม `get_comparison_set(comparison_id)` เป็น operation ของ
`user-data-api` — เดิมตาราง 4.3/หัวข้อ 6 บอกว่า PDF Export ดึง `comparison_sets` ผ่าน
`user-data-api` แต่ interface ที่ประกาศไว้มีแค่ `get_profile_summary` (4) แยกให้ชัดว่า Google Maps
API ใช้เฉพาะฝั่ง Data Pipeline ส่วนแผนที่ที่ผู้ใช้เห็นใช้ Leaflet + tile provider (UC-G03 เคยเขียน
กำกวมว่า "เรียก Maps API") (5) แก้ cross-reference ที่ชี้ผิดหัวข้อในตารางสรุป v2

**v6.2 ผนวก 2 ฟีเจอร์ที่พัฒนาไปแล้วจริงในโค้ดแต่เอกสารยังไม่เคยครอบคลุม:** (1) **ฟอรัมชุมชน
ผู้ปกครอง** (`src/pages/ForumPage.tsx`) — เพิ่ม `forum_posts`/`forum_comments`/`forum_reports`
เป็นตารางของ Community Service (หัวข้อ 4.1, 7) และเพิ่ม UC-G08/UC-U09/UC-A12 ใน Use Case doc
โดยใช้ **Post-Moderation** ต่างจากรีวิวที่เป็น Pre-Moderation (2) **ข้อมูลความปลอดภัย/นโยบาย
คุ้มครองเด็ก** ที่ `scraper_service.py` สกัดมาแล้วจริงทุกโรงเรียน — เพิ่มตาราง `version_safety`
เข้า School Data Service และเพิ่มเป็นขั้นตอนหนึ่งของ Phase 3 (หัวข้อ 3)

**v6.3 ปรับให้ตรงกับ schema ที่ implement จริง และแก้ 2 จุดที่พิสูจน์แล้วว่าทำตามที่เขียนไว้ไม่ได้:**
(1) **Full-text search ภาษาไทยใช้ไม่ได้จริง** — Postgres ไม่มี dictionary ภาษาไทยจึงตัดคำไทยไม่ได้
เปลี่ยนเป็น `pg_trgm` (หัวข้อ 5) (2) **แผน Supabase 3 project เกินเพดาน Free tier ที่ให้ 2 project**
เปลี่ยนเป็น Dev รัน local ด้วย Supabase CLI (หัวข้อ 13.2) (3) เติมตารางที่ schema จริงมีแต่หัวข้อ 7
ยังไม่เคยระบุ (`version_fees`, `version_extra_fees`, ตาราง lookup หลักสูตร/ระดับชั้น, ตารางเชื่อม)

**หมายเหตุการออกแบบฐานข้อมูลจริง:** DDL ที่ implement ตามเอกสารนี้อยู่ที่ `db/schema.sql`
พร้อมเหตุผลการเลือกเครื่องมือ/free tier ที่ `db/DATABASE_DESIGN.md`

---

## สรุปการเปลี่ยนแปลงจาก v1

| จุด | v1 | v2 | เหตุผล |
|---|---|---|---|
| Edge Function | มีแค่ Chatbot ตัวเดียว | แยกเป็น 4 ตัว: Chatbot, Re-embed handler, PDF export, Notification sender | Use case ใหม่ต้องการ async job หลายแบบที่ไม่เกี่ยวกัน |
| pgvector | เตรียมไว้เฉยๆ ยังไม่ได้ใช้ | ยังไม่ได้ใช้จริงเหมือนเดิม แต่ตอนนี้รู้ชัดว่าต้อง**ขยาย Phase 3 ให้ scrape ข้อความอิสระเพิ่ม**ถึงจะมีอะไรให้ vector search จริง | Use case เขียนว่า chatbot ใช้ "RAG: vector search" แต่ข้อมูลที่มีตอนนี้เป็น structured ล้วน |
| Sync ระหว่าง service | ไม่ได้พูดถึง | ตัดแนวคิด Message Queue/Circuit Breaker/Reconciliation Job ระหว่าง service ออก | Use case spec เขียนสมมติว่าเป็น microservices แยกกัน ไม่ตรงกับ Supabase รวมศูนย์ที่ออกแบบไว้ตอนนั้น *(หมายเหตุ v4: การตัดสินใจนี้ถูกปรับกลับใน v3 — ดูหัวข้อ 4 ฉบับปัจจุบันซึ่งนำ Circuit Breaker/Event-Driven Sync ระหว่าง service กลับมาใช้จริงในรูปแบบ Schema-per-Service แทน ไม่ใช่ "Supabase รวมศูนย์" อีกต่อไป)* |
| Scheduler | cron ทั่วไป | **pg_cron** (รันในตัว Postgres) | อยู่ใน platform เดียวกันหมด ไม่ต้องมี cron server แยก |
| ตารางใหม่ | schools, school_versions, school_scrape_log | เพิ่ม reviews, favorites, children_profiles, comparison_sets, conversations, messages, data_correction_reports, audit_log, failed_jobs | รองรับ use case ที่เพิ่มเข้ามา (ดูหัวข้อ 7) *(v4 เพิ่ม `user_accounts` แยกจาก `auth.users`, v6 เพิ่มคอลัมน์ `share_token`/`share_enabled` ใน `comparison_sets`)* |

**v3:**

| จุด | v2 | v3 | เหตุผล |
|---|---|---|---|
| Service boundary | ไม่มี — Postgres schema เดียว ทุกอย่างแบนราบ | แบ่งเป็น 5 schema ตาม bounded context (`school_data`, `community`, `user_data`, `ai`, `ops`) แต่ละ schema มี "เจ้าของ" ชัดเจน | ให้คำว่า Microservices ในฟอร์ม คง.101 มีของจริงรองรับ ไม่ใช่แค่ Postgres รวมศูนย์เฉยๆ |
| Cross-service access | Edge Function ไหนก็ query schema ไหนก็ได้ | ห้าม Edge Function ของ Service หนึ่ง query schema ของอีก Service ตรงๆ ต้องเรียกผ่าน Edge Function เจ้าของ schema เท่านั้น ("Golden Rule" ดูหัวข้อ 4) | คือหลักการ core ของ Microservices (decentralized data ownership) ที่ยังทำได้แม้อยู่ Postgres เดียวกัน |
| Edge Function ใหม่ | Chatbot, Re-embed handler, PDF export, Notification sender | เพิ่ม `school-data-api`, `user-data-api` เป็น internal API ให้ service อื่นเรียก แทนการ query schema ตรง | Chatbot/Re-embed/PDF export ต้องใช้ข้อมูลข้าม service จริง (ดูหัวข้อ 4, 6) |
| Service-to-service auth | ไม่มี (v2 บอกว่าไม่จำเป็นเพราะไม่มีหลาย service) | Internal Service Secret (custom header) + forward JWT ของ user เดิม ระหว่าง Edge Function เรียกกัน | ตอนนี้มีการเรียกข้าม service จริงแล้ว ต้องมีทางพิสูจน์ตัวตนระหว่าง service |

**v4:**

| จุด | v3 | v4 | เหตุผล |
|---|---|---|---|
| Community Service cross-service call | ตาราง 4.3 เขียนว่า Community Service เรียก Ops Service ตรง | Community Service ไม่มี Edge Function ของตัวเอง (ตาราง 4.1) — เปลี่ยนเป็น Database Webhook จาก `community.data_correction_reports` แทน (หัวข้อ 4.3.1) | ตาราง 4.1 กับ 4.3 ขัดกันเอง — ไม่มี Edge Function แล้วเรียกออกไม่ได้ |
| Account deletion ข้าม 3 schema | ไม่มีคำตอบว่าใครสั่งลบข้อมูลข้าม Community/User/AI ตอน Grace Period หมด | เพิ่ม Golden Rule ข้อยกเว้นที่ 4: `account-deletion-cron` (pg_cron) แก้ 3 schema ในธุรกรรมเดียว (หัวข้อ 4.2) | UC-U01 E5/UC-A05 ต้องการ flow นี้จริง แต่ไม่เคยถูกออกแบบไว้ |
| Admin Dashboard schema access | ระบุแค่ `school_data`/`community`/`ops` | เพิ่ม `user_data` (UC-A05) และ `ai` (UC-A08) เป็นครบทั้ง 5 schema | ตรวจ Use Case จริงพบว่า Admin ต้องแตะทั้ง 5 schema |
| ตาราง `users` | คอลัมน์ธุรกิจ (`status`, `deletion_requested_at`) ปนอยู่ใน `auth.users` | แยกเป็น `auth.users` (Auth จัดการเอง) + `user_data.user_accounts` (User Service เป็นเจ้าของ, FK 1:1) | Supabase ไม่ให้เพิ่ม column custom เข้า `auth.users` ตรงๆ |
| Section 5 title | "(all-in-one)" | "(Postgres instance เดียว, แบ่ง Schema ตาม Service)" | ขัดกับ Golden Rule ในหัวข้อ 4 ที่เขียนไว้ก่อนหน้า |

---

## ภาพรวมสั้นๆ

ระบบแบ่งเป็น 5 ชั้นหลัก: **แหล่งข้อมูลภายนอก** → **Data Pipeline** (Python) →
**Supabase** (Postgres instance เดียว แบ่ง 5 schema ตาม Service — ดูหัวข้อ 4) →
**Edge Functions** (งาน async/tool-calling แยกย่อยตาม Service) → **Frontend** (Admin Dashboard,
เว็บสาธารณะ, Chatbot — ใช้ได้ต่างกันตาม Actor)

หลักการออกแบบที่ยึดตลอด: **ใช้ AI เฉพาะจุดที่จำเป็นจริงๆ**, **เลือกความเรียบง่ายเหนือความซับซ้อน**
เพราะเป็นโปรเจกต์ thesis ทีมเล็กงบจำกัด (ยกเว้นเรื่อง Service boundary ในหัวข้อ 4 ที่ยอมเพิ่ม
ความซับซ้อนโดยตั้งใจ เพื่อให้สอดคล้องกับสถาปัตยกรรม Microservices ที่ระบุไว้ในแบบฟอร์ม คง.101),
และ **grounded เสมอ** — chatbot ห้ามเดาตัวเลขค่าเทอมเอง

---

## 1. Actor และสิทธิ์การเข้าถึง

| Actor | เข้าถึงอะไรได้ | ปิดกั้นอะไร |
|---|---|---|
| Guest | ค้นหา, ดูรายละเอียด (รวมแท็บความปลอดภัย), แผนที่, รีวิว, อ่านกระทู้ในฟอรัม (UC-G08), เปรียบเทียบเบื้องต้น (จำกัดจำนวน, ไม่บันทึก), ดูลิงก์เปรียบเทียบที่คนอื่นแชร์มา (UC-G07, ไม่ต้องมีบัญชี) | Chatbot, เครื่องคำนวณค่าใช้จ่าย, ตั้งกระทู้/คอมเมนต์ในฟอรัม — ต้อง login ก่อนเสมอ |
| Parent/User | ทุกอย่างของ Guest + บันทึกโปรด, เปรียบเทียบไม่จำกัด, คำนวณค่าใช้จ่ายส่วนตัว, Chatbot (พร้อม Guided Prompts), เขียนรีวิว, ตั้งกระทู้/คอมเมนต์/รายงานเนื้อหาในฟอรัม (UC-U09), แจ้งข้อมูลผิด, export/แชร์ผลเปรียบเทียบ (PDF หรือลิงก์) | — |
| Admin | จัดการข้อมูลโรงเรียนโดยตรง, ตรวจ/อนุมัติข้อมูลจาก Scraper, จัดการบัญชี/รีวิว/เนื้อหาฟอรัมที่ถูกรายงาน (UC-A12), ดู log/audit/dashboard | บทบาทเดียว ไม่มีแบ่งระดับสิทธิ์ย่อย |

จัดการผ่าน **Supabase Auth + Row Level Security (RLS)** — policy ระดับ table กำหนดว่า role ไหน
อ่าน/เขียนอะไรได้บ้าง ไม่ต้องเขียน authorization logic เองฝั่ง backend

---

## 2. แหล่งข้อมูลภายนอก (External Sources)

| ใช้อะไร | เพื่ออะไร |
|---|---|
| `school.opec.go.th` | รายชื่อโรงเรียนนานาชาติทั้งประเทศแบบทางการ (แหล่งตั้งต้น) |
| Google Search / Serper API | หา URL เว็บไซต์จริงของแต่ละโรงเรียน |
| Google Maps API | เติมพิกัด/ที่อยู่ที่ OPEC ไม่มีให้ — ใช้เฉพาะฝั่ง Data Pipeline (Phase 2 Enrichment) ไม่ได้ยิงรายครั้งตอนผู้ใช้เปิดแผนที่ ส่วนแผนที่ที่ผู้ใช้เห็น (UC-G03) วาดด้วย Leaflet + tile provider จากพิกัดใน PostGIS ของเราเอง (ดูหัวข้อ 9) |
| เว็บไซต์โรงเรียนแต่ละแห่ง | แหล่งข้อมูลค่าเทอม/หลักสูตร/hidden cost ตัวจริง |
| Resend (email API) | ส่งอีเมลยืนยันสมัคร, แจ้งสถานะ ticket, แจ้ง PDF พร้อมดาวน์โหลด |

---

## 3. Data Pipeline — Python

**ใช้อะไร:** Python + Playwright + Gemini/Claude API + pdfplumber, รันเป็นสคริปต์แยก
ไม่ใช่ server ที่ทำงานตลอดเวลา — trigger โดย `pg_cron` (อยู่ใน Supabase) เดือนละครั้ง
หรือ Admin สั่งรันเองเป็นรายโรงเรียนก็ได้ (ตาม UC-A02/A03)

**เพื่ออะไร:** แปลงข้อมูลดิบกระจัดกระจายจากหลายแหล่งให้เป็นข้อมูลมาตรฐานเดียวกัน

**ทำงานยังไง — แบ่งเป็น 3 phase ตามลำดับ:**

1. **Phase 1 (Bootstrap):** Playwright ไล่ export ทีละจังหวัดจาก OPEC → รวมไฟล์ → กรองเฉพาะ
   โรงเรียนนานาชาติ → เช็คซ้ำด้วย fuzzy matching → insert เข้า Supabase Postgres เป็นแถวใหม่ใน
   `schools` (status = `active` ตาม enum จริง แต่ `current_published_version_id` ยังเป็น NULL —
   ยังไม่มีเวอร์ชันเผยแพร่ จึงยังไม่ขึ้นแสดงต่อ Guest/Parent ตาม Business Rule ของ UC-G01 จนกว่าจะ
   ผ่าน Phase 2/3 และ Admin confirm ตาม UC-A02) *(ไม่ใช้ AI)*
2. **Phase 2 (Enrichment):** หา URL เว็บไซต์ + เติมพิกัดที่ขาด ผ่าน Serper/Maps API — **URL ที่ได้
   ต้องผ่าน Admin ยืนยันอย่างน้อย 1 ครั้งก่อน** (ตาม UC-A02) กัน Scraper ไปเก็บข้อมูลจากเว็บผิด
   *(ไม่ใช้ AI)*
3. **Phase 3 (AI Agentic Scraping) — ผ่านการทดสอบ prototype มาแล้ว จุดที่ใช้ AI จริงจัง:**
   - **Navigate:** AI เลือกลิงก์ที่น่าจะพาไปหน้าค่าเทอม
   - **Read:** อ่าน PDF ถ้าข้อมูลอยู่ในนั้น (พบว่าเกินครึ่งของโรงเรียนที่ทดสอบเป็นแบบนี้)
   - **Extract:** แปลงเป็น JSON ตาม schema ตายตัว (ค่าเทอมแยกชั้น, hidden cost พร้อมจำนวนเงิน,
     curriculum) พร้อม confidence score ต่อฟิลด์
   - **Safety pass:** นำทางไปหน้า Safety/Safeguarding Policy แยกอีกรอบ สกัดมาตรการความปลอดภัย
     (รปภ., CCTV, ห้องพยาบาล, ระบบกรอง PM2.5, การควบคุมบุคคลภายนอก, นโยบายคุ้มครองเด็ก) ลงตาราง
     `version_safety` — ฟิลด์ที่หาไม่เจอเก็บเป็น `null` **ห้ามเดาเป็น `false`** เพราะ "หาไม่เจอ"
     กับ "โรงเรียนไม่มี" คนละความหมายกันและกระทบชื่อเสียงโรงเรียน (ดู UC-G02 E2b)
   - เนื้อหาเว็บถูกปฏิบัติเป็น untrusted data เสมอ ป้องกัน prompt injection
   - ผลลัพธ์ที่ต่างจากข้อมูล Published เดิมอย่างมีนัยสำคัญ → สร้างเวอร์ชันใหม่สถานะ
     `pending_review` ส่งเข้าคิว Admin (UC-A04) ไม่ auto-publish เอง

---

## 4. สถาปัตยกรรม Microservices ที่เลือกใช้: Schema-per-Service บน Supabase เดียว

แบบฟอร์ม คง.101 ข้อ 7.2 และ 9.5 ระบุไว้ชัดว่าจะใช้สถาปัตยกรรม Microservices — ทีมจึงยืนยันคง
คำนี้ไว้ แต่ implement แบบที่เหมาะกับทีม 2 คนงบจำกัด ไม่ใช่ true Microservices เต็มรูป (ที่ต้องมี
database แยก instance ต่อ service, independent deployment, independent scaling)

### 4.1 ระดับที่เลือก: Schema-per-Service

Postgres instance เดียวของ Supabase project เดียวกัน ถูกแบ่งเป็น **5 schema** ตาม bounded context
แต่ละ schema มี "เจ้าของ" เป็น Service เดียวเท่านั้น:

| Service | Schema | ตารางที่เป็นเจ้าของ | Edge Function ประจำ Service |
|---|---|---|---|
| **School Data Service** | `school_data` | `schools`, `school_versions`, `school_scrape_log` | `school-data-api` (search/get/compare — ใช้ทั้งจาก Frontend และจาก Service อื่น) |
| **Community Service** | `community` | `reviews`, `data_correction_reports`, `forum_posts`, `forum_comments`, `forum_reports` | ไม่มี (CRUD ธรรมดาผ่าน Auto-API + RLS พอ — ฟอรัมก็เป็น CRUD ตรงเช่นกัน ไม่ต้องมี Edge Function เพิ่ม) |
| **User Service** | `user_data` | `user_accounts` (ฟิลด์ธุรกิจของบัญชี ผูก 1:1 กับ `auth.users`), `children_profiles` 🔒, `favorites`, `comparison_sets` | `user-data-api` (ให้ Service อื่นดึงสรุปโปรไฟล์/ชุดเปรียบเทียบแบบจำกัดสิทธิ์), `get-shared-comparison` (public endpoint สำหรับลิงก์แชร์ผลเปรียบเทียบ — UC-G07) |
| **AI Service** | `ai` | `conversations`, `messages`, `school_embeddings` | `chatbot-api`, `re-embed-handler` |
| **Ops Service** | `ops` | `audit_log`, `failed_jobs` | `pdf-export`, `notification-sender` |

### 4.2 Golden Rule — กติกาเดียวที่ทำให้เป็น Microservices จริง ไม่ใช่แค่แบ่งชื่อ schema

> **Edge Function ของ Service ไหน ห้าม query schema ของ Service อื่นตรงๆ ใน SQL ของตัวเอง
> ถ้าต้องการข้อมูลข้าม Service ต้องเรียกผ่าน Edge Function เจ้าของ schema นั้นเสมอ (HTTP call
> ระหว่าง Edge Function)**

ข้อยกเว้นที่อนุญาต (และเป็นเรื่องปกติในระบบ Microservices จริงด้วย):
- **Client (Frontend) เรียก Auto-API ของแต่ละ schema ได้ตรงๆ** สำหรับ read/write ที่เป็นของ
  Service นั้นเอง (เช่น Public Web อ่าน `school_data` เพื่อค้นหา, เขียน `community` เพื่อรีวิว) —
  นี่คือ client เรียก "API สาธารณะ" ของแต่ละ service เอง ไม่ใช่ service หนึ่งแอบ query database
  ของอีก service ซึ่งเป็นคนละกรณีกับ Shared Database Anti-pattern ที่ Golden Rule ป้องกัน
- **`ops.audit_log`/`ops.failed_jobs`** อนุญาตให้ทุก Service insert ตรงได้ (ผ่าน RLS insert-only
  policy) เพราะเป็น infrastructure concern ระดับ logging ไม่ใช่ business data — ถ้าบังคับให้ log
  ทุกอย่างต้องเรียกผ่าน Edge Function ของ Ops Service แบบ synchronous จะเพิ่มจุดล้มเหลวโดยไม่ได้
  ประโยชน์อะไรเพิ่ม เป็นข้อยกเว้นเชิง pragmatic ที่ตั้งใจระบุไว้ตรงนี้
- **Data Pipeline (Python script) ไม่ใช่ Edge Function จึงไม่ถูกผูกด้วย Golden Rule โดยตรง — แต่
  นับเป็นส่วนหนึ่งของ School Data Service เอง** (เหมือน Actor "Scraper/Crawler Service" ที่แมป
  เข้ากับ School Data Service ในหัวข้อ 4.6) เขียนเข้า schema `school_data` ตรงด้วย service role
  key ของตัวเอง ถือเป็น "เจ้าของ schema เขียนข้อมูลตัวเอง" ไม่ใช่การเรียกข้าม Service — ต่างจาก
  Re-embed handler ที่เป็น Edge Function ของ **AI Service** ซึ่งต้องเรียกผ่าน `school-data-api`
  เพราะเป็นคนละ Service กับเจ้าของ schema จริงๆ
- **`account-deletion-cron` (pg_cron job, ไม่ใช่ Edge Function เช่นกัน)** — งาน hard-delete ตอน
  Grace Period ของ UC-U01 E5/UC-A05 หมดอายุ ต้องแก้ข้อมูล **3 schema พร้อมกันในธุรกรรมเดียว**:
  anonymize `community.reviews`, ลบ `user_data.children_profiles`/`favorites`/`comparison_sets`,
  ลบ `ai.conversations`/`messages` — เพราะยังเป็น Postgres instance เดียวกัน (ดูหัวข้อ 4.6) จึงรัน
  SQL ข้าม schema ในธุรกรรมเดียวได้จริงโดยไม่ต้องประสานงานข้าม service ทาง HTTP เลย ถือเป็นงาน
  ระดับ infrastructure/compliance (PDPA) เหมือน audit_log ไม่ใช่ business logic ของ Service ไหน
  โดยเฉพาะ — ถ้าในอนาคตแยกแต่ละ schema ไป database คนละตัวจริง งานนี้จะต้องเปลี่ยนเป็น Saga
  pattern ข้าม Service แทน (ทำเครื่องหมายไว้เป็นความเสี่ยงทางเทคนิคที่ต้องจัดการถ้า scale ระบบใน
  อนาคต)

### 4.3 การเรียกข้าม Service ที่เกิดขึ้นจริงในระบบนี้ (ต้องผ่าน Golden Rule)

| ผู้เรียก | เรียก Service ไหน | เพื่ออะไร | Use Case |
|---|---|---|---|
| Chatbot (`chatbot-api`, AI Service) | School Data Service (`school-data-api`) | `search_schools`/`get_school_details`/`compare_schools` ตอบคำถามผู้ปกครอง | UC-U05 |
| Chatbot (`chatbot-api`, AI Service) | User Service (`user-data-api`) | ดึงโปรไฟล์บุตรหลานมาเสริม context การแนะนำ | UC-U05 |
| Re-embed handler (AI Service) | School Data Service (`school-data-api`) | ดึงข้อความเวอร์ชันที่เพิ่ง publish มาคำนวณ embedding | UC-A07 |
| PDF Export (Ops Service) | School Data Service + User Service | ดึงรายละเอียดโรงเรียนตาม comparison_sets ที่บันทึกไว้มาสร้าง PDF | UC-U08 |
| `get-shared-comparison` (User Service) | School Data Service (`school-data-api`) | ดึงรายละเอียดโรงเรียน**ล่าสุด**ตาม `school_ids` ในชุดที่ถูกแชร์มาประกอบเป็น response เดียว (ไม่ใช่ snapshot ต่างจาก PDF Export ข้างบนโดยตั้งใจ) | UC-G07 |

**หมายเหตุ — ตารางข้างบนคือเฉพาะกรณีที่ Service ต้นทาง "มี" Edge Function เป็นคนยิง call ออกไปเอง**
(ตรวจสอบด้วย Golden Rule ในหัวข้อ 4.2) — Community Service **ไม่มี** Edge Function ของตัวเอง (ตาราง
4.1) จึงไม่สามารถเป็นผู้เรียกในความหมายนี้ได้ เหตุการณ์ที่ Community Service ต้อง "แจ้งเตือน" คนอื่น
(เช่น ticket เปลี่ยนสถานะ) จึงใช้ **Database Webhook** แทน ไม่ใช่ Service เรียก Service — จัดกลุ่มไว้
รวมกับกรณีอื่นด้านล่าง (4.3.1)

#### 4.3.1 Database Webhook ที่ trigger Ops Service (ไม่ใช่ Golden-Rule cross-service call)

| Webhook ติดที่ | Trigger เมื่อ | เรียก | Use Case |
|---|---|---|---|
| `auth.users` (Supabase Auth, platform-level ไม่ใช่ของ Service ไหน) | insert แถวใหม่ (สมัครสมาชิก) | Ops Service (`notification-sender`) | UC-G06 |
| `community.data_correction_reports` | column `status` เปลี่ยน | Ops Service (`notification-sender`) แจ้งผู้ report | UC-U07, A11 |

ทั้งสองกรณีนี้ไม่ผ่าน Edge Function ต้นทางเลย (Database Webhook ยิง HTTP ตรงจาก Postgres trigger
ไปหา Ops Service) จึงไม่ต้องมี Internal Service Secret/JWT forward แบบหัวข้อ 4.4 — ยืนยันตัวตนด้วย
Webhook Secret ของ Supabase เองแทน (คนละกลไกกับ Service-to-Service call จริง)



### 4.4 Service-to-Service Authentication

การเรียกข้าม Edge Function ใช้ 2 ชั้นร่วมกัน (ทางเลือกที่เบากว่า mTLS ของจริง แต่ยังพิสูจน์ตัวตน
ได้ เหมาะกับทีมเล็กที่ไม่มี certificate infra):

1. **Internal Service Secret** — custom header (เช่น `X-Internal-Service-Key`) ที่เก็บเป็น env
   secret รู้กันเฉพาะฝั่ง Edge Function พิสูจน์ว่าผู้เรียกเป็น service ของเราเอง ไม่ใช่ client
   สาธารณะที่ยิง endpoint เดียวกันตรงๆ
2. **Forward JWT เดิมของ user** — Edge Function ที่ถูกเรียก (เช่น `user-data-api`) ยังตรวจสิทธิ์
   ตาม JWT ของ user ต้นทางเสมอ ไม่ใช้ service role แบบข้ามสิทธิ์เต็มรูป เพื่อไม่ให้ service หนึ่ง
   มีสิทธิ์เกินกว่าที่ user ที่เรียกมาจริงควรมี (ปัญหาที่พบบ่อยเวลาออกแบบ internal call ของ
   Microservices)

**ข้อยกเว้น — `get-shared-comparison` (UC-G07):** ถูกเรียกโดย Guest ที่**ไม่มี JWT เลย** (ไม่ได้
login) กติกาข้อ 2 ข้างบนจึงใช้ไม่ได้ — แทนที่ด้วยการตรวจ `share_token` เป็นเงื่อนไขเข้าถึงแทน
JWT (ดู Use Case doc หัวข้อ 7.9/8.1) ส่วนตอน `get-shared-comparison` เรียกต่อไปหา `school-data-api`
เอง (ตาราง 4.3) ยังต้องมี Internal Service Secret ตามข้อ 1 ปกติ เพราะเป็นการเรียกข้าม Service
จริง แค่ไม่มี user JWT ให้ forward ต่อเท่านั้น — `school-data-api` จึงรู้ว่าคำขอนี้มาจาก Service
ที่ไว้ใจได้ (ผ่าน secret) แต่ให้สิทธิ์แค่ระดับ "public read" เหมือน anonymous request ทั่วไป ไม่ใช่
สิทธิ์แบบ user ที่ login อยู่

### 4.5 Pattern อื่นจากเอกสาร Use Case (Section 4) — ใช้ได้จริงแค่ไหนใน Schema-per-Service

| Pattern ในเอกสาร Use Case | ใน Schema-per-Service นี้ |
|---|---|
| Circuit Breaker ระหว่าง Service | ✅ ใช้จริงแล้ว — ครอบคลุมทั้ง External API (Maps, Serper, LLM) **และ** internal call ระหว่าง Edge Function (เช่น Chatbot → `school-data-api`) เพราะตอนนี้มีการเรียกข้าม service ทาง HTTP จริง |
| Event-Driven Sync ผ่าน Message Queue | ยังไม่ต้องมี Message Queue จริง — ใช้ Database Webhook → Edge Function แทน (ดูหัวข้อ 6) เพราะจำนวน async job ยังน้อยพอที่ retry ธรรมดา + `failed_jobs` table เพียงพอ |
| Reconciliation Job (checksum ระหว่าง Service) | ยังไม่จำเป็น — schema แยกกันแต่ยังอยู่ Postgres instance เดียว ไม่มีความเสี่ยง network partition ระหว่าง schema แบบที่ database แยก instance กันจะเจอ |
| Dead Letter Queue | ใช้ table `failed_jobs` แทน ไม่ต้องมี Message Queue จริง |
| Correlation ID | ✅ ใช้จริงแล้ว — ต้องพกข้าม Edge Function call ทุกครั้งที่เรียกข้าม service (ดู Use Case หัวข้อ 8.6) |

### 4.6 ข้อจำกัดที่ยังไม่ใช่ True Microservices (พูดตรงๆ ไว้ก่อนโดนถามตอน defend)

- **Fault isolation ไม่มีจริง:** ทุก schema ยังอยู่ Postgres instance เดียวกัน — ถ้า Postgres ของ
  Supabase project ล่ม ทุก Service ล่มพร้อมกันหมด ไม่ต่างจาก Monolith ในแง่นี้
- **ไม่มี Independent Scaling:** จะ scale เฉพาะ School Data Service (ซึ่งน่าจะโดน query หนักสุด)
  แยกจาก Service อื่นไม่ได้ เพราะเป็น database เดียวกัน
- **ไม่มี Polyglot Persistence:** ทุก Service ใช้ Postgres เหมือนกันหมด ไม่สามารถเลือก database
  ที่เหมาะกับแต่ละ domain ต่างกันได้ (เช่น Document DB สำหรับ conversations)
- **Edge Function รันบน runtime เดียวกัน:** ไม่มี resource isolation ระดับ container/instance
  ต่อ Service เหมือน Microservices ที่ deploy แยกจริง

*หมายเหตุ:* Actor แบบ "AI/LLM Recommendation Engine" และ "Scraper/Crawler Service" ในเอกสาร
Use Case เป็น actor เชิง**ตรรกะ** (logical role) ที่แมปกับ AI Service และ Data Pipeline ในตาราง
ข้างบนตามลำดับ ไม่ใช่ service เพิ่มเติมที่แยกออกไปอีก

---

## 5. Supabase — ชั้นเก็บและเสิร์ฟข้อมูล (Postgres instance เดียว, แบ่ง Schema ตาม Service)

**ใช้อะไร:** Supabase (Postgres แบบจัดการให้ + Storage + Auth + Auto-API + pg_cron + Database
Webhooks รวมในที่เดียว)

**เพื่ออะไร:** ได้ประโยชน์ของ Managed Infrastructure ที่ไม่ต้องดูแลเซิร์ฟเวอร์เอง (DB, Storage,
Auth, Cron ในที่เดียว) โดยไม่ต้องแลกกับการมี Service boundary จริง — infrastructure รวมศูนย์ได้
แต่ data ownership/access ระหว่าง 5 Service ยังแยกกันเข้มงวดตาม Golden Rule ในหัวข้อ 4 (คนละเรื่อง
กับการมีหลาย instance/deployment แยกจริงแบบ True Microservices ซึ่งเกินความจำเป็นของทีมขนาดนี้)

**ฟีเจอร์ที่ใช้จริง:**

- **Postgres + PostGIS + pgvector + Full-text search:** เก็บทุกตาราง แบ่งเป็น 5 schema ตาม
  Service (ดูหัวข้อ 4) — `school_data`, `community`, `user_data`, `ai`, `ops`, PostGIS
  รองรับ query แผนที่ — ส่วนการค้นหาชื่อโรงเรียนใช้ **`pg_trgm` (trigram) ไม่ใช่ full-text search**
  เพราะ Postgres ไม่มี dictionary ภาษาไทย จึงตัดคำไทยไม่ได้ ทำให้ `to_tsvector` ใช้กับชื่อโรงเรียน
  ภาษาไทยไม่ได้ผลจริง (แก้ไขใน v6.3 — รุ่นก่อนหน้าเขียนว่าใช้ full-text search ซึ่งใช้ไม่ได้จริง)
  ขณะที่ `pg_trgm` ทำงานที่ระดับตัวอักษร จึงค้นได้ทั้งไทย/อังกฤษ และทนการพิมพ์ผิดตรงตามคำว่า
  "fuzzy" ที่ต้องการอยู่แล้ว — ทั้งสองทางไม่ต้องมี Elasticsearch แยก, pgvector เตรียมไว้สำหรับ
  semantic search ในอนาคต
- **Storage:** เก็บโลโก้โรงเรียน — S3-compatible + CDN + resize รูปในตัว
- **Auth + RLS:** login ของทั้ง 3 actor + policy ควบคุมสิทธิ์อ่าน/เขียนต่อ table **และ**
  บังคับ ownership boundary ระหว่าง schema ตาม Golden Rule ของแต่ละ Service (ดูหัวข้อ 4.2)
- **Auto REST/GraphQL API:** สร้าง endpoint อัตโนมัติจาก schema — ทำหน้าที่เป็น "public API"
  ของแต่ละ Service สำหรับ read/write ที่ client เรียกตรงได้ (ไม่ใช่ internal cross-service call)
- **pg_cron:** รันงานตามตารางเวลาในตัว Postgres เอง — ใช้กับ monthly re-scrape และงาน
  hard-delete บัญชีหลัง PDPA grace period หมด
- **Database Webhook:** ยิง HTTP call ไปหา Edge Function อัตโนมัติเมื่อข้อมูลเปลี่ยน — ใช้ trigger
  การ re-embed ทุกครั้งที่โรงเรียนถูก publish (ตอบโจทย์ UC-A07 โดยไม่ต้องมี Message Queue)
- **Postgres Advisory Lock:** ใช้แทน Redis `SETNX` ล็อกต่อ school_id ก่อนเริ่ม Scraper job (กัน job
  ซ้อนกันตาม UC-A03 หัวข้อ 8.2) — ปลด lock อัตโนมัติเมื่อ session/connection จบ ไม่ต้องตั้ง TTL แยก
  เหมือน Redis เพราะไม่มี Redis instance ในสแตกนี้อยู่แล้ว

---

## 6. Edge Functions — งาน async/logic ที่แยกจาก Supabase หลัก

| Function | ใช้อะไร | เพื่ออะไร | ทำงานยังไง |
|---|---|---|---|
| **`school-data-api`** | Query ตรงบน schema `school_data` ของตัวเอง | เป็น API ตัวแทนของ School Data Service ให้ Service อื่นเรียกข้อมูลข้าม service ได้โดยไม่ผิด Golden Rule | expose `search_schools`, `get_school_details`, `compare_schools` — เรียกจาก Chatbot, Re-embed handler, PDF Export ผ่าน internal service secret (ดูหัวข้อ 4.4) |
| **`user-data-api`** | Query ตรงบน schema `user_data` ของตัวเอง | เป็น API ตัวแทนของ User Service ให้ Service อื่นดึงข้อมูลผู้ใช้แบบจำกัดสิทธิ์ | expose `get_profile_summary(user_id)` (ให้ Chatbot ใช้เสริม context) และ `get_comparison_set(comparison_id)` (ให้ PDF Export ของ Ops Service ดึงชุดเปรียบเทียบที่ผู้ใช้บันทึกไว้ ตามตาราง 4.3) — ทั้งสองตรวจ JWT ของ user เดิมที่ forward มาเสมอ ไม่ใช้ service role ข้ามสิทธิ์ |
| **`get-shared-comparison`** (User Service) | Query `comparison_sets` ด้วย Service Role (bypass RLS โดยตั้งใจ) + เรียก `school-data-api` | เป็น public read-only endpoint ให้ Guest เปิดลิงก์แชร์ดูได้โดยไม่ต้อง login (UC-G07) | รับ `share_token` → เช็ค `share_enabled=true` → เรียก `school-data-api` ดึงรายละเอียดโรงเรียนล่าสุดตาม `school_ids` → คืนเฉพาะ field ที่จำเป็น (`name`, รายละเอียดโรงเรียน) **ไม่คืน `user_id`** — มี rate limit ต่อ IP กัน abuse (ดู UC-G07 E3) |
| **Chatbot tool-calling** (`chatbot-api`, AI Service) | Claude/Gemini + function calling | ตอบคำถามผู้ปกครองโดยอ้างอิงข้อมูลจริงเสมอ ไม่เดาตัวเลข | AI เรียก tool ที่ภายในยิง HTTP ไปหา `school-data-api` (`search_schools`/`get_school_details`/`compare_schools`) และ `user-data-api` (โปรไฟล์บุตรหลาน) แทนการ query schema อื่นตรงๆ (ดูเหตุผลหัวข้อ 8) — คืนค่าเป็น structured output แยก `answer` กับ `suggested_replies` (array ของ Quick Reply 2-3 ข้อ) เสมอ ไม่ใช่ text ปนกัน เพื่อให้ Frontend render เป็นปุ่ม Guided Prompts ได้ตรงๆ (UC-U05) — มี rate limiter นับ request/user/ช่วงเวลา กันต้นทุนบาน |
| **Re-embed handler** (AI Service) | รับ trigger จาก Database Webhook ของ School Data Service | ทำให้ pgvector อัปเดตตามข้อมูลล่าสุดเสมอเมื่อมีการ publish | เรียก `school-data-api` ดึงข้อความเวอร์ชันที่เพิ่ง publish → คำนวณ embedding → เขียนกลับ schema `ai` ของตัวเอง — ล้มเหลวก็ retry แบบ exponential backoff, พังซ้ำเข้า `failed_jobs` |
| **PDF Export** (Ops Service) | PDF generation library | ให้ผู้ใช้ export ตารางเปรียบเทียบเป็น PDF ได้ (UC-U08) | เรียก `user-data-api` (`get_comparison_set(comparison_id)`) ดึงชุดเปรียบเทียบที่บันทึกไว้ — จึง Export ได้เฉพาะชุดที่ผู้ใช้กด "บันทึก" แล้วเท่านั้นตาม UC-U08 E4 — แล้วเรียก `school-data-api` ดึงรายละเอียดโรงเรียนแต่ละแห่ง → สร้าง PDF แบบ async, ใช้ snapshot ข้อมูล ณ ตอนกดสร้างเท่านั้น (ไม่ใช่ real-time — ต่างจาก `get-shared-comparison` ข้างบนที่ตั้งใจให้เป็น live เสมอ), เสร็จแล้วเรียก Notification sender |
| **Notification sender** (Ops Service) | Resend API | ส่งอีเมลยืนยัน/แจ้งสถานะ ticket/แจ้ง PDF เสร็จ | รับ event จาก 3 ทาง: (1)-(2) **Database Webhook** จาก `auth.users` (สมัครสมาชิก) และจาก `community.data_correction_reports` (ticket เปลี่ยนสถานะ) — ทั้งสองไม่ผ่าน Edge Function ต้นทาง ยิงตรงจาก Postgres trigger (ดูหัวข้อ 4.3.1) (3) เรียกภายใน Ops Service เองตอน PDF Export เสร็จ — รับแค่ payload สำเร็จรูป ไม่ต้องดึงข้อมูลข้าม Service เพิ่มเอง |

---

## 7. Data Model — ตารางหลักใน Postgres (จัดกลุ่มตาม Schema/Service — ดูหัวข้อ 4)

| Schema (Service) | ตาราง | เก็บอะไร | มาจาก Use Case |
|---|---|---|---|
| `school_data` (School Data Service) | `schools`, `school_versions` | `schools` เป็น pointer เบาๆ (status enum `active`/`archived` + `current_published_version_id`), `school_versions` เป็น log แบบ full-snapshot (JSONB) ต่อเวอร์ชัน มี `version_number`/`parent_version_id` เองสำหรับ Optimistic Locking และ status enum ของตัวเอง (`pending_review`/`approved`/`rejected`/`published`/`superseded`) | UC-A01 ถึง A04 |
| `school_data` (School Data Service) | `version_fees`, `version_extra_fees` | ค่าเทอมรายชั้นและค่าใช้จ่ายแฝง normalize ออกจาก `data_snapshot` เป็นคอลัมน์ `numeric` พร้อม `academic_year`/`source_published_at` กำกับรายแถว — JSONB เก็บไว้เป็น provenance ดิบเท่านั้น ระบบอ่านค่าจริงจาก 2 ตารางนี้ (ดู Use Case doc หัวข้อ 7.3, 7.14-7.15) | UC-U03, U04, A03 |
| `school_data` (School Data Service) | `curriculums`, `curriculum_aliases`, `school_curriculums`, `grade_levels`, `grade_level_aliases`, `school_levels` | ตาราง lookup + alias สำหรับ normalize หลักสูตร/ระดับชั้นที่ OPEC ส่งมาเป็น free-text ภาษาไทยไม่มีมาตรฐาน — ถ้าไม่มีชั้นนี้ ตัวกรองของ UC-G01 จะกรองไม่เจอโรงเรียนจำนวนมาก (Use Case doc หัวข้อ 7.16) | UC-G01, A02 |
| `school_data` (School Data Service) | `version_safety` | มาตรการความปลอดภัย/นโยบายคุ้มครองเด็กต่อเวอร์ชัน — ทุกฟิลด์ boolean เป็น nullable โดยเจตนา (`null` = ระบบหาไม่เจอ ไม่ใช่ไม่มี) | UC-G02, UC-U03, UC-A03 |
| `school_data` (School Data Service) | `school_scrape_log` | log การทำงานของ Phase 3 พร้อม reasoning ของ AI | UC-A03 |
| `community` (Community Service) | `reviews` | รีวิว/คะแนน สถานะ pending/approved/rejected | UC-G04, U06, A06 |
| `community` (Community Service) | `data_correction_reports` | ticket แจ้งข้อมูลผิด (รวมจำนวนคนแจ้งซ้ำ) | UC-U07, A11 |
| `community` (Community Service) | `forum_posts`, `forum_comments` | กระทู้/ความคิดเห็นในฟอรัมผู้ปกครอง — สถานะ default เป็น `approved` (Post-Moderation) ต่างจาก `reviews` ที่ default `pending` | UC-G08, U09, A12 |
| `community` (Community Service) | `report_submissions`, `forum_likes` | ตารางเชื่อมที่บังคับ "1 บัญชีทำได้ครั้งเดียว" ที่ระดับ database (แจ้งข้อมูลผิดซ้ำ / กดถูกใจ) แทนการเขียน logic กันเองในโค้ด | UC-U07, U09 |
| `community` (Community Service) | `forum_reports` | รายการที่ผู้ใช้กดรายงานเนื้อหา 1 บัญชีต่อ 1 เนื้อหา ใช้จัดลำดับความสำคัญให้ Admin เท่านั้น ไม่ซ่อนเนื้อหาอัตโนมัติ | UC-U09, A12 |
| `user_data` (User Service) | `user_accounts` | ฟิลด์ธุรกิจของบัญชี (`status`, `deletion_requested_at`) ที่เพิ่มเข้า `auth.users` ตรงๆ ไม่ได้ ผูก 1:1 กับ `auth.users.id` — เป็น FK anchor ให้ตารางอื่นใน `user_data` | UC-U01, UC-A05 |
| `user_data` (User Service) | `children_profiles` 🔒 | ข้อมูลบุตรหลาน (อายุ, งบ, หลักสูตรที่สนใจ) — **sensitive ตาม PDPA** | UC-U01 |
| `user_data` (User Service) | `favorites` | โรงเรียนที่ผู้ใช้บันทึกไว้ (เก็บแค่ `school_id` อ้างอิง ไม่ join ข้าม schema ระดับ DB) | UC-U02 |
| `user_data` (User Service) | `comparison_sets` | ชุดเปรียบเทียบที่บันทึกไว้ (เก็บ `school_ids` อ้างอิงแบบ array) + `share_token`/`share_enabled` สำหรับลิงก์แชร์แบบ public read-only | UC-U03, U08, G07 |
| `ai` (AI Service) | `conversations`, `messages` | ประวัติแชท ใช้ summarize เมื่อยาวเกิน context | UC-U05 |
| `ai` (AI Service) | `school_embeddings` | embedding ต่อ `school_version_id` (อ้างอิงแบบ logical ไม่ใช่ FK ข้าม schema จริง เพราะเป็นข้อมูลของคนละ Service) | UC-A07 |
| `ops` (Ops Service) | `audit_log` | before/after snapshot ทุก action สำคัญ, append-only, insert ตรงได้จากทุก Service (ข้อยกเว้นตาม 4.2) | UC-A01, A05, A10 |
| `ops` (Ops Service) | `failed_jobs` | งาน background ที่ retry แล้วยังพัง (แทน Dead Letter Queue) | UC-A03, A07 |

**หมายเหตุ:** `favorites`/`comparison_sets` (schema `user_data`) เก็บแค่ `school_id` เป็นค่าอ้างอิง
ไม่มี Foreign Key ข้าม schema บังคับที่ระดับ database (Postgres ไม่บังคับ FK ข้าม schema ของ
service อื่นตามหลัก bounded context) — ความถูกต้อง (school_id มีอยู่จริงไหม) ตรวจที่ระดับ
application ตอนเขียนผ่าน Edge Function แทน ไม่ใช่ database constraint

---

## 8. ทำไม Chatbot ไม่ใช้ Vector Search เป็นหลัก

เอกสาร Use Case ระบุว่า chatbot ใช้ "RAG: vector search + hard filter" — แต่คำถามที่ผู้ปกครอง
น่าจะถามจริงเกือบทั้งหมดเป็นคำถามเชิงกรอง/เปรียบเทียบตัวเลข ("ค่าเทอมไม่เกินเท่าไหร่",
"หลักสูตรอะไร") ซึ่งเป็น structured query ไม่ใช่ semantic similarity แถมข้อมูลที่ Phase 3
เก็บตอนนี้เป็น structured ล้วน ไม่มี free-text ให้ vector search จริงๆ

**ทางที่เลือก:** ให้ AI เรียก tool ที่ยิงไปหา `school-data-api` ของ School Data Service
(`search_schools`, `get_school_details`, `compare_schools` — ข้ามจาก AI Service ไป School Data
Service ตาม Golden Rule ในหัวข้อ 4.2 ไม่ query schema `school_data` ตรงๆ) — คำตอบ grounded บน
ข้อมูลจริงเสมอ ตรงกับ Business Rule ของ UC-U05 ที่ว่า "ห้าม LLM สร้างตัวเลขค่าเทอม/หลักสูตรขึ้น
เองโดยเด็ดขาด" โดยอัตโนมัติ เพราะ tool คืนแต่ข้อมูลที่มีอยู่จริงในระบบ ส่วน grounding check ที่
เอกสารขอ (UC-U05 E6) ทำเป็น safety net เพิ่มอีกชั้นได้ง่ายเพราะมี school_id จริงจาก tool call
อยู่แล้ว

pgvector (เก็บใน `ai.school_embeddings` — ดูหัวข้อ 7) ยังเก็บไว้สำหรับอนาคต — ถ้าจะให้
"RAG: vector search" มีความหมายจริงตามเอกสาร ต้องขยาย Phase 3 ให้ scrape เนื้อหาข้อความอิสระ
เพิ่ม (เช่นหน้าปรัชญาโรงเรียน) ก่อน

---

## 9. Frontend — 3 แอป

| แอป | ใช้อะไร | เพื่ออะไร |
|---|---|---|
| Admin Dashboard | React + SWR, เรียก Supabase Auto-API ของ**ทุก schema** (`school_data`, `community`, `user_data`, `ai`, `ops`) + Auth ตามสิทธิ์ RLS ของ role admin | ตรวจ diff ข้อมูลจาก Scraper พร้อม reasoning ของ AI, จัดการรีวิว/ticket/เนื้อหาฟอรัมที่ถูกรายงาน (UC-A12), จัดการบัญชีผู้ใช้รวมถึง soft-delete ข้อมูลใน `user_data` (UC-A05), ดูบทสนทนา AI เพื่อตรวจสอบ (UC-A08, ต้อง `ai` schema), ดู audit log |
| Public Web | React + SWR, เรียก Supabase Auto-API ของแต่ละ schema ตรง (`school_data` ค้นหา, `community` รีวิว, `user_data` โปรด/เปรียบเทียบ — เฉพาะของบัญชีตัวเอง ผ่าน RLS) + `get-shared-comparison` (User Service) สำหรับหน้าลิงก์แชร์โดยเฉพาะ | ค้นหา/กรอง, แผนที่ (PostGIS), รีวิว, ฟอรัมผู้ปกครอง (อ่านได้ทุกคน เขียนเฉพาะสมาชิก — UC-G08/U09), เปรียบเทียบ, เครื่องคำนวณค่าใช้จ่าย (เฉพาะสมาชิก), ดูหน้าเปรียบเทียบที่ถูกแชร์แบบไม่ต้อง login (UC-G07) |
| Chatbot UI | React, เรียก `chatbot-api` (AI Service) ตัวเดียว | สนทนา + ขอคำแนะนำโรงเรียนแบบ personalized (เฉพาะสมาชิก) — ฝั่ง client ไม่ต้องรู้เลยว่า Chatbot ไปเรียก School Data/User Service ต่ออีกที |

**หมายเหตุ:** Frontend เรียก Auto-API ของหลาย schema ตรงๆ ได้ (client เรียก "API สาธารณะ" ของ
แต่ละ Service เอง — ดูข้อยกเว้นในหัวข้อ 4.2) ต่างจากกรณี Service หนึ่งเรียกข้าม schema ของอีก
Service ในโค้ด backend ของตัวเอง ซึ่งต้องผ่าน Golden Rule เสมอ — **ข้อควรระวัง:** การเรียก
`user_data` schema ตรงผ่าน Auto-API ใช้ได้เฉพาะตอนดู/แก้ข้อมูลของบัญชีตัวเอง (RLS filter ด้วย
`user_id = auth.uid()` เสมอ) ส่วนหน้าลิงก์แชร์ (UC-G07) ที่ผู้เปิดไม่มีบัญชีเลย **ต้อง**ผ่าน
`get-shared-comparison` เท่านั้น ห้ามเปิด RLS ให้ query `comparison_sets` แบบ anonymous ตรงๆ
เด็ดขาด เพราะจะเสี่ยง list ชุดเปรียบเทียบของคนอื่นที่ไม่ได้ตั้งใจแชร์ออกไปด้วย (ดู Use Case doc
หัวข้อ 8.1)

**SWR/TanStack Query** ให้ pattern stale-while-revalidate มาในตัว — ถ้า API ช้า/ตอบไม่ทัน
ผู้ใช้ยังเห็นข้อมูลเก่าจาก cache แทนหน้า error ตรงตาม UC-G01/G02 โดยไม่ต้องสร้าง caching
layer เองฝั่ง backend

**Responsive Design (ตอบข้อ 5.1/8.2 ของแบบฟอร์ม คง.101):** ทั้ง 3 แอปใช้ **Tailwind CSS** แบบ
mobile-first (breakpoint `sm`/`md`/`lg`/`xl`) — เหตุผลที่ต้องทำจริงจังไม่ใช่แค่ Public Web
เท่านั้น: ผู้ปกครองจำนวนมากค้นหาโรงเรียนจากมือถือระหว่างเดินทาง ส่วน Admin Dashboard เองก็ต้อง
ใช้งานได้บน tablet เพราะ Admin อาจตรวจ diff ข้อมูลระหว่างเดินทางเช่นกัน — แผนที่ (PostGIS +
Leaflet/Mapbox) และตารางเปรียบเทียบ (UC-U03) เป็น 2 จุดที่ต้องออกแบบ layout สำหรับจอเล็กเป็น
พิเศษ (แผนที่ย่อเป็น full-screen mode บนมือถือ, ตารางเปรียบเทียบ scroll แนวนอนแทนการบีบคอลัมน์)

---

## 10. เดินตามข้อมูล 3 เส้นทาง (End-to-End Examples)

**เส้นทางที่ 1 — ข้อมูลโรงเรียนใหม่ (ทั้งหมดอยู่ใน School Data Service):**
1. Phase 1 ดึงชื่อโรงเรียนจาก OPEC เข้า Supabase เป็นแถวใหม่ใน schema `school_data` (status
   `active`, `current_published_version_id` ยังเป็น NULL — ยังไม่ขึ้นแสดงต่อ Guest/Parent)
2. Phase 2 หา URL ผ่าน Serper → Admin ยืนยัน URL ใน Preview
3. Phase 3 อ่านเว็บ/PDF → AI สกัดข้อมูล confidence 0.95 พร้อม `source_published_at` ถ้าหาเจอ
   (ดู Use Case doc หัวข้อ 7.3) → สถานะ `pending_review`
4. Admin เปิด Dashboard เห็น diff + reasoning → approve → `published` → Database Webhook
   ยิง `re-embed-handler` (AI Service) อัตโนมัติ พร้อม Correlation ID เดียวกันตลอด flow →
   `re-embed-handler` เรียก `school-data-api` ดึงข้อความล่าสุดไปคำนวณ embedding เขียนลง
   `ai.school_embeddings` → บันทึกลง `audit_log`
5. ข้อมูลขึ้นแผนที่/ผลค้นหาทันที (Public Web อ่านจาก `school_data` schema ตรง)

**เส้นทางที่ 2 — ผู้ปกครองใช้ Chatbot (ข้าม 3 Service จริง):**
1. ผู้ปกครอง login แล้วเห็น Guided Prompts เป็นปุ่มหัวข้อคำถามนำทาง กดปุ่ม "แนะนำโรงเรียน
   หลักสูตรอเมริกัน งบไม่เกิน 800,000" (หรือพิมพ์เองก็ได้) ที่ Chatbot UI → เรียก `chatbot-api`
   (AI Service) พร้อม Correlation ID ใหม่
2. `chatbot-api` เช็ค rate limit → เรียก `user-data-api` (User Service) ด้วย internal service
   secret + JWT ของ user เดิม เพื่อดึงโปรไฟล์บุตรหลานมาเสริม context
3. `chatbot-api` เรียก `school-data-api` (School Data Service) ด้วย
   `search_schools(curriculum='American', max_tuition=800000, ...)` — ทุก call ข้าม service
   พก Correlation ID เดียวกัน
4. ได้รายชื่อจริงจาก School Data Service กลับมา → grounding check ผ่าน (school_id มีอยู่จริง) →
   AI สรุปคำตอบเป็นภาษาธรรมชาติพร้อมอ้างอิงวันที่ข้อมูลอัปเดตล่าสุด
5. บันทึกบทสนทนาไว้ใน schema `ai` (`conversations`/`messages`) สำหรับ Admin ตรวจสอบย้อนหลังได้
   (UC-A08)
6. LLM แนบ `suggested_replies` มาพร้อม `answer` เสมอ (ดูหัวข้อ 6) → Frontend render เป็นปุ่ม
   Quick Reply เช่น "ดูค่าใช้จ่ายแฝงของโรงเรียนแรกไหม" ให้กดต่อได้ทันทีโดยไม่ต้องพิมพ์

**เส้นทางที่ 3 — เพื่อนของผู้ปกครองเปิดลิงก์เปรียบเทียบที่แชร์มา (Guest, ไม่มีบัญชี):**
1. ผู้ปกครอง A บันทึกชุดเปรียบเทียบใน UC-U03 แล้วกด "สร้างลิงก์แชร์" ใน UC-U08 → ได้ URL ที่มี
   `share_token` ต่อท้าย → ส่งให้เพื่อนทาง LINE
2. เพื่อน (Guest, ไม่มีบัญชี) เปิดลิงก์ → Public Web เรียก `get-shared-comparison` (User Service)
   ด้วย token พร้อม Correlation ID ใหม่ (แม้ไม่มี JWT ก็ยังต้องพก Correlation ID เหมือน call อื่น
   ตามหัวข้อ 4.5) — ไม่มี JWT ให้ forward เพราะไม่ได้ login (ดูข้อยกเว้นหัวข้อ 4.4)
3. `get-shared-comparison` query `comparison_sets` ด้วย Service Role ตรวจ `share_enabled=true`
   → เรียกต่อไปหา `school-data-api` (School Data Service) ด้วย internal service secret + Correlation
   ID เดียวกัน ดึงรายละเอียดโรงเรียน**ล่าสุด** (ไม่ใช่ snapshot ตอนแชร์) ตาม `school_ids` ในชุด
4. คืนตารางเปรียบเทียบแบบ read-only ให้เพื่อนดู — ไม่มี `user_id`/ชื่อผู้ปกครอง A ปรากฏใน response
   เลย แม้แต่ token เดียวกันเปิดซ้ำอีก 3 เดือนให้หลังก็ยังเห็นค่าเทอมล่าสุด ไม่ใช่ตัวเลขเก่าตอนแชร์

---

## 11. ข้อควรระวังเรื่อง PDPA / ความปลอดภัยของข้อมูลบุตรหลาน

`children_profiles` เป็นข้อมูลอ่อนไหวกว่าข้อมูลโรงเรียนทั่วไปมาก:

- RLS จำกัดให้เจ้าของบัญชีเห็นข้อมูลตัวเองเท่านั้น — แต่ RLS ป้องกันแค่ระดับ API ไม่ป้องกันคนที่
  เข้าถึง Supabase project โดยตรง (เช่นผ่าน Dashboard) ดังนั้นต้อง**จำกัดจำนวนคนที่มี credential
  เข้า Supabase project เองให้น้อยที่สุด**
- การเข้าดูข้อมูลบุตรหลาน/บทสนทนา AI โดย Admin ต้องถูกบันทึกลง `audit_log` แยกจาก action ทั่วไป
  (ตรงตาม UC-A08 E1)
- คำขอลบบัญชีใช้ **Soft Delete + Grace Period** — ข้อมูลจริงยังไม่หายทันที รอ `account-deletion-cron`
  (`pg_cron`) มา hard-delete หลังพ้นระยะเวลาตามที่ PDPA กำหนด — งานนี้ต้องแก้ข้อมูลข้าม 3 schema
  พร้อมกัน (`community`/`user_data`/`ai`) ในธุรกรรมเดียว ดูเหตุผลและข้อจำกัดเต็มที่หัวข้อ 4.2

---

## 12. ข้อจำกัดที่ยังต้องพัฒนาต่อ (จากผลทดสอบ prototype)

- เว็บที่แสดง PDF เป็นภาพ (ป้องกันการดาวน์โหลด) ยังอ่านไม่ได้ — ต้องเพิ่ม vision fallback
- เว็บที่มีระบบป้องกันบอท (เช่น Cloudflare) ยังเข้าไม่ได้ — ต้องส่งไป manual entry
- ยังไม่ทดสอบการนำทางแบบหลายคลิก
- ยังไม่ทดสอบ prompt injection กับเนื้อหาที่เป็นอันตรายจริง
- **Phase 3 ยังไม่ scrape เนื้อหาข้อความอิสระ** — ตัว pipeline ของ Re-embed handler (Database
  Webhook → เรียก `school-data-api` → คำนวณ embedding → เขียน `ai.school_embeddings`, ดูหัวข้อ
  4.3/6/10) เป็น infrastructure ที่ต่อเสร็จและ trigger ทำงานจริงทุกครั้งที่มีการ publish แต่
  **เนื้อหาที่ถูก embed ยังเป็นแค่ข้อมูล structured สั้นๆ** (ค่าเทอม/หลักสูตร) ไม่ใช่เนื้อหาข้อความ
  อิสระที่ทำให้ semantic/vector search มีความหมายจริงตามที่ตั้งใจไว้ — พูดให้ตรงคือ **"ท่อส่งข้อมูล
  ทำงานจริง แต่ของที่ไหลอยู่ในท่อยังไม่มีค่าให้ vector search ใช้ประโยชน์ได้เต็มที่"** จนกว่าจะขยาย
  Phase 3 ให้ scrape เนื้อหาข้อความเพิ่ม (ดู UC-A07 ในเอกสาร Use Case สำหรับรายละเอียด)

(รายละเอียดผลทดสอบเต็มอยู่ใน `prototype_findings_summary.md`)

---

## 13. DevOps & QA Plan

ตอบข้อ 7.5-7.6 ของแบบฟอร์ม คง.101 (Automated Testing, CI/CD, Centralized Logging, Error Tracking)
— scope ให้เหมาะกับทีม 2 คน ไม่ over-engineer เหมือนโปรดักชันระดับองค์กร แต่ให้มี "ของจริง" รองรับ
ทุกคำที่ฟอร์มสัญญาไว้

### 13.1 Automated Testing

| ประเภท | เครื่องมือ | ขอบเขต |
|---|---|---|
| **API Testing** | Deno test runner (Edge Functions) + Supabase CLI local dev instance | ทุก Edge Function (`school-data-api`, `user-data-api`, `get-shared-comparison`, `chatbot-api`, `re-embed-handler`, `pdf-export`, `notification-sender`) มี unit test ของ business logic + integration test ที่ยิงเข้า local Supabase จริง |
| **RLS Policy Testing** | pgTAP (Postgres extension สำหรับ test SQL/policy โดยเฉพาะ) | ทดสอบ Anti-IDOR ในหัวข้อ 8.1 ของ Use Case doc ตรงๆ — เช่น "user A ต้อง query `children_profiles` ของ user B ไม่ได้เด็ดขาด" เขียนเป็น test case รันทุกครั้งที่แก้ policy เพราะเป็นจุดที่พังแล้วกระทบ PDPA โดยตรง |
| **Exception Flow → Integration Test** | (ตามที่ Use Case doc หัวข้อ 6 แนะนำไว้แล้ว) | 1 Exception Flow ในเอกสาร Use Case ≈ 1 Integration Test ขั้นต่ำ — ใช้ตาราง UC เป็น test matrix ตรงๆ ไม่ต้องเขียน test plan แยกอีกชุด |
| **Security Testing** | `npm audit`/GitHub Dependabot (dependency scan อัตโนมัติ) + OWASP Top 10 checklist ตรวจด้วยมือก่อน milestone ใหญ่ | เน้น 3 จุดเสี่ยงที่เอกสารนี้ระบุไว้แล้วว่าเป็นความเสี่ยงจริง: Prompt Injection (หัวข้อ 8.3 ของ Use Case doc), XSS จากเนื้อหา Scrape (UC-A03 E6), RLS/Anti-IDOR (ข้างบน) — ไม่ทำ full penetration test เพราะเกินกำลังทีม 2 คน แต่ 3 จุดนี้คือความเสี่ยงจริงของระบบนี้ ไม่ใช่ generic checklist |
| **Load Testing** | k6 (script-based, เบา, รันจาก CI ได้) | ยิงที่ endpoint ที่โดนหนักสุดตามธรรมชาติของระบบ: ค้นหาโรงเรียน (`school-data-api`/Auto-API) และ Chatbot (`chatbot-api` — มี rate limiter อยู่แล้วตามหัวข้อ 6 ต้องทดสอบว่า limiter ทำงานจริงตอนโหลดสูง) รันก่อน demo/submission ไม่ใช่ทุก commit |
| **UAT** | Session ทดสอบกับผู้ปกครองจริง 5-10 คน | ให้ทำ Use Case หลัก (UC-G01 ค้นหา → UC-U03 เปรียบเทียบ → UC-U04 คำนวณค่าใช้จ่าย → UC-U05 ถาม Chatbot) แบบ think-aloud เก็บ feedback ก่อนส่งเล่มจริง อย่างน้อย 1 รอบ |

### 13.2 CI/CD Pipeline

**เครื่องมือ:** GitHub Actions (ฟรีสำหรับ repo, ผูกกับ GitHub ที่ใช้เก็บโค้ดอยู่แล้ว)

| Trigger | ทำอะไร |
|---|---|
| ทุก Pull Request | Lint (ESLint/Prettier) + Type-check (TypeScript) + รัน Deno test ของ Edge Functions + รัน pgTAP RLS test (หัวข้อ 13.1) — PR merge ไม่ได้ถ้าอันไหนแดง |
| Merge เข้า `main` | Deploy Frontend (Vercel/Netlify auto-deploy จาก Git) + `supabase functions deploy` (Edge Functions ทั้ง 7 ตัว) + รัน DB migration ที่เก็บเป็นไฟล์ version control (Supabase CLI migration) |
| ก่อน Deploy Production | รัน k6 load test แบบย่อ (smoke test) — ถ้า error rate/latency ผิดปกติ หยุด pipeline ไม่ deploy ต่อ |

**Environment แยก (ปรับใน v6.3):** แผนเดิมเขียนว่าจะแยก Dev/Staging/Production เป็น 3 Supabase
project ซึ่งทั้งเกินเพดาน Free plan (ให้ active project ได้ 2 ตัว) และเกินความจำเป็นของทีม 2 คน —
ปรับเหลือ **2 ชั้นจริงคือ local กับ cloud**:

| Environment | ใช้อะไร | เหตุผล |
|---|---|---|
| **Dev** | **Supabase CLI รัน local ด้วย Docker** (`supabase start`) | ฟรี ไม่จำกัดจำนวน ไม่นับโควตา cloud และได้ Postgres/Auth/Storage/Edge Functions ครบเหมือนของจริง — พังยังไงก็ `supabase db reset` ใหม่ได้ เหมาะกับการรัน migration/pgTAP ซ้ำๆ ตอนพัฒนา |
| **Production** | **Supabase cloud project เดียว** | ใช้ทั้ง demo, UAT และผู้ใช้จริง |

**ทำไมถึงไม่มี Staging (การตัดสินใจ ไม่ใช่การมองข้าม):** local dev กันความเสี่ยงส่วนใหญ่ไปแล้ว
ความเสี่ยงที่เหลือจริงๆ คือ "migration ทำงานต่างออกไปเมื่อเจอข้อมูลจริง" ซึ่งตอนนี้ยังไม่มีข้อมูล
จริงของใครเลย — ข้อมูลโรงเรียน 291 แห่งสร้างใหม่จาก `data/international_schools_thailand_opec.json`
ได้ทุกเมื่อ ความเสียหายถ้า production พังจึงเกือบเป็นศูนย์ ในทางกลับกันการมี staging มีต้นทุนจริง
(รัน migration 2 รอบ, secret 2 ชุดใน CI, seed data ที่ค่อยๆ ไม่ตรงกัน) และบน Free plan ที่หยุด
โปรเจกต์อัตโนมัติเมื่อไม่มี activity 1 สัปดาห์ ยังกลายเป็นภาระต้องคอยปลุก 2 ที่แทนที่จะเป็นที่เดียว

**เงื่อนไขที่จะเพิ่ม Staging เป็น project ที่ 2:** เมื่อเริ่ม **UAT กับผู้ปกครองจริง** (หัวข้อ 13.1)
เพราะนาทีนั้นระบบจะมี `children_profiles` ซึ่งเป็นข้อมูลเด็กจริงตาม PDPA ที่สร้างใหม่ไม่ได้และ
เอามาเสี่ยงกับ migration ที่ยังไม่ผ่านการทดสอบไม่ได้ — ก่อนถึงจุดนั้น staging เป็นพิธีกรรมที่ไม่
ได้ป้องกันอะไรเพิ่ม

ทุก environment ใช้ schema ชุดเดียวกัน (`school_data`/`community`/`user_data`/`ai`/`ops`)

**⚠️ ข้อควรระวังของ Free tier ที่กระทบวัน demo:** โปรเจกต์ Supabase บน Free plan **ถูกหยุด
อัตโนมัติเมื่อไม่มี activity ครบ 1 สัปดาห์** และตอนหยุด `pg_cron` ก็ไม่ทำงานด้วย — ต้องตั้ง
GitHub Actions cron ยิง health-check สัปดาห์ละครั้ง (ใช้โควตาฟรีของ GitHub) และซ้อม restore
ล่วงหน้าอย่างน้อย 1 วันก่อนวันสอบ ไม่ใช่มารู้ตอนเปิดเว็บหน้างาน

### 13.3 Centralized Logging & Error Tracking

**ข้อดีที่ได้มาฟรีจากการเลือก Schema-per-Service บน Supabase เดียว (หัวข้อ 4):** เพราะทุก Service
ยังรันบน Supabase project เดียวกัน log ของทุกอย่าง (Postgres query log, Edge Function log, Auth
log) **รวมศูนย์อยู่แล้วโดยธรรมชาติ** ใน Supabase Dashboard เดียว — ไม่ต้องต่อ log aggregator
แยกเอง (ต่างจาก True Microservices ที่ต้องลงทุนเรื่องนี้เพิ่มเพราะ log กระจายไปตาม instance)

| ชั้น | เครื่องมือ | เก็บอะไร |
|---|---|---|
| Infrastructure log | Supabase Dashboard (built-in) | Postgres query log, Edge Function invocation log, Auth log — ดูย้อนหลังได้ตรงจาก Dashboard ไม่ต้อง setup เพิ่ม |
| Application error tracking | Sentry (free tier) | Unhandled exception จาก Frontend (React) และ Edge Functions (Deno) พร้อม stack trace — alert อัตโนมัติเมื่อ error rate พุ่ง |
| Cross-service trace | Correlation ID (ดูหัวข้อ 4.5, Use Case doc หัวข้อ 8.6) | ใส่ Correlation ID เป็น tag ใน Sentry ทุกครั้งที่ log error จาก Edge Function ที่ถูกเรียกข้าม Service — เชื่อม Sentry event เข้ากับ log chain ทั้งเส้นได้ ไม่ต้องไล่ดูทีละ Service |
