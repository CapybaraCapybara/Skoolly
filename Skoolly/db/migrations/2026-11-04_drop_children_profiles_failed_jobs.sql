-- 2026-11-04 ลบตารางที่ไม่ใช้แล้ว (ทั้งสองตารางว่าง)
-- user_data.children_profiles : ผู้จัดทำตัดสินไม่ทำโปรไฟล์บุตรหลาน (UC-06 เหลือบัญชีและรายการโปรด)
-- ops.failed_jobs             : ไม่มีโค้ดใช้ งานที่ล้มเหลวบันทึกใน school_data.school_scrape_log แทน
-- สำรองก่อนรันที่ D:\pleum\skoolly-db-backups\2026-11-04_1412
-- drop table ลบ index, policy, trigger และ grant ของตารางไปด้วย
begin;
drop table if exists user_data.children_profiles;
drop table if exists ops.failed_jobs;
commit;
