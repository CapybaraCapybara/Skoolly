-- ปิดการเขียนกระทู้/ความคิดเห็นผ่าน Data API จนกว่าจะเปิดให้โพสต์จริง
-- เดิม authenticated insert/update ได้ทั้งแถวรวม status ผู้ใช้จึงตั้งกระทู้ตัวเองเป็น 'approved' ข้ามแอดมินได้
-- ตอนเปิดให้โพสต์: grant insert/update ทีละคอลัมน์โดยไม่รวม status (แบบ user_data.user_accounts)
begin;
revoke insert, update on community.forum_posts, community.forum_comments from authenticated;
commit;
