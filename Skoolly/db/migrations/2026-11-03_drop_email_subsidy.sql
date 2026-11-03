-- เอาช่องที่ไม่มีประโยชน์ออก (3 พ.ย. 2569):
-- official_email ว่างทุกแถว เพราะ สช. ไม่ให้อีเมลโรงเรียนมาเลย
-- government_support เป็น "ไม่รับเงินอุดหนุน" ทุกแห่ง โรงเรียนนานาชาติไม่รับเงินอุดหนุนอยู่แล้ว รันซ้ำได้

alter table school_data.schools
  drop column if exists official_email,
  drop column if exists government_support;
