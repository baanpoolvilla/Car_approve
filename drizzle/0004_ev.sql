-- รถของบริษัทเป็นรถไฟฟ้า จึงบันทึก "ระดับแบตเตอรี่" ไม่ใช่ระดับน้ำมัน
-- เก็บเป็นชนิดพลังงานรายคัน เผื่อมีรถน้ำมันเพิ่มในอนาคต

DO $$ BEGIN
  CREATE TYPE power_type AS ENUM ('EV','FUEL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS power_type power_type NOT NULL DEFAULT 'EV';

-- fuel_* เก็บเป็นเปอร์เซ็นต์อยู่แล้ว ใช้ได้ทั้งแบตและน้ำมัน แค่ชื่อเดิมสื่อผิด
DO $$ BEGIN
  ALTER TABLE trips RENAME COLUMN fuel_out TO energy_out;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trips RENAME COLUMN fuel_in TO energy_in;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trips RENAME CONSTRAINT trips_fuel_out_ck TO trips_energy_out_ck;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE trips RENAME CONSTRAINT trips_fuel_in_ck TO trips_energy_in_ck;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

UPDATE vehicles SET power_type = 'EV' WHERE plate_number IN ('DEEPAL-01', 'MG-01');
