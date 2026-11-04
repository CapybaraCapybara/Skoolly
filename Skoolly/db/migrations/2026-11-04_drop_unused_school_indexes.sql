-- เอา index ที่ไม่เคยถูกใช้ออก (4 พ.ย. 2569) รันซ้ำได้
-- pg_stat_user_indexes นับการใช้ได้ 0 ครั้งตั้งแต่ 25 ส.ค. 2569
-- หน้าค้นหากรองระดับชั้นและจังหวัดในเบราว์เซอร์ ไม่ได้กรองในฐาน และมีแค่ราว 300 แถว
-- ถ้าย้ายการกรองไปทำในฐานภายหลัง ค่อยสร้างใหม่ตามที่ต้องใช้จริง

drop index if exists school_data.schools_visible_idx;
drop index if exists school_data.schools_levels_offered_idx;
