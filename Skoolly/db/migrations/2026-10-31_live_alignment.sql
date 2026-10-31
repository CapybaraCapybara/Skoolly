-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-10-31: ปรับฐานจริงให้ตรงกับ db/schema.sql
-- ที่มา: ตรวจฐานจริงแบบ read-only 31 ต.ค. 2569 ดู db/DATABASE_DESIGN.md หัวข้อ 8
-- รันครั้งเดียวใน Supabase SQL Editor (รันซ้ำได้ ไม่เสียหาย) ทั้งไฟล์อยู่ใน transaction เดียว
-- ถ้าคำสั่งใดล้ม จะไม่มีอะไรเปลี่ยนเลย
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1. ผู้ใช้แก้ได้แค่ display_name ของตัวเอง
--    เดิม authenticated แก้ได้ทุกคอลัมน์ และ policy own_account เช็กแค่ว่าเป็นแถวของตัวเอง
--    สมาชิกที่สมัครเองจึงตั้ง role = 'admin' ผ่าน Data API ได้ (schema user_data ถูก expose อยู่)
revoke insert, update, delete on user_data.user_accounts from authenticated;
grant select, update (display_name) on user_data.user_accounts to authenticated;

-- 2. คอลัมน์ที่ schema.sql ประกาศเป็น not null แต่ฐานจริงยังเป็น nullable
--    (ตรวจแล้วไม่มีแถวที่เป็น null ถ้าคำสั่งนี้ล้ม แปลว่ามีแถวใหม่ที่เป็น null ต้องเติมค่าก่อน)
alter table school_data.schools
  alter column is_isat_member set not null,
  alter column is_boarding    set not null,
  alter column accreditations set not null;

-- 3. ฟังก์ชันที่ไม่มีโค้ดเรียก และยังคิดค่าเทอมด้วยสูตรเก่า (semester_thb * 2)
--    การอนุมัติจริงใช้ approve_school_version() ใน microservices/opec/supabase_sync.py
drop function if exists school_data.publish_version(uuid, uuid);

commit;

-- ตรวจผลหลังรัน (ทุกบรรทัดควรได้ตามที่เขียนไว้)
-- select privilege_type from information_schema.role_table_grants
--  where table_schema = 'user_data' and table_name = 'user_accounts' and grantee = 'authenticated';
--   → เหลือแค่ SELECT
-- select column_name from information_schema.column_privileges
--  where table_schema = 'user_data' and table_name = 'user_accounts'
--    and grantee = 'authenticated' and privilege_type = 'UPDATE';
--   → display_name
-- select to_regprocedure('school_data.publish_version(uuid, uuid)');
--   → null
