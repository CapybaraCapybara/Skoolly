-- ประวัติการแก้ไขข้อมูลโรงเรียน (ปุ่ม "ดูประวัติการแก้ไข" ในหน้ารายละเอียดโรงเรียนของแอดมิน)
-- ทุกครั้งที่แถวใน school_data.schools เปลี่ยน ไม่ว่าจากขั้นดึง สช. หาเว็บ ปักหมุด ISAT การอนุมัติร่าง
-- หรือแอดมินแก้เอง ฐานข้อมูลบันทึกช่องที่เปลี่ยน ค่าเดิม และค่าใหม่ลง ops.audit_log (entity_type 'school')
-- ช่องที่เปลี่ยนทุกครั้งโดยไม่มีความหมาย (updated_at, row_version, data_sources) ไม่บันทึก
-- actor_type เป็น 'system' เสมอ: trigger แยกไม่ได้ว่าแอดมินหรือ pipeline เป็นคนแก้ ดูจากช่องที่เปลี่ยนแทน
-- รันซ้ำได้ ไม่แตะข้อมูลเดิม

create or replace function school_data.log_school_change() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  skip constant text[] := array['updated_at', 'row_version', 'data_sources', 'created_at'];
  o jsonb;
  n jsonb := to_jsonb(new) || jsonb_build_object('geom', case when new.geom is null then null
               else round(st_y(new.geom::geometry)::numeric, 6) || ',' || round(st_x(new.geom::geometry)::numeric, 6) end);
  before_v jsonb := '{}'::jsonb;
  after_v jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    insert into ops.audit_log (actor_type, action, entity_type, entity_id, after_snapshot)
    values ('system', 'school.create', 'school', new.school_id,
            jsonb_build_object('opec_school_code', new.opec_school_code, 'name_th', new.name_th));
    return null;
  end if;

  -- พิกัดเก็บเป็น "lat,lng" แทนค่า PostGIS ที่อ่านไม่ออก
  o := to_jsonb(old) || jsonb_build_object('geom', case when old.geom is null then null
         else round(st_y(old.geom::geometry)::numeric, 6) || ',' || round(st_x(old.geom::geometry)::numeric, 6) end);
  for k in select key from jsonb_each(n) loop
    if k <> all (skip) and (o -> k) is distinct from (n -> k) then
      before_v := before_v || jsonb_build_object(k, o -> k);
      after_v := after_v || jsonb_build_object(k, n -> k);
    end if;
  end loop;
  if after_v <> '{}'::jsonb then
    insert into ops.audit_log (actor_type, action, entity_type, entity_id, before_snapshot, after_snapshot)
    values ('system', 'school.update', 'school', new.school_id, before_v, after_v);
  end if;
  return null;
end $$;

drop trigger if exists log_school_change on school_data.schools;
create trigger log_school_change after insert or update on school_data.schools
  for each row execute function school_data.log_school_change();
