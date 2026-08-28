-- Car Approve :: initial schema
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE role_code AS ENUM ('EMPLOYEE','APPROVER','FLEET_MANAGER','ADMIN','AUDITOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('AVAILABLE','IN_USE','MAINTENANCE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','CHECKED_OUT','RETURNED','COMPLETED','CANCELLED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('WAITING','PENDING','APPROVED','REJECTED','SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inspection_phase AS ENUM ('BEFORE','AFTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inspection_result AS ENUM ('NORMAL','DAMAGED','NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_angle AS ENUM ('FRONT','REAR','LEFT','RIGHT','INTERIOR','ODOMETER','DAMAGE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM ('MINOR','MODERATE','MAJOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('OPEN','IN_REVIEW','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  department text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uk ON users (email);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role_code NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_uk ON user_roles (user_id, role);

CREATE TABLE IF NOT EXISTS login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_uk ON sessions (token_hash);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text NOT NULL,
  brand text NOT NULL,
  model text,
  year integer,
  color text,
  seats integer,
  current_odometer integer NOT NULL DEFAULT 0,
  status vehicle_status NOT NULL DEFAULT 'AVAILABLE',
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_uk ON vehicles (plate_number);

CREATE TABLE IF NOT EXISTS vehicle_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_unavailability_time_ck CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS vehicle_unavail_idx ON vehicle_unavailability (vehicle_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS vehicle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no text NOT NULL,
  requester_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid REFERENCES vehicles(id),
  planned_start_at timestamptz NOT NULL,
  planned_end_at timestamptz NOT NULL,
  purpose text NOT NULL,
  destination text NOT NULL,
  passenger_count integer NOT NULL DEFAULT 1,
  passengers text,
  note text,
  status request_status NOT NULL DEFAULT 'DRAFT',
  submitted_at timestamptz,
  decided_at timestamptz,
  checked_out_at timestamptz,
  returned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  has_new_damage boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_requests_time_ck CHECK (planned_end_at > planned_start_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_requests_no_uk ON vehicle_requests (request_no);
CREATE INDEX IF NOT EXISTS vehicle_requests_requester_idx ON vehicle_requests (requester_id, status);
CREATE INDEX IF NOT EXISTS vehicle_requests_vehicle_idx ON vehicle_requests (vehicle_id, planned_start_at, planned_end_at);
CREATE INDEX IF NOT EXISTS vehicle_requests_status_idx ON vehicle_requests (status, planned_start_at);

-- Hard guarantee: an approved / in-use vehicle can never be double booked.
DO $$ BEGIN
  ALTER TABLE vehicle_requests ADD CONSTRAINT vehicle_requests_no_overlap
    EXCLUDE USING gist (
      vehicle_id WITH =,
      tstzrange(planned_start_at, planned_end_at, '[)') WITH &&
    ) WHERE (status IN ('APPROVED','CHECKED_OUT','RETURNED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS request_counters (
  year integer PRIMARY KEY,
  last_no integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES vehicle_requests(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  approver_id uuid NOT NULL REFERENCES users(id),
  status approval_status NOT NULL DEFAULT 'PENDING',
  decision_comment text,
  acted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_steps_uk ON approval_steps (request_id, approver_id);
CREATE INDEX IF NOT EXISTS approval_steps_inbox_idx ON approval_steps (approver_id, status);

CREATE TABLE IF NOT EXISTS checklist_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_definitions_code_uk ON checklist_definitions (code);

CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES vehicle_requests(id) ON DELETE CASCADE,
  phase inspection_phase NOT NULL,
  odometer integer NOT NULL,
  fuel_level integer NOT NULL,
  general_status inspection_result NOT NULL DEFAULT 'NORMAL',
  damage_note text,
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inspections_request_phase_uk ON inspections (request_id, phase);

CREATE TABLE IF NOT EXISTS inspection_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES checklist_definitions(id),
  result inspection_result NOT NULL,
  note text
);
CREATE UNIQUE INDEX IF NOT EXISTS inspection_items_uk ON inspection_checklist_items (inspection_id, checklist_item_id);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage text NOT NULL DEFAULT 'db',
  object_key text,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  checksum text,
  data bytea,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES vehicle_requests(id) ON DELETE CASCADE,
  severity incident_severity NOT NULL DEFAULT 'MINOR',
  occurred_at timestamptz NOT NULL,
  location text,
  description text NOT NULL,
  third_party text,
  police_report_no text,
  insurance_claim_no text,
  status incident_status NOT NULL DEFAULT 'OPEN',
  resolution_note text,
  reported_by uuid NOT NULL REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_request_idx ON incidents (request_id);

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES files(id),
  request_id uuid REFERENCES vehicle_requests(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES inspections(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES incidents(id) ON DELETE CASCADE,
  phase inspection_phase,
  angle photo_angle NOT NULL DEFAULT 'OTHER',
  caption text,
  captured_at timestamptz,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_request_idx ON photos (request_id);
CREATE INDEX IF NOT EXISTS photos_inspection_idx ON photos (inspection_id);
CREATE INDEX IF NOT EXISTS photos_incident_idx ON photos (incident_id);

CREATE TABLE IF NOT EXISTS terms_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  content text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS terms_versions_uk ON terms_versions (version);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terms_version_id uuid NOT NULL REFERENCES terms_versions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  request_id uuid REFERENCES vehicle_requests(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  actor_email text,
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events (created_at);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log is append-only from the application's point of view.
CREATE OR REPLACE FUNCTION audit_events_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
