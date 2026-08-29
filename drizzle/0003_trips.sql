-- เปลี่ยนจากระบบขออนุมัติใช้รถ เป็นระบบบันทึกการเอารถออก–คืนรถ
-- ไม่มีการจองล่วงหน้า ไม่มีขั้นตอนอนุมัติ ไม่มี checklist
-- (ตารางเดิมยังไม่มีข้อมูลจริง จึงลบทิ้งได้แทนการแปลงข้อมูล)

/* ------------------------------------------------- ลบของเดิมที่ไม่ใช้แล้ว */

DROP TABLE IF EXISTS terms_acceptances CASCADE;
DROP TABLE IF EXISTS inspection_checklist_items CASCADE;
DROP TABLE IF EXISTS inspections CASCADE;
DROP TABLE IF EXISTS checklist_definitions CASCADE;
DROP TABLE IF EXISTS approval_steps CASCADE;

-- photos / incidents ผูกกับตารางคำขอเดิม ต้องเคลียร์ก่อนย้าย
DELETE FROM photos;
DELETE FROM incidents;
DELETE FROM files;

ALTER TABLE photos DROP COLUMN IF EXISTS request_id;
ALTER TABLE photos DROP COLUMN IF EXISTS inspection_id;
ALTER TABLE incidents DROP COLUMN IF EXISTS request_id;

DROP TABLE IF EXISTS vehicle_requests CASCADE;
DROP TABLE IF EXISTS request_counters;

DROP TYPE IF EXISTS request_status;
DROP TYPE IF EXISTS approval_status;
DROP TYPE IF EXISTS inspection_result;

/* ------------------------------------------------------------ ตารางทริป */

DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM ('IN_USE','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_no text NOT NULL,
  driver_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),

  purpose text NOT NULL,
  destination text NOT NULL,
  passenger_count integer NOT NULL DEFAULT 1,
  passengers text,
  note text,
  expected_return_at timestamptz,

  status trip_status NOT NULL DEFAULT 'IN_USE',

  checked_out_at timestamptz NOT NULL DEFAULT now(),
  odometer_out integer NOT NULL,
  fuel_out integer NOT NULL,

  returned_at timestamptz,
  odometer_in integer,
  fuel_in integer,

  has_damage boolean NOT NULL DEFAULT false,
  damage_note text,

  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trips_fuel_out_ck  CHECK (fuel_out BETWEEN 0 AND 100),
  CONSTRAINT trips_fuel_in_ck   CHECK (fuel_in IS NULL OR fuel_in BETWEEN 0 AND 100),
  CONSTRAINT trips_odometer_ck  CHECK (odometer_in IS NULL OR odometer_in >= odometer_out),
  CONSTRAINT trips_returned_ck  CHECK (returned_at IS NULL OR returned_at >= checked_out_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS trips_no_uk ON trips (trip_no);
CREATE INDEX IF NOT EXISTS trips_driver_idx  ON trips (driver_id, checked_out_at DESC);
CREATE INDEX IF NOT EXISTS trips_vehicle_idx ON trips (vehicle_id, checked_out_at DESC);
CREATE INDEX IF NOT EXISTS trips_status_idx  ON trips (status, checked_out_at DESC);

-- รถหนึ่งคันถูกเอาออกไปใช้พร้อมกันได้แค่ครั้งเดียว
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_open_per_vehicle
  ON trips (vehicle_id) WHERE status = 'IN_USE';

-- คนหนึ่งคนถือรถได้ทีละคัน
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_open_per_driver
  ON trips (driver_id) WHERE status = 'IN_USE';

CREATE TABLE IF NOT EXISTS trip_counters (
  year integer PRIMARY KEY,
  last_no integer NOT NULL DEFAULT 0
);

/* --------------------------------------------- ผูก photos / incidents ใหม่ */

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES trips(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS photos_trip_idx ON photos (trip_id);

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS incidents_trip_idx ON incidents (trip_id);

/* ------------------------------------------------------------- ตั้งค่าเดิม */

-- มุมรูปบังคับยังใช้ค่าเดิม (6 มุม) ทั้งตอนเอารถออกและตอนคืน
INSERT INTO settings (key, value) VALUES
  ('required_photo_angles', '["FRONT","REAR","LEFT","RIGHT","INTERIOR","ODOMETER"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
