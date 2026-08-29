import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- enums */

/**
 * APPROVER is kept as the stored value for historical reasons — there is no
 * approval step any more, so the UI calls this role "ผู้รับแจ้งเตือน":
 * people who get told whenever a car leaves or comes back.
 */
export const roleEnum = pgEnum("role_code", [
  "EMPLOYEE",
  "APPROVER",
  "FLEET_MANAGER",
  "ADMIN",
  "AUDITOR",
]);

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "AVAILABLE",
  "IN_USE",
  "MAINTENANCE",
  "INACTIVE",
]);

export const tripStatusEnum = pgEnum("trip_status", ["IN_USE", "COMPLETED", "CANCELLED"]);

/** BEFORE = ตอนเอารถออก, AFTER = ตอนคืนรถ */
export const photoPhaseEnum = pgEnum("inspection_phase", ["BEFORE", "AFTER"]);

export const photoAngleEnum = pgEnum("photo_angle", [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "INTERIOR",
  "ODOMETER",
  "DAMAGE",
  "OTHER",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "MINOR",
  "MODERATE",
  "MAJOR",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "OPEN",
  "IN_REVIEW",
  "CLOSED",
]);

/* ------------------------------------------------------------ custom type */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* --------------------------------------------------------------- helpers */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ----------------------------------------------------------------- users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    department: text("department"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    pinHash: text("pin_hash"),
    pinSetAt: ts("pin_set_at"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uk").on(t.email)]
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_roles_uk").on(t.userId, t.role)]
);

/* -------------------------------------------------------------- sessions */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uk").on(t.tokenHash)]
);

/* -------------------------------------------------------------- vehicles */

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plateNumber: text("plate_number").notNull(),
    brand: text("brand").notNull(),
    model: text("model"),
    year: integer("year"),
    color: text("color"),
    seats: integer("seats"),
    currentOdometer: integer("current_odometer").notNull().default(0),
    status: vehicleStatusEnum("status").notNull().default("AVAILABLE"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vehicles_plate_uk").on(t.plateNumber)]
);

export const vehicleUnavailability = pgTable(
  "vehicle_unavailability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("vehicle_unavail_idx").on(t.vehicleId, t.startAt, t.endAt)]
);

/* ----------------------------------------------------------------- trips */

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripNo: text("trip_no").notNull(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),

    purpose: text("purpose").notNull(),
    destination: text("destination").notNull(),
    passengerCount: integer("passenger_count").notNull().default(1),
    passengers: text("passengers"),
    note: text("note"),
    expectedReturnAt: ts("expected_return_at"),

    status: tripStatusEnum("status").notNull().default("IN_USE"),

    checkedOutAt: ts("checked_out_at").notNull().defaultNow(),
    odometerOut: integer("odometer_out").notNull(),
    fuelOut: integer("fuel_out").notNull(),

    returnedAt: ts("returned_at"),
    odometerIn: integer("odometer_in"),
    fuelIn: integer("fuel_in"),

    hasDamage: boolean("has_damage").notNull().default(false),
    damageNote: text("damage_note"),

    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),

    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trips_no_uk").on(t.tripNo),
    index("trips_driver_idx").on(t.driverId, t.checkedOutAt),
    index("trips_vehicle_idx").on(t.vehicleId, t.checkedOutAt),
    index("trips_status_idx").on(t.status, t.checkedOutAt),
  ]
);

export const tripCounters = pgTable("trip_counters", {
  year: integer("year").primaryKey(),
  lastNo: integer("last_no").notNull().default(0),
});

/* ----------------------------------------------------------------- files */

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  storage: text("storage").notNull().default("db"),
  objectKey: text("object_key"),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  checksum: text("checksum"),
  data: bytea("data"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------- incidents */

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    severity: incidentSeverityEnum("severity").notNull().default("MINOR"),
    occurredAt: ts("occurred_at").notNull(),
    location: text("location"),
    description: text("description").notNull(),
    thirdParty: text("third_party"),
    policeReportNo: text("police_report_no"),
    insuranceClaimNo: text("insurance_claim_no"),
    status: incidentStatusEnum("status").notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("incidents_trip_idx").on(t.tripId)]
);

/* ---------------------------------------------------------------- photos */

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").references(() => incidents.id, {
      onDelete: "cascade",
    }),
    phase: photoPhaseEnum("phase"),
    angle: photoAngleEnum("angle").notNull().default("OTHER"),
    caption: text("caption"),
    capturedAt: ts("captured_at"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("photos_trip_idx").on(t.tripId), index("photos_incident_idx").on(t.incidentId)]
);

/* ----------------------------------------------------------------- terms */

export const termsVersions = pgTable("terms_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  content: text("content").notNull(),
  effectiveAt: ts("effective_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

/* --------------------------------------------------------- notifications */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]
);

/* ------------------------------------------------------------ audit logs */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid("actor_id").references(() => users.id),
    actorEmail: text("actor_email"),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ]
);

/* -------------------------------------------------------------- settings */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type RoleCode = (typeof roleEnum.enumValues)[number];
export type TripStatus = (typeof tripStatusEnum.enumValues)[number];
export type PhotoAngle = (typeof photoAngleEnum.enumValues)[number];
