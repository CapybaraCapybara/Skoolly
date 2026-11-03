-- เอาช่องที่ไม่เคยมีค่าและไม่มีโค้ดใช้ออก (3 พ.ย. 2569) รันซ้ำได้
-- school_versions.parent_version_id: ฉบับข้อมูลเรียงด้วย version_number อยู่แล้ว การย้อนฉบับใช้ schools.current_published_version_id
-- official_website_registry.notes: ไม่มีหน้าไหนให้กรอกหรือแสดง
-- index versions_parent_idx และ FK ของ parent_version_id หายไปพร้อมคอลัมน์

alter table school_data.school_versions
  drop column if exists parent_version_id;

alter table school_data.official_website_registry
  drop column if exists notes;
