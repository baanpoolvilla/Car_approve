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

export const requestStatusEnum = pgEnum("request_status", [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CHECKED_OUT",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "WAITING",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SKIPPED",
]);

export const inspectionPhaseEnum = pgEnum("inspection_phase", ["BEFORE", "AFTER"]);

export const inspectionResultEnum = pgEnum("inspection_result", [
  "NORMAL",
  "DAMAGED",
  "NOT_APPLICABLE",
]);

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

/* -------------------------------------------------------------- requests */

export const vehicleRequests = pgTable(
  "vehicle_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestNo: text("request_no").notNull(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    plannedStartAt: ts("planned_start_at").notNull(),
    plannedEndAt: ts("planned_end_at").notNull(),
    purpose: text("purpose").notNull(),
    destination: text("destination").notNull(),
    passengerCount: integer("passenger_count").notNull().default(1),
    passengers: text("passengers"),
    note: text("note"),
    status: requestStatusEnum("status").notNull().default("DRAFT"),
    submittedAt: ts("submitted_at"),
    decidedAt: ts("decided_at"),
    checkedOutAt: ts("checked_out_at"),
    returnedAt: ts("returned_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    hasNewDamage: boolean("has_new_damage").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicle_requests_no_uk").on(t.requestNo),
    index("vehicle_requests_requester_idx").on(t.requesterId, t.status),
    index("vehicle_requests_vehicle_idx").on(
      t.vehicleId,
      t.plannedStartAt,
      t.plannedEndAt
    ),
    index("vehicle_requests_status_idx").on(t.status, t.plannedStartAt),
  ]
);

export const requestCounters = pgTable("request_counters", {
  year: integer("year").primaryKey(),
  lastNo: integer("last_no").notNull().default(0),
});

/* -------------------------------------------------------------- approval */

export const approvalSteps = pgTable(
  "approval_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => vehicleRequests.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    approverId: uuid("approver_id")
      .notNull()
      .references(() => users.id),
    status: approvalStatusEnum("status").notNull().default("PENDING"),
    decisionComment: text("decision_comment"),
    actedAt: ts("acted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("approval_steps_uk").on(t.requestId, t.approverId),
    index("approval_steps_inbox_idx").on(t.approverId, t.status),
  ]
);

/* ------------------------------------------------------------ checklists */

export const checklistDefinitions = pgTable("checklist_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => vehicleRequests.id, { onDelete: "cascade" }),
    phase: inspectionPhaseEnum("phase").notNull(),
    odometer: integer("odometer").notNull(),
    fuelLevel: integer("fuel_level").notNull(),
    generalStatus: inspectionResultEnum("general_status").notNull().default("NORMAL"),
    damageNote: text("damage_note"),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    submittedAt: ts("submitted_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inspections_request_phase_uk").on(t.requestId, t.phase)]
);

export const inspectionChecklistItems = pgTable(
  "inspection_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "cascade" }),
    checklistItemId: uuid("checklist_item_id")
      .notNull()
      .references(() => checklistDefinitions.id),
    result: inspectionResultEnum("result").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("inspection_items_uk").on(t.inspectionId, t.checklistItemId)]
);

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

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    requestId: uuid("request_id").references(() => vehicleRequests.id, {
      onDelete: "cascade",
    }),
    inspectionId: uuid("inspection_id").references(() => inspections.id, {
      onDelete: "cascade",
    }),
    incidentId: uuid("incident_id"),
    phase: inspectionPhaseEnum("phase"),
    angle: photoAngleEnum("angle").notNull().default("OTHER"),
    caption: text("caption"),
    capturedAt: ts("captured_at"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("photos_request_idx").on(t.requestId),
    index("photos_inspection_idx").on(t.inspectionId),
    index("photos_incident_idx").on(t.incidentId),
  ]
);

/* ------------------------------------------------------------- incidents */

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => vehicleRequests.id, { onDelete: "cascade" }),
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
  (t) => [index("incidents_request_idx").on(t.requestId)]
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

export const termsAcceptances = pgTable("terms_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  termsVersionId: uuid("terms_version_id")
    .notNull()
    .references(() => termsVersions.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  requestId: uuid("request_id").references(() => vehicleRequests.id, {
    onDelete: "cascade",
  }),
  acceptedAt: ts("accepted_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
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
export type VehicleRequest = typeof vehicleRequests.$inferSelect;
export type RoleCode = (typeof roleEnum.enumValues)[number];
export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type PhotoAngle = (typeof photoAngleEnum.enumValues)[number];
