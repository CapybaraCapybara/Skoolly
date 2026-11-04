-- ลบคอลัมน์รีวิวจากแหล่งภายนอกใน schools (4 พ.ย. 2569) รันซ้ำได้
-- ตัดสินแล้วว่าไม่ใช้รีวิว Google รีวิวในระบบคือกระทู้หมวด Review ที่แท็กโรงเรียน (community.forum_posts)
-- ทั้งสามคอลัมน์ว่างทุกแถวตอนลบ ไม่มี view ใดอ้างถึง
-- schools_counts_nonneg คุมจำนวนนักเรียนและครูด้วย จึงสร้างใหม่โดยตัดเฉพาะ review_count

begin;
alter table school_data.schools
  drop constraint if exists schools_rating_range,
  drop constraint if exists schools_counts_nonneg,
  drop column if exists google_place_id,
  drop column if exists rating_avg,
  drop column if exists review_count,
  add  constraint schools_counts_nonneg
       check ((student_count is null or student_count >= 0)
              and (teacher_count is null or teacher_count >= 0));
commit;
