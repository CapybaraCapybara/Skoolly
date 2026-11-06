-- ประวัติการแก้ไขข้อมูลโรงเรียนบอกที่มาของการแก้ (6 พ.ย. 2569)
-- ผู้เขียนบอกที่มาด้วย set_config('skoolly.version_source'/'skoolly.version_note', ..., true) ตัวเดียวกับที่เวอร์ชันใช้
-- (tag_versions() ใน supabase_sync.py) แถวใน ops.audit_log จึงมี action 'school.<action>' เช่น school.gps_step
-- และ actor_type 'admin' เมื่อแอดมินแก้ ไม่บอกถือเป็น 'school.update' และ 'system' เหมือนเดิม
-- แทนที่แค่ฟังก์ชัน trigger เดิม รันซ้ำได้ ไม่แตะข้อมูลเดิม

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
    values (case when current_setting('skoolly.version_source', true) = 'admin' then 'admin' else 'system' end::ops.actor_type,
            'school.' || coalesce(nullif(current_setting('skoolly.version_note', true), '')::jsonb ->> 'action', 'update'),
            'school', new.school_id, before_v, after_v);
  end if;
  return null;
end $$;
