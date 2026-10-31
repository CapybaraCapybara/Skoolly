-- โรงเรียนที่ปิดแล้ว (แท็บ "โรงเรียนที่อาจปิดแล้ว" ในหน้าแอดมิน)
-- ปิดโรงเรียน = status 'archived' แบบเดิม ผู้ใช้ไม่เห็น แต่ข้อมูลยังอยู่และเปิดคืนได้
-- รันซ้ำได้ ไม่แตะข้อมูลเดิม

alter table school_data.schools
  -- ขั้นดึง OPEC บันทึกวันที่โรงเรียนหายจากรายชื่อ OPEC (null = OPEC ยังแสดงอยู่)
  add column if not exists opec_missing_since timestamptz,
  -- แอดมินตรวจแล้วว่ายังเปิดอยู่ ไม่ต้องถามซ้ำจนกว่าจะหายจาก OPEC อีกรอบ
  add column if not exists opec_missing_checked_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;
