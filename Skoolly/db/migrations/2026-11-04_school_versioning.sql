-- ลิงก์เว็บ หมุด และหลักสูตรเป็นเวอร์ชัน (UC-11)
-- เดิมค่าทั้งสามเขียนทับในตาราง schools ตรง ๆ ตอนนี้ทุกครั้งที่ค่าเปลี่ยนจริง ไม่ว่าแอดมินแก้ ขั้นนำเข้า สช.
-- ขั้นหาพิกัด ขั้นหาเว็บ หรือแก้จาก SQL Editor ฐานข้อมูลสร้างฉบับใหม่ใน school_versions ให้เองและเผยแพร่ทันที
-- ฉบับใหม่คัดลอกข้อมูลจากเว็บ (snapshot และตารางลูก version_fees, version_extra_fees, version_safety)
-- ของฉบับที่เผยแพร่อยู่มาด้วย ค่าเทอมจึงไม่หายจากหน้าเว็บเมื่อแก้แค่หมุด
-- ตาราง schools ยังเป็นที่ที่หน้าเว็บอ่าน (read model) ฉบับเก็บประวัติและใช้ย้อนกลับ
-- รันซ้ำได้ ไม่แตะข้อมูลเดิม

-- ขั้นหาพิกัด/หาเว็บของ pipeline (ขั้นนำเข้า สช. ใช้ opec_import, ซิงค์ทะเบียนเว็บใช้ bulk_import)
alter type school_data.source_type add value if not exists 'pipeline';

-- ค่าที่เป็นเวอร์ชันของโรงเรียนหนึ่งแถว เก็บเป็น data_snapshot->'school'
create or replace function school_data.school_fields(s school_data.schools) returns jsonb
language sql stable
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'official_website_url', s.official_website_url,
    'website_source', s.website_source,
    'website_confirmed_at', s.website_confirmed_at,
    'latitude', st_y(s.geom::geometry),
    'longitude', st_x(s.geom::geometry),
    'gps_precision', s.gps_precision,
    'gps_source', s.gps_source,
    'curriculums', to_jsonb(s.curriculums),
    'curriculums_confirmed_at', s.curriculums_confirmed_at,
    'curriculums_confirmed_by', s.curriculums_confirmed_by)
$$;

-- ฉบับใหม่ที่เผยแพร่ทันที: ข้อมูลจากเว็บและตารางลูกมาจาก p_base, ค่าลิงก์/หมุด/หลักสูตรคือ p_school
-- ฉบับที่เผยแพร่อยู่เดิมเป็น superseded ไม่แตะตาราง schools (ผู้เรียกชี้ current_published_version_id เอง)
create or replace function school_data.new_school_version(
  p_school_id uuid, p_base uuid, p_source text, p_school jsonb, p_diff jsonb) returns uuid
language plpgsql
as $$
declare
  base school_data.school_versions;
  has_web boolean;
  snap jsonb := '{}'::jsonb;
  vid uuid;
begin
  select * into base from school_data.school_versions where version_id = p_base;
  -- ข้อมูลจากเว็บอยู่ชั้นบนสุดของ snapshot ฉบับ scraper และฉบับที่สร้างจากที่นี่ (มี web_origin)
  has_web := coalesce(base.source_type = 'scraper' or base.data_snapshot ? 'web_origin', false);
  if has_web then
    snap := (base.data_snapshot - 'school' - 'web_origin') || jsonb_build_object('web_origin',
      coalesce(base.data_snapshot -> 'web_origin', jsonb_build_object(
        'version_id', base.version_id, 'version_number', base.version_number,
        'collected_at', base.submitted_at, 'approved_at', base.reviewed_at)));
  end if;

  update school_data.school_versions set status = 'superseded'
  where school_id = p_school_id and status = 'published';

  insert into school_data.school_versions
    (school_id, version_number, status, source_type, data_snapshot, diff_summary, scraped_page_url, reviewed_at)
  values (p_school_id,
          (select coalesce(max(version_number), 0) + 1 from school_data.school_versions where school_id = p_school_id),
          'published', p_source::school_data.source_type, snap || jsonb_build_object('school', p_school), p_diff,
          case when has_web then base.scraped_page_url end, now())
  returning version_id into vid;

  insert into school_data.version_fees
    (version_id, grade_label, level_code, annual_thb, semester_thb, currency,
     academic_year, source_published_at, source_url, confidence_score, notes)
  select vid, grade_label, level_code, annual_thb, semester_thb, currency,
         academic_year, source_published_at, source_url, confidence_score, notes
  from school_data.version_fees where version_id = p_base;

  insert into school_data.version_extra_fees
    (version_id, name, amount_thb, frequency, refundable, sibling_related, academic_year, source_published_at, notes)
  select vid, name, amount_thb, frequency, refundable, sibling_related, academic_year, source_published_at, notes
  from school_data.version_extra_fees where version_id = p_base;

  insert into school_data.version_safety
    (version_id, security_guards, cctv_monitoring, nurse_medical_clinic, child_safeguarding_policy,
     air_quality_pm25_protocol, visitor_access_control, highlights, policy_summary, policy_url, source_published_at)
  select vid, security_guards, cctv_monitoring, nurse_medical_clinic, child_safeguarding_policy,
         air_quality_pm25_protocol, visitor_access_control, highlights, policy_summary, policy_url, source_published_at
  from school_data.version_safety where version_id = p_base;

  return vid;
end $$;

-- ลิงก์/หมุด/หลักสูตรเปลี่ยนโดยผู้เขียนไม่ได้ชี้ฉบับใหม่เอง: สร้างฉบับให้
-- ผู้เขียนบอกที่มาได้ด้วย set_config('skoolly.version_source', 'admin', true) และ
-- set_config('skoolly.version_note', '{"action": ...}', true) ไม่บอกถือเป็น 'pipeline'
create or replace function school_data.version_school_change() returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  o jsonb := school_data.school_fields(old);
  n jsonb := school_data.school_fields(new);
  fields jsonb := '{}'::jsonb;
  k text;
begin
  -- ผู้เขียนเผยแพร่ฉบับเองแล้ว (อนุมัติร่าง, ย้อนเวอร์ชัน) หรือค่าที่เป็นเวอร์ชันไม่ได้เปลี่ยน
  if new.current_published_version_id is distinct from old.current_published_version_id or o = n then
    return new;
  end if;
  for k in select jsonb_object_keys(n) loop
    if (o -> k) is distinct from (n -> k) then
      fields := fields || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
    end if;
  end loop;
  new.current_published_version_id := school_data.new_school_version(
    new.school_id, old.current_published_version_id,
    coalesce(nullif(current_setting('skoolly.version_source', true), ''), 'pipeline'),
    n,
    coalesce(nullif(current_setting('skoolly.version_note', true), '')::jsonb, '{}'::jsonb)
      || jsonb_build_object('fields', fields));
  return new;
end $$;

drop trigger if exists version_school_change on school_data.schools;
create trigger version_school_change before update on school_data.schools
  for each row execute function school_data.version_school_change();
