-- ลบตาราง cache รีวิว Google (4 พ.ย. 2569) รันซ้ำได้
-- ตารางว่างมาตลอด ไม่มีโค้ดอ่านหรือเขียน การแสดงรีวิวภายนอกยังอยู่ในแผนระยะถัดไป ค่อยออกแบบที่เก็บใหม่ตอนทำจริง
-- คอลัมน์ schools.google_place_id / rating_avg / review_count ยังเก็บไว้
-- drop table ลบ index, constraint และ trigger google_reviews_sync ไปด้วย ฟังก์ชันของ trigger ต้องลบแยก

begin;
drop table if exists school_data.school_google_reviews;
drop function if exists school_data.sync_school_rating();
commit;
