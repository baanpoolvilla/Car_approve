-- ข้อมูลตั้งต้น: ผู้ใช้ 13 คน, รถ 2 คัน, checklist 10 ข้อ, เงื่อนไขการใช้รถ
-- รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ
-- (ทำงานเหมือน `npm run db:seed` ทุกประการ ใช้ทางใดทางหนึ่งก็พอ)

/* ---------------------------------------------------------------- ผู้ใช้ */

INSERT INTO users (email, name) VALUES
  ('chayanun@baanpoolvilla.com',   'Chayanun'),
  ('kanitha@baanpoolvilla.com',    'Kanitha'),
  ('kanthita@baanpoolvilla.com',   'Kanthita'),
  ('katawut@baanpoolvilla.com',    'Katawut'),
  ('kenika@baanpoolvilla.com',     'Kenika'),
  ('pacharapol@baanpoolvilla.com', 'Pacharapol'),
  ('somporn@baanpoolvilla.com',    'Somporn'),
  ('soravee@baanpoolvilla.com',    'Soravee'),
  ('sujita@baanpoolvilla.com',     'Sujita'),
  ('surin@baanpoolvilla.com',      'Surin'),
  ('thanonchai@baanpoolvilla.com', 'Thanonchai'),
  ('thunchanok@baanpoolvilla.com', 'Thunchanok'),
  ('waratta@baanpoolvilla.com',    'Waratta')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- ทุกคนเป็นพนักงาน
INSERT INTO user_roles (user_id, role)
SELECT id, 'EMPLOYEE'::role_code FROM users
ON CONFLICT (user_id, role) DO NOTHING;

-- ผู้อนุมัติ 4 คน
INSERT INTO user_roles (user_id, role)
SELECT id, 'APPROVER'::role_code FROM users
WHERE email IN (
  'kanitha@baanpoolvilla.com',
  'sujita@baanpoolvilla.com',
  'thanonchai@baanpoolvilla.com',
  'thunchanok@baanpoolvilla.com'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- ผู้ดูแลระบบ + ผู้ดูแลรถ
INSERT INTO user_roles (user_id, role)
SELECT id, r::role_code
FROM users, unnest(ARRAY['ADMIN', 'FLEET_MANAGER']) AS r
WHERE email = 'katawut@baanpoolvilla.com'
ON CONFLICT (user_id, role) DO NOTHING;

/* ------------------------------------------------------------------- รถ */

INSERT INTO vehicles (plate_number, brand, model, color, seats, note) VALUES
  ('DEEPAL-01', 'Deepal', 'S07', '-', 5, 'แก้ไขเลขทะเบียนจริงได้ที่หน้า Admin > ข้อมูลรถ'),
  ('MG-01',     'MG',     '-',   '-', 5, 'แก้ไขเลขทะเบียนจริงได้ที่หน้า Admin > ข้อมูลรถ')
ON CONFLICT (plate_number) DO NOTHING;

/* ------------------------------------------------------------ checklist */

INSERT INTO checklist_definitions (code, name, category, sort_order) VALUES
  ('EXTERIOR_BODY', 'ตัวถัง / สีรอบคัน',              'ภายนอก',  10),
  ('TIRES',         'ยางและลมยาง',                    'ภายนอก',  20),
  ('LIGHTS',        'ไฟหน้า–ไฟท้าย–ไฟเลี้ยว',          'ภายนอก',  30),
  ('MIRRORS_GLASS', 'กระจก / กระจกมองข้าง',            'ภายนอก',  40),
  ('WIPERS',        'ที่ปัดน้ำฝน',                     'ภายนอก',  50),
  ('INTERIOR_CLEAN','ความสะอาดภายใน',                  'ภายใน',   60),
  ('AIRCON',        'แอร์',                            'ภายใน',   70),
  ('DOCUMENTS',     'เอกสารประจำรถ (พ.ร.บ./ประกัน)',   'อุปกรณ์', 80),
  ('SPARE_TOOLS',   'ยางอะไหล่ / เครื่องมือ',           'อุปกรณ์', 90),
  ('FIRST_AID',     'อุปกรณ์ฉุกเฉิน',                  'อุปกรณ์', 100)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category;

/* --------------------------------------------------- เงื่อนไขการใช้รถ */

INSERT INTO terms_versions (version, content, is_active) VALUES (
  '1.0',
  '1. ผู้ขอใช้รถต้องมีใบอนุญาตขับขี่ที่ยังไม่หมดอายุ และเป็นผู้ขับขี่ด้วยตนเอง เว้นแต่ได้รับอนุญาตเป็นกรณีพิเศษ
2. ใช้รถเพื่อธุระของบริษัทตามวัตถุประสงค์ที่ระบุไว้ในคำขอเท่านั้น
3. ห้ามดื่มสุราหรือใช้สารเสพติดก่อนและระหว่างขับขี่ และต้องคาดเข็มขัดนิรภัยทุกที่นั่ง
4. ต้องตรวจสภาพรถและถ่ายรูปให้ครบทุกมุมทั้งก่อนนำรถออกและหลังคืนรถ
5. ค่าปรับจราจร ค่าทางด่วน และค่าใช้จ่ายที่เกิดจากความประมาทของผู้ใช้ ผู้ใช้เป็นผู้รับผิดชอบ
6. หากเกิดอุบัติเหตุ ต้องแจ้งบริษัทและบริษัทประกันทันที และบันทึกเหตุการณ์ในระบบพร้อมรูปถ่าย
7. คืนรถตามเวลาที่ได้รับอนุมัติ พร้อมระดับน้ำมันไม่น้อยกว่าตอนรับรถ
8. การฝ่าฝืนเงื่อนไขอาจถูกระงับสิทธิ์การใช้รถและพิจารณาตามระเบียบบริษัท',
  true
) ON CONFLICT (version) DO NOTHING;

/* -------------------------------------------------------------- ตั้งค่า */

INSERT INTO settings (key, value) VALUES
  ('required_photo_angles', '["FRONT","REAR","LEFT","RIGHT","INTERIOR","ODOMETER"]'::jsonb),
  ('reminder_minutes_before', '60'::jsonb)
ON CONFLICT (key) DO NOTHING;
