# Skoolly — Data Dictionary

> อ่านจากฐานข้อมูล Supabase จริงโดยตรง ไม่ได้คัดลอกจากเอกสารออกแบบ  
> **25 ตาราง · 272 คอลัมน์ · Primary Key 25 · Unique 6 · Foreign Key 16 · Check 22 · Index 70 · Trigger 17**

คอลัมน์ **Reference Table** แสดงตารางปลายทางที่คอลัมน์นี้อ้างถึง — ถ้าเป็น Foreign Key จริงจะมี
พฤติกรรมตอนลบกำกับไว้ด้วย ส่วนที่ไม่มี Foreign Key คือการอ้างอิงข้าม Service ตามกติกา
Schema-per-Service หรือกรณีที่ PostgreSQL ประกาศ Foreign Key ไม่ได้ (สมาชิกในอาร์เรย์ และคอลัมน์
ที่ชี้ได้หลายตาราง) ซึ่งตรวจความถูกต้องด้วยทริกเกอร์หรือที่ชั้นแอปพลิเคชันแทน

---

## schema `school_data` — School Data Service

### `curriculums`

*17 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `code` | รหัสหลักสูตรมาตรฐานที่ใช้อ้างอิงทั้งระบบ เช่น BRITISH, AMERICAN, IB | `text` | PK | — |
| `name_th` | ชื่อหลักสูตรภาษาไทยที่ใช้แสดงต่อผู้ใช้ | `text` | NOT NULL | — |
| `name_en` | ชื่อหลักสูตรภาษาอังกฤษ | `text` | NOT NULL | — |
| `sort_order` | ลำดับการแสดงในรายการตัวเลือก | `integer` | NOT NULL, DEFAULT 100 | — |
| `aliases` | ข้อความดิบที่พบในข้อมูลจริงและต้องแปลงมาเป็นรหัสนี้ | `text[]` | NOT NULL, DEFAULT '{}' | — |

---

### `grade_levels`

*5 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `code` | รหัสระดับชั้นมาตรฐานที่ใช้อ้างอิงทั้งระบบ เช่น PRIMARY, UPPER_SEC | `text` | PK | — |
| `name_th` | ชื่อระดับชั้นภาษาไทยที่ใช้แสดงต่อผู้ใช้ | `text` | NOT NULL | — |
| `name_en` | ชื่อระดับชั้นภาษาอังกฤษ | `text` | NOT NULL | — |
| `sort_order` | ลำดับการแสดงจากชั้นเล็กไปชั้นโต | `integer` | NOT NULL, DEFAULT 100 | — |
| `aliases` | ข้อความดิบที่พบในข้อมูลจริงและต้องแปลงมาเป็นรหัสนี้ | `text[]` | NOT NULL, DEFAULT '{}' | — |

---

### `official_website_registry`

*291 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `school_code` | รหัสโรงเรียนจาก สช. ใช้จับคู่กับตารางโรงเรียน | `text` | PK | school_data.schools (opec_school_code) |
| `school_name_th` | ชื่อโรงเรียนภาษาไทย เก็บไว้ในตารางเพื่อให้ตรวจสอบได้โดยไม่ต้องเชื่อมตารางอื่น | `text` | — | — |
| `school_name_en` | ชื่อโรงเรียนภาษาอังกฤษ | `text` | — | — |
| `website_url` | URL เว็บไซต์ทางการที่บันทึกไว้ | `text` | NOT NULL, DEFAULT '' | — |
| `is_verified` | ผ่านการยืนยันจากผู้ดูแลระบบแล้วหรือยัง | `boolean` | NOT NULL, DEFAULT false | — |
| `source` | ที่มาของ URL นี้ จากทะเบียนที่ยืนยันแล้ว จากการค้นหา หรือผู้ดูแลกรอกเอง | `text` | NOT NULL, DEFAULT 'Manual Registry' | — |
| `notes` | บันทึกเพิ่มเติมของผู้ยืนยัน | `text` | — | — |
| `verified_at` | เวลาที่ยืนยัน | `timestamp with time zone` | — | — |
| `verified_by` | ผู้ยืนยันหรือที่มาของการยืนยัน | `text` | DEFAULT 'Admin' | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `http_status` | รหัสสถานะ HTTP จากการตรวจล่าสุด ใช้ดูว่าเว็บยังเข้าได้ | `integer` | — | — |
| `last_checked_at` | เวลาที่ตรวจสอบล่าสุดว่า URL ยังเข้าได้ | `timestamp with time zone` | — | — |
| `is_broken` | ลิงก์เสียหรือไม่ | `boolean` | NOT NULL, DEFAULT false | — |
| `error_reason` | สาเหตุที่เข้าไม่ได้ | `text` | — | — |

---

### `school_google_reviews`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `school_id` | โรงเรียนที่แคชชุดนี้เป็นของ | `uuid` | PK, FK | school_data.schools · ON DELETE CASCADE |
| `google_place_id` | รหัสสถานที่บน Google ที่ใช้ดึงข้อมูลชุดนี้ คัดลอกไว้เพื่อตรวจย้อนหลัง | `text` | NOT NULL | — |
| `rating_avg` | คะแนนเฉลี่ยที่ Google คืนมา ณ เวลาที่ดึง | `numeric(2,1)` | CHECK google_reviews_sane | — |
| `review_count` | จำนวนรีวิวทั้งหมดที่ Google คืนมา | `integer` | NOT NULL, DEFAULT 0, CHECK google_reviews_sane | — |
| `payload` | รายการรีวิวที่ Google คืนมาทั้งชุด (ไม่ query รายแถว จึงเก็บเป็นก้อน) | `jsonb` | NOT NULL | — |
| `attribution_url` | ลิงก์กลับหน้า Google ของโรงเรียน — บังคับแสดงคู่รีวิวเสมอ (UC-02 BR ข้อ 2) | `text` | NOT NULL | — |
| `fetched_at` | เวลาที่ดึงข้อมูลชุดนี้มาจริง ใช้แสดงว่าข้อมูลรีวิวเป็นของวันไหน | `timestamp with time zone` | NOT NULL, DEFAULT now(), CHECK google_reviews_sane | — |
| `expires_at` | ห้ามแสดง cache ที่เลยเวลานี้ ต้องดึงใหม่ | `timestamp with time zone` | NOT NULL, CHECK google_reviews_sane | — |

---

### `school_scrape_log`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `school_id` | โรงเรียนที่รอบนี้ทำงานด้วย ว่างได้ถ้าเป็นงานภาพรวม | `uuid` | FK | school_data.schools · ON DELETE SET NULL |
| `version_id` | เวอร์ชันที่เกิดจากรอบนี้ ว่างได้ถ้ารอบนั้นไม่พบการเปลี่ยนแปลง | `uuid` | FK | school_data.school_versions · ON DELETE SET NULL |
| `run_id` | 1 รอบการรัน (orchestrator) | `uuid` | NOT NULL | — |
| `correlation_id` | รหัสสำหรับตามรอยคำขอเดียวกันข้าม Service เวลาไล่ปัญหา (Use Case Spec หัวข้อ 8.6) | `uuid` | — | — |
| `phase` | ขั้นตอนของ pipeline ที่บันทึกนี้เป็นของ เช่น นำเข้า เติมข้อมูล นำทาง สกัด หรือความปลอดภัย | `text` | NOT NULL | — |
| `status` | ผลของขั้นตอนนี้ สำเร็จ ล้มเหลว หรือข้าม | `school_data.scrape_status` | NOT NULL | — |
| `page_scraped` | หน้าเว็บที่อ่านในขั้นตอนนี้ | `text` | — | — |
| `elapsed_sec` | เวลาที่ใช้เป็นวินาที | `numeric(8,2)` | — | — |
| `ai_model` | โมเดล AI ที่ใช้ในขั้นตอนนี้ | `text` | — | — |
| `ai_reasoning` | reasoning ของ NAV/EXTRACT ที่โชว์ให้ Admin (UC-13) | `text` | — | — |
| `error_message` | ข้อความผิดพลาดถ้าล้มเหลว | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `log_id` | ลำดับบันทึก ใช้ตัวเลขเรียงแทนรหัสสุ่มเพราะเป็นตารางบันทึกปริมาณสูง | `bigint` | PK | — |

---

### `school_versions`

*292 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `version_id` | รหัสเวอร์ชันของข้อมูลโรงเรียน | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `school_id` | โรงเรียนที่เวอร์ชันนี้เป็นของ | `uuid` | FK, UNIQUE รวม (school_id, version_number), NOT NULL | school_data.schools · ON DELETE CASCADE |
| `version_number` | ลำดับเวอร์ชันของโรงเรียนนั้น เริ่มที่ 1 และไม่ซ้ำกันภายในโรงเรียนเดียว | `integer` | UNIQUE รวม (school_id, version_number), NOT NULL, CHECK versions_number_positive | — |
| `parent_version_id` | เวอร์ชันที่ใช้เป็นฐานตอนสร้างเวอร์ชันนี้ ใช้ตรวจว่ามีคนแก้แทรกกลางคันหรือไม่ | `uuid` | FK | school_data.school_versions |
| `status` | สถานะเวอร์ชัน รอตรวจ ปฏิเสธ เผยแพร่ หรือถูกแทนที่แล้ว | `school_data.version_status` | NOT NULL, DEFAULT 'pending_review' | — |
| `source_type` | ที่มาของเวอร์ชัน มาจากผู้ดูแลแก้เอง จาก Scraper หรือจากการนำเข้าชุดใหญ่ | `school_data.source_type` | NOT NULL | — |
| `data_snapshot` | ข้อมูลทั้งก้อนของเวอร์ชันนี้เก็บเป็น JSON เพื่อย้อนดูและกู้คืนได้ | `jsonb` | NOT NULL | — |
| `diff_summary` | สรุปว่าเปลี่ยนอะไรจากเวอร์ชันก่อนหน้า ใช้แสดงในหน้าตรวจสอบของผู้ดูแล | `jsonb` | — | — |
| `confidence_score` | ระดับความมั่นใจของ AI ต่อข้อมูลที่สกัดมาได้ ค่าอยู่ระหว่าง 0 ถึง 1 มีความหมายเฉพาะเวอร์ชันที่ source_type เป็น scraper เท่านั้น | `real` | CHECK versions_confidence_range | — |
| `confidence_reasoning` | คำอธิบายจาก Scraper ว่าทำไมจึงให้คะแนนความมั่นใจเท่านี้ ใช้แสดงประกอบใน Diff View ตอนผู้ดูแลตรวจ (UC-14) | `text` | — | — |
| `scraped_page_url` | หน้าเว็บที่ Scraper อ่านข้อมูลนี้มา | `text` | — | — |
| `submitted_by` | ผู้ส่งเวอร์ชันนี้เข้าคิว | `uuid` | — | user_data.user_accounts |
| `submitted_at` | เวลาที่ส่งเข้าคิว | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `reviewed_by` | ผู้ดูแลที่ตรวจและตัดสิน | `uuid` | — | user_data.user_accounts |
| `reviewed_at` | เวลาที่ตัดสิน | `timestamp with time zone` | — | — |
| `rejection_reason` | เหตุผลที่ปฏิเสธ | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `schools`

*290 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `school_id` | รหัสประจำโรงเรียนในระบบ สร้างอัตโนมัติ | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `opec_school_code` | รหัสโรงเรียนจาก สช. ใช้เป็นกุญแจธรรมชาติ ทำให้นำเข้าซ้ำได้โดยไม่เกิดข้อมูลซ้ำ | `text` | UNIQUE | — |
| `slug` | ข้อความสั้นสำหรับใช้ใน URL ของหน้ารายละเอียดโรงเรียน | `text` | UNIQUE, NOT NULL | — |
| `name_th` | ชื่อโรงเรียนภาษาไทยตามทะเบียน สช. | `text` | NOT NULL | — |
| `name_en` | ชื่อโรงเรียนภาษาอังกฤษ บางโรงเรียนไม่มี | `text` | — | — |
| `status` | สถานะโรงเรียน active คือแสดงในระบบ archived คือปิดกิจการหรือถูกนำออก | `school_data.school_status` | NOT NULL, DEFAULT 'active' | — |
| `current_published_version_id` | เวอร์ชันข้อมูลที่กำลังเผยแพร่ให้ผู้ใช้เห็นอยู่ ว่างแปลว่ายังไม่เคยเผยแพร่ | `uuid` | FK | school_data.school_versions |
| `official_website_url` | URL เว็บไซต์ทางการ ใช้เป็นเป้าหมายของ Scraper | `text` | — | — |
| `website_source` | ที่มาของ URL เว็บไซต์ จากหน้าข้อมูล สช. จากการค้นหา หรือผู้ดูแลกรอกเอง | `text` | — | — |
| `website_confirmed_at` | เวลาที่ผู้ดูแลระบบยืนยันว่า URL นี้ถูกต้อง | `timestamp with time zone` | — | — |
| `website_confirmed_by` | ผู้ดูแลระบบที่ยืนยัน URL | `uuid` | — | user_data.user_accounts |
| `opec_profile_url` | URL หน้าข้อมูลโรงเรียนบนเว็บ สช. | `text` | — | — |
| `official_phone` | หมายเลขโทรศัพท์ติดต่อ | `text` | — | — |
| `official_mobile` | หมายเลขโทรศัพท์มือถือ | `text` | — | — |
| `official_email` | อีเมลติดต่อของโรงเรียน | `text` | — | — |
| `province` | จังหวัดที่ตั้ง ใช้เป็นตัวกรองหลักในหน้าค้นหา | `text` | NOT NULL | — |
| `district` | อำเภอหรือเขต | `text` | — | — |
| `subdistrict` | ตำบลหรือแขวง | `text` | — | — |
| `address` | ที่อยู่เต็มของโรงเรียน | `text` | — | — |
| `geom` | พิกัดละติจูดลองจิจูด ใช้คำนวณระยะทางและวางหมุดบนแผนที่ | `geography(Point,4326)` | — | — |
| `gps_precision` | ความแม่นยำของพิกัด ระบุตำแหน่งได้แน่นอน โดยประมาณ หรือไม่มีพิกัด | `text` | — | — |
| `gps_source` | แหล่งที่มาของพิกัด ค่าที่พบจริงคือ OPEC Official สำหรับพิกัดที่ทะเบียน สช. ให้มา 218 แถว และค่าที่ขึ้นต้นด้วย ArcGIS สำหรับพิกัดที่ได้จากการแปลงที่อยู่ด้วย ArcGIS World Geocoding Service อีก 72 แถว | `text` | — | — |
| `logo_url` | URL รูปตราโรงเรียน | `text` | — | — |
| `level_range` | ช่วงชั้นที่เปิดสอนเป็นข้อความดิบจาก สช. ใช้แสดงผลเท่านั้น ส่วนการกรองใช้ levels_offered | `text` | — | — |
| `student_count` | จำนวนนักเรียนตามข้อมูล สช. | `integer` | CHECK schools_counts_nonneg | — |
| `teacher_count` | จำนวนครูตามข้อมูล สช. | `integer` | CHECK schools_counts_nonneg | — |
| `pub_tuition_min_thb` | ค่าเทอมต่ำสุดของเวอร์ชันที่เผยแพร่อยู่ ใช้กรองช่วงราคาในหน้าค้นหาโดยไม่ต้องอ่าน JSONB | `numeric(12,2)` | CHECK schools_tuition_range | — |
| `pub_tuition_max_thb` | ค่าเทอมสูงสุดของเวอร์ชันที่เผยแพร่อยู่ | `numeric(12,2)` | CHECK schools_tuition_range | — |
| `pub_has_safeguarding_policy` | มีนโยบายคุ้มครองเด็กหรือไม่ ใช้แสดงป้ายในผลค้นหา | `boolean` | — | — |
| `pub_data_updated_at` | วันที่ข้อมูลของโรงเรียนนี้เปลี่ยนแปลงล่าสุด ใช้แสดงให้ผู้ใช้เห็นว่าข้อมูลสดแค่ไหน | `timestamp with time zone` | — | — |
| `rating_avg` | คะแนนรีวิวเฉลี่ยจาก Google คัดลอกมาโดยทริกเกอร์ google_reviews_sync | `numeric(2,1)` | CHECK schools_rating_range | — |
| `review_count` | จำนวนรีวิวจาก Google | `integer` | NOT NULL, DEFAULT 0, CHECK schools_counts_nonneg | — |
| `last_verified_at` | วันที่ระบบเข้าไปตรวจสอบล่าสุด อาจใหม่กว่าวันที่ข้อมูลเปลี่ยน เพราะตรวจแล้วอาจไม่พบการเปลี่ยนแปลง | `timestamp with time zone` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `levels_offered` | อาร์เรย์ระดับชั้น เช่น {'PRE_K', 'KINDERGARTEN', 'PRIMARY'} | `text[]` | NOT NULL, DEFAULT '{}' | school_data.grade_levels (สมาชิกในอาร์เรย์) |
| `curriculums` | อาร์เรย์รหัสหลักสูตร เช่น {'BRITISH', 'IB'} | `text[]` | NOT NULL, DEFAULT '{}' | school_data.curriculums (สมาชิกในอาร์เรย์) |
| `licensee_name` | ชื่อผู้รับใบอนุญาตจัดตั้งโรงเรียนตามทะเบียน สช. | `text` | — | — |
| `director_name` | ชื่อผู้อำนวยการโรงเรียนตามทะเบียน สช. | `text` | — | — |
| `manager_name` | ชื่อผู้จัดการโรงเรียนตามทะเบียน สช. | `text` | — | — |
| `government_support` | สถานะการรับเงินอุดหนุนจากรัฐตามข้อมูล สช. | `text` | — | — |
| `is_isat_member` | เป็นสมาชิกสมาคมโรงเรียนนานาชาติแห่งประเทศไทย (ISAT) หรือไม่ | `boolean` | DEFAULT false | — |
| `is_boarding` | มีหอพักประจำหรือไม่ | `boolean` | DEFAULT false | — |
| `year_established` | ปีที่ก่อตั้งโรงเรียน | `integer` | — | — |
| `accreditations` | รายการสถาบันรับรองมาตรฐาน เช่น CIS, WASC, NEASC | `text[]` | DEFAULT '{}' | — |
| `isat_school_name` | ชื่อโรงเรียนตามที่ปรากฏบนเว็บ ISAT ใช้ตรวจสอบว่าจับคู่ถูกโรงเรียน | `text` | — | — |
| `google_place_id` | รหัสสถานที่บน Google ของโรงเรียนนี้ ใช้ดึงรีวิวมาแสดง (UC-02 ข้อ 4) ว่างแปลว่าจับคู่กับสถานที่บน Google ไม่ได้ (UC-02 E6) | `text` | — | — |
| `social_links` | ลิงก์โซเชียลรวมเป็น JSON ก้อนเดียว คีย์ที่ใช้คือ facebook, line_id, instagram, youtube | `jsonb` | NOT NULL, DEFAULT '{}' | — |
| `row_version` | ตัวนับสำหรับ Optimistic Locking กันผู้ดูแลสองคนบันทึกทับกัน ทริกเกอร์บวกให้เอง | `integer` | NOT NULL, DEFAULT 1 | — |

---

### `version_extra_fees`

*6 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `extra_fee_id` | รหัสรายการค่าใช้จ่ายแฝง | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `version_id` | เวอร์ชันที่รายการนี้เป็นของ | `uuid` | FK, NOT NULL | school_data.school_versions · ON DELETE CASCADE |
| `name` | ชื่อรายการค่าใช้จ่าย เช่น ค่าสมัคร ค่าแรกเข้า หรือค่ากิจกรรม | `text` | NOT NULL | — |
| `amount_thb` | จำนวนเงินเป็นบาท ว่างได้ถ้าเว็บโรงเรียนบอกว่ามีค่าใช้จ่ายนี้แต่ไม่ระบุตัวเลข (UC-07 E1) | `numeric(12,2)` | CHECK extra_fees_amount_nonneg | — |
| `frequency` | ความถี่ในการเก็บ เช่น ครั้งเดียว รายปี รายภาค หรือรายเดือน | `school_data.fee_frequency` | NOT NULL, DEFAULT 'unknown' | — |
| `refundable` | คืนเงินได้หรือไม่ | `boolean` | — | — |
| `sibling_related` | ค่าใช้จ่ายรายการนี้เกี่ยวกับส่วนลดกรณีมีบุตรหลายคนเรียนพร้อมกันหรือไม่ ใช้ในเครื่องคำนวณค่าใช้จ่าย (UC-07) | `boolean` | NOT NULL, DEFAULT false | — |
| `academic_year` | ปีการศึกษาที่ตัวเลขนี้ใช้ | `text` | — | — |
| `source_published_at` | วันที่ต้นฉบับเผยแพร่ตัวเลขนี้ ใช้บอกผู้ใช้ว่าข้อมูลเก่าแค่ไหน | `date` | — | — |
| `notes` | ข้อความประกอบที่พบในต้นฉบับ | `text` | — | — |

---

### `version_fees`

*15 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `fee_id` | รหัสรายการค่าเทอม | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `version_id` | เวอร์ชันที่ค่าเทอมนี้เป็นของ | `uuid` | FK, NOT NULL | school_data.school_versions · ON DELETE CASCADE |
| `grade_label` | ข้อความระดับชั้นตามที่ปรากฏบนเว็บโรงเรียน เก็บไว้ตรวจย้อนหลัง | `text` | NOT NULL | — |
| `level_code` | รหัสระดับชั้นที่ค่าเทอมนี้ใช้ ว่างได้ถ้าต้นฉบับไม่ระบุชัด | `text` | — | school_data.grade_levels |
| `annual_thb` | ค่าเทอมต่อปีเป็นบาท ใช้ชนิด numeric เพื่อไม่ให้ปัดเศษผิด | `numeric(12,2)` | CHECK fees_amount_nonneg, CHECK version_fees_has_amount | — |
| `semester_thb` | ค่าเทอมต่อภาคการศึกษาเป็นบาท | `numeric(12,2)` | CHECK fees_amount_nonneg, CHECK version_fees_has_amount | — |
| `currency` | สกุลเงิน ปกติเป็น THB | `character(3)` | NOT NULL, DEFAULT 'THB' | — |
| `academic_year` | ปีการศึกษาที่ค่าเทอมนี้ใช้ เก็บตามที่ต้นฉบับเขียน จึงมีได้ทั้งแบบ พ.ศ. และแบบคร่อมปี | `text` | — | — |
| `source_published_at` | วันที่ต้นฉบับเผยแพร่ตัวเลขนี้ ใช้บอกผู้ใช้ว่าข้อมูลเก่าแค่ไหน ว่างได้เสมอ | `date` | — | — |
| `source_url` | หน้าเว็บที่อ่านตัวเลขนี้มา | `text` | — | — |
| `confidence_score` | ระดับความมั่นใจของ AI ต่อตัวเลขนี้ ค่าอยู่ระหว่าง 0 ถึง 1 | `real` | — | — |
| `notes` | ข้อความประกอบที่พบในต้นฉบับ | `text` | CHECK version_fees_has_amount | — |

---

### `version_safety`

*2 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `version_id` | เวอร์ชันที่ข้อมูลความปลอดภัยนี้เป็นของ | `uuid` | PK, FK | school_data.school_versions · ON DELETE CASCADE |
| `security_guards` | มีเจ้าหน้าที่รักษาความปลอดภัยหรือไม่ | `boolean` | — | — |
| `cctv_monitoring` | มีระบบกล้องวงจรปิดหรือไม่ | `boolean` | — | — |
| `nurse_medical_clinic` | มีห้องพยาบาลหรือพยาบาลประจำหรือไม่ | `boolean` | — | — |
| `child_safeguarding_policy` | มีนโยบายคุ้มครองเด็กหรือไม่ | `boolean` | — | — |
| `air_quality_pm25_protocol` | มีมาตรการรับมือฝุ่น PM2.5 หรือไม่ | `boolean` | — | — |
| `visitor_access_control` | มีการควบคุมบุคคลภายนอกเข้าออกหรือไม่ | `boolean` | — | — |
| `highlights` | ข้อความเด่นด้านความปลอดภัยที่สกัดมาได้ | `text[]` | — | — |
| `policy_summary` | สรุปนโยบายความปลอดภัยแบบย่อ | `text` | — | — |
| `policy_url` | URL หน้านโยบายฉบับเต็ม | `text` | — | — |
| `source_published_at` | วันที่ต้นฉบับเผยแพร่ข้อมูลชุดนี้ | `date` | — | — |

---

## schema `community` — Community Service

### `data_correction_reports`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `report_id` | รหัสเรื่องที่แจ้ง | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `school_id` | โรงเรียนที่ถูกแจ้งว่าข้อมูลผิด | `uuid` | NOT NULL | school_data.schools |
| `field_name` | ชื่อฟิลด์ที่ผู้ใช้แจ้งว่าผิด | `text` | NOT NULL | — |
| `description` | คำอธิบายจากผู้แจ้งว่าผิดอย่างไร | `text` | — | — |
| `evidence_url` | ลิงก์หลักฐานที่ผู้แจ้งแนบมา | `text` | — | — |
| `report_count` | จำนวนผู้ใช้ที่แจ้งเรื่องเดียวกัน ใช้จัดลำดับความสำคัญ ทริกเกอร์นับให้อัตโนมัติ | `integer` | NOT NULL, DEFAULT 1, CHECK reports_count_positive | — |
| `status` | สถานะเรื่อง เปิดอยู่ ปิดโดยไม่แก้ หรือปิดพร้อมแก้ข้อมูลแล้ว | `community.report_status` | NOT NULL, DEFAULT 'open' | — |
| `resolved_by` | ผู้ดูแลที่ปิดเรื่องนี้ | `uuid` | — | user_data.user_accounts |
| `resolved_at` | เวลาที่ปิดเรื่อง | `timestamp with time zone` | — | — |
| `resolution_note` | สรุปผลการตรวจสอบที่แจ้งกลับผู้ใช้ | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `forum_comments`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `comment_id` | รหัสความคิดเห็น | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `post_id` | กระทู้ที่ความคิดเห็นนี้อยู่ใต้ | `uuid` | FK, NOT NULL | community.forum_posts · ON DELETE CASCADE |
| `user_id` | ผู้เขียนความคิดเห็น | `uuid` | NOT NULL | user_data.user_accounts |
| `content` | เนื้อหาความคิดเห็น | `text` | NOT NULL | — |
| `status` | สถานะเนื้อหา เผยแพร่ รอตรวจ หรือถูกนำออก | `community.content_status` | NOT NULL, DEFAULT 'approved' | — |
| `deleted_by_author` | ผู้เขียนลบความคิดเห็นนี้เอง แยกจากสถานะถูกนำออกโดยผู้ดูแล เพราะข้อความที่แสดงแทนที่ต่างกัน (UC-05 ข้อ 8) | `boolean` | NOT NULL, DEFAULT false | — |
| `moderated_by` | ผู้ดูแลที่ตัดสินเนื้อหานี้ | `uuid` | — | user_data.user_accounts |
| `moderated_at` | เวลาที่ตัดสิน | `timestamp with time zone` | — | — |
| `like_count` | จำนวนการกดถูกใจ ทริกเกอร์นับให้อัตโนมัติ | `integer` | NOT NULL, DEFAULT 0, CHECK forum_comments_like_nonneg | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `forum_likes`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `target_type` | ประเภทเนื้อหาที่กดถูกใจ กระทู้หรือความคิดเห็น | `community.forum_target` | PK รวม (target_type, target_id, user_id), NOT NULL | — |
| `target_id` | รหัสเนื้อหาที่กดถูกใจ ชี้ไปได้ทั้งสองตารางจึงประกาศ Foreign Key ไม่ได้ | `uuid` | PK รวม (target_type, target_id, user_id), NOT NULL | forum_posts หรือ forum_comments (polymorphic) |
| `user_id` | ผู้ใช้ที่กดถูกใจเนื้อหานี้ | `uuid` | PK รวม (target_type, target_id, user_id), NOT NULL | user_data.user_accounts |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `forum_posts`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `post_id` | รหัสประจำกระทู้ | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | ผู้ตั้งกระทู้ | `uuid` | NOT NULL | user_data.user_accounts |
| `school_id` | โรงเรียนที่กระทู้นี้แท็กไว้ ไม่บังคับต้องมี | `uuid` | — | school_data.schools |
| `category` | หมวดหมู่กระทู้ รีวิว คำถาม อัปเดต หรือเคล็ดลับ | `community.forum_category` | NOT NULL | — |
| `title` | หัวข้อกระทู้ | `text` | NOT NULL | — |
| `content` | เนื้อหากระทู้ | `text` | NOT NULL | — |
| `status` | สถานะเนื้อหา ค่าเริ่มต้นคือเผยแพร่ทันที แล้วตรวจเมื่อถูกรายงาน | `community.content_status` | NOT NULL, DEFAULT 'approved' | — |
| `moderated_by` | ผู้ดูแลที่ตัดสินเนื้อหานี้ | `uuid` | — | user_data.user_accounts |
| `moderated_at` | เวลาที่ตัดสิน | `timestamp with time zone` | — | — |
| `rejection_reason` | เหตุผลที่นำเนื้อหาออก | `text` | — | — |
| `like_count` | จำนวนการกดถูกใจ ทริกเกอร์นับให้อัตโนมัติจากตาราง forum_likes | `integer` | NOT NULL, DEFAULT 0, CHECK forum_posts_counts_nonneg | — |
| `comment_count` | จำนวนความคิดเห็นที่เผยแพร่อยู่ ทริกเกอร์นับให้อัตโนมัติ | `integer` | NOT NULL, DEFAULT 0, CHECK forum_posts_counts_nonneg | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `forum_reports`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `report_id` | รหัสการรายงาน | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `target_type` | ประเภทเนื้อหาที่ถูกรายงาน | `community.forum_target` | UNIQUE รวม (target_type, target_id, reporter_user_id), NOT NULL | — |
| `target_id` | รหัสเนื้อหาที่ถูกรายงาน ชี้ได้สองตารางจึงประกาศ Foreign Key ไม่ได้ | `uuid` | UNIQUE รวม (target_type, target_id, reporter_user_id), NOT NULL | forum_posts หรือ forum_comments (polymorphic) |
| `reporter_user_id` | ผู้ใช้ที่กดรายงานเนื้อหานี้ | `uuid` | UNIQUE รวม (target_type, target_id, reporter_user_id), NOT NULL | user_data.user_accounts |
| `reason` | เหตุผลที่รายงาน | `text` | NOT NULL | — |
| `status` | สถานะ เปิดอยู่ ยกคำร้อง หรือดำเนินการแล้ว | `community.forum_report_status` | NOT NULL, DEFAULT 'open' | — |
| `reviewed_by` | ผู้ดูแลที่พิจารณา | `uuid` | — | user_data.user_accounts |
| `reviewed_at` | เวลาที่พิจารณา | `timestamp with time zone` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `report_submissions`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `report_id` | เรื่องที่แจ้งซึ่งผู้ใช้คนนี้ร่วมแจ้ง | `uuid` | PK รวม (report_id, user_id), FK, NOT NULL | community.data_correction_reports · ON DELETE CASCADE |
| `user_id` | ผู้ใช้ที่แจ้ง | `uuid` | PK รวม (report_id, user_id), NOT NULL | user_data.user_accounts |
| `note` | ข้อความเพิ่มเติมของผู้แจ้งรายนี้ | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

## schema `user_data` — User Service

### `children_profiles`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `profile_id` | รหัสโปรไฟล์บุตรหลาน | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | บัญชีผู้ปกครองที่เป็นเจ้าของโปรไฟล์นี้ | `uuid` | FK, NOT NULL | user_data.user_accounts · ON DELETE CASCADE |
| `nickname` | ชื่อเรียกที่ผู้ปกครองตั้งเอง ใช้แยกเมื่อมีบุตรหลายคน | `text` | — | — |
| `birth_year` | ปีเกิดของบุตรหลาน ใช้ประมาณระดับชั้นที่เหมาะสม เก็บเป็นปีไม่ใช่วันเกิดเต็มเพื่อลดข้อมูลส่วนบุคคลที่ถือไว้ตาม PDPA และจำกัดช่วงไว้ที่ 2000 ถึง 2035 กันการกรอกปีในอนาคต (UC-06 E2) | `integer` | CHECK children_profiles_birth_year_check | — |
| `target_level_code` | ระดับชั้นที่กำลังมองหาให้บุตรหลานคนนี้ | `text` | — | school_data.grade_levels |
| `budget_min_thb` | งบประมาณค่าเทอมต่ำสุดที่รับได้ | `numeric(12,2)` | CHECK children_budget_range, CHECK children_profiles_budget_min_thb_check | — |
| `budget_max_thb` | งบประมาณค่าเทอมสูงสุดที่รับได้ | `numeric(12,2)` | CHECK children_budget_range, CHECK children_profiles_budget_max_thb_check | — |
| `curriculum_preference` | หลักสูตรที่ผู้ปกครองสนใจ เลือกได้หลายรายการ | `text[]` | — | school_data.curriculums (สมาชิกในอาร์เรย์) |
| `preferred_area` | พื้นที่ที่สะดวกเดินทาง | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `comparison_sets`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `comparison_id` | รหัสชุดเปรียบเทียบ | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | เจ้าของชุดเปรียบเทียบ | `uuid` | FK, NOT NULL | user_data.user_accounts · ON DELETE CASCADE |
| `name` | ชื่อชุดที่ผู้ใช้ตั้งเอง | `text` | NOT NULL | — |
| `school_ids` | รายการโรงเรียนในชุดเปรียบเทียบนี้ เก็บเป็นอาร์เรย์เรียงตามที่ผู้ใช้เลือก | `uuid[]` | NOT NULL, CHECK comparison_sets_not_empty | school_data.schools (สมาชิกในอาร์เรย์) |
| `share_token` | รหัสสุ่มสำหรับลิงก์แชร์ชุดเปรียบเทียบ ว่างแปลว่ายังไม่เคยเปิดแชร์ (UC-10) | `text` | UNIQUE, CHECK comparison_share_needs_token | — |
| `share_enabled` | เปิดให้คนอื่นเปิดดูผ่านลิงก์อยู่หรือไม่ | `boolean` | NOT NULL, DEFAULT false, CHECK comparison_share_needs_token | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `favorites`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `user_id` | ผู้ใช้ที่บันทึกโรงเรียนนี้ไว้ | `uuid` | PK รวม (user_id, school_id), FK, NOT NULL | user_data.user_accounts · ON DELETE CASCADE |
| `school_id` | โรงเรียนที่ถูกบันทึกไว้ | `uuid` | PK รวม (user_id, school_id), NOT NULL | school_data.schools |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `user_accounts`

*2 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `user_id` | รหัสผู้ใช้ ใช้รหัสเดียวกับระบบยืนยันตัวตนของ Supabase | `uuid` | PK, FK | auth.users (Supabase Auth) |
| `display_name` | ชื่อที่แสดงต่อสาธารณะ ไม่ใช่ชื่อจริง | `text` | — | — |
| `role` | บทบาท ผู้ปกครองทั่วไปหรือผู้ดูแลระบบ | `text` | NOT NULL, DEFAULT 'parent', CHECK user_accounts_role_check | — |
| `status` | สถานะบัญชี ใช้งานปกติ ถูกระงับ หรืออยู่ระหว่างรอลบ | `user_data.account_status` | NOT NULL, DEFAULT 'active' | — |
| `suspended_reason` | เหตุผลที่ถูกระงับ | `text` | — | — |
| `deletion_requested_at` | เวลาที่ผู้ใช้กดขอลบบัญชี ใช้เป็นจุดเริ่มนับ Grace Period ก่อนลบจริง ว่างแปลว่าไม่ได้ขอลบ (UC-06 E5) | `timestamp with time zone` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

## schema `ai` — AI Service

### `conversations`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `conversation_id` | รหัสประจำบทสนทนา | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `user_id` | ผู้ใช้ที่เป็นเจ้าของบทสนทนานี้ | `uuid` | NOT NULL | user_data.user_accounts |
| `title` | หัวข้อบทสนทนาที่ระบบตั้งให้ | `text` | — | — |
| `summary` | บทสรุปของบทสนทนาช่วงต้น ใช้แทนข้อความเดิมเมื่อบทสนทนายาวเกิน context window ของโมเดล (UC-08 E2) | `text` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `updated_at` | เวลาที่แก้ไขล่าสุด (ทริกเกอร์ set_updated_at อัปเดตให้อัตโนมัติ) | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `messages`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `message_id` | รหัสประจำข้อความ | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `conversation_id` | บทสนทนาที่ข้อความนี้อยู่ | `uuid` | FK, NOT NULL | ai.conversations · ON DELETE CASCADE |
| `role` | ผู้พูด ผู้ใช้ ผู้ช่วย ระบบ หรือเครื่องมือ | `text` | NOT NULL, CHECK messages_role_check | — |
| `content` | เนื้อหาข้อความ | `text` | NOT NULL | — |
| `suggested_replies` | ชุดคำถามต่อยอดที่แนบท้ายคำตอบนี้ ให้ผู้ใช้กดเดินบทสนทนาต่อโดยไม่ต้องพิมพ์เอง (UC-08 ข้อ 6) | `text[]` | — | — |
| `tool_calls` | บันทึกว่าคำตอบนี้เรียกเครื่องมือใดด้วยพารามิเตอร์อะไร เช่น เรียก school-data-api ค้นโรงเรียนด้วยเงื่อนไขใด | `jsonb` | — | — |
| `grounded_school_ids` | รายการโรงเรียนที่คำตอบนี้อ้างอิงจริง ใช้ตรวจว่า AI แนะนำโรงเรียนที่ไม่มีอยู่จริงหรือไม่ (UC-08 E6) | `uuid[]` | — | — |
| `hallucination_flag` | ระบบตรวจพบว่าคำตอบอ้างถึงสิ่งที่ไม่มีอยู่จริงหรือไม่ | `boolean` | NOT NULL, DEFAULT false | — |
| `user_feedback` | ผู้ใช้กดถูกใจหรือไม่ถูกใจคำตอบนี้ | `text` | CHECK messages_user_feedback_check | — |
| `correlation_id` | รหัสสำหรับตามรอยคำขอเดียวกันข้าม Service เวลาไล่ปัญหา | `uuid` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |
| `entry_mode` | ข้อความนี้มาจากการกดปุ่มคำถามนำทาง กดคำถามต่อยอด หรือผู้ใช้พิมพ์เอง | `text` | CHECK messages_entry_mode_check | — |

---

### `school_embeddings`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `embedding_id` | รหัสเวกเตอร์ | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `school_id` | โรงเรียนที่เวกเตอร์นี้เป็นของ | `uuid` | NOT NULL | school_data.schools |
| `school_version_id` | เวอร์ชันข้อมูลที่ถูกแปลงเป็นเวกเตอร์ ใช้เป็นกุญแจตอนเขียนทับให้ไม่เกิดข้อมูลซ้ำ | `uuid` | UNIQUE รวม (school_version_id, chunk_index), NOT NULL | school_data.school_versions |
| `chunk_index` | ลำดับท่อนข้อความเมื่อเนื้อหายาวจนต้องแบ่ง | `integer` | UNIQUE รวม (school_version_id, chunk_index), NOT NULL, DEFAULT 0 | — |
| `content` | ข้อความที่ถูกแปลงเป็นเวกเตอร์ เก็บไว้ตรวจย้อนหลัง | `text` | NOT NULL | — |
| `embedding` | เวกเตอร์ของเนื้อหา ขนาดมิติปรับตามโมเดลที่ใช้ ปัจจุบันตั้งไว้ 768 ตาม Gemini text-embedding-004 | `vector(768)` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

## schema `ops` — Ops Service

### `audit_log`

*2 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `log_id` | ลำดับบันทึก เรียงตามเวลาโดยธรรมชาติ | `bigint` | PK | — |
| `actor_id` | ผู้กระทำ ไม่ผูก Foreign Key เพราะบันทึกต้องอยู่รอดแม้บัญชีถูกลบ | `uuid` | — | user_data.user_accounts (ไม่ผูก FK โดยตั้งใจ) |
| `actor_type` | ประเภทผู้กระทำ ผู้ดูแล ระบบอัตโนมัติ หรือผู้ใช้ทั่วไป | `ops.actor_type` | NOT NULL | — |
| `action` | ชื่อการกระทำ เช่น เผยแพร่ข้อมูลโรงเรียน หรือ นำเนื้อหาออก | `text` | NOT NULL | — |
| `entity_type` | ชนิดของสิ่งที่ถูกกระทำ เช่น โรงเรียน เวอร์ชัน หรือกระทู้ | `text` | NOT NULL | — |
| `entity_id` | รหัสของสิ่งที่ถูกกระทำ | `uuid` | — | — |
| `before_snapshot` | ข้อมูลก่อนเปลี่ยน | `jsonb` | — | — |
| `after_snapshot` | ข้อมูลหลังเปลี่ยน | `jsonb` | — | — |
| `correlation_id` | รหัสสำหรับตามรอยคำขอเดียวกันข้าม Service เวลาไล่ปัญหา | `uuid` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---

### `failed_jobs`

*0 แถวในฐานข้อมูลปัจจุบัน*

| Field Name | Description | Data Type | Key / Constraint | Reference Table |
|---|---|---|---|---|
| `job_id` | รหัสงานที่ล้มเหลว | `uuid` | PK, DEFAULT gen_random_uuid() | — |
| `job_type` | ประเภทงานที่ล้มเหลว เช่น สร้างเวกเตอร์ ส่งออก PDF เก็บข้อมูล หรือส่งอีเมล | `text` | NOT NULL | — |
| `payload` | รายละเอียดงานทั้งก้อน เก็บเป็น JSON จึงไม่ต้องอ้างตารางใด | `jsonb` | NOT NULL | — |
| `error_message` | ข้อความผิดพลาดครั้งล่าสุด | `text` | — | — |
| `attempt_count` | จำนวนครั้งที่พยายามทำใหม่ | `integer` | NOT NULL, DEFAULT 1 | — |
| `correlation_id` | รหัสสำหรับตามรอยคำขอเดียวกันข้าม Service เวลาไล่ปัญหา | `uuid` | — | — |
| `resolved_at` | เวลาที่แก้ไขเรียบร้อย ว่างแปลว่ายังค้างอยู่ | `timestamp with time zone` | — | — |
| `created_at` | เวลาที่สร้างแถวนี้ | `timestamp with time zone` | NOT NULL, DEFAULT now() | — |

---
