import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users, vehicleRequests, vehicles } from "@/db/schema";
import type { RequestStatus } from "@/db/schema";

export const requestListSelect = {
  id: vehicleRequests.id,
  requestNo: vehicleRequests.requestNo,
  status: vehicleRequests.status,
  plannedStartAt: vehicleRequests.plannedStartAt,
  plannedEndAt: vehicleRequests.plannedEndAt,
  purpose: vehicleRequests.purpose,
  destination: vehicleRequests.destination,
  passengerCount: vehicleRequests.passengerCount,
  hasNewDamage: vehicleRequests.hasNewDamage,
  createdAt: vehicleRequests.createdAt,
  requesterId: vehicleRequests.requesterId,
  requesterName: users.name,
  requesterEmail: users.email,
  vehicleId: vehicles.id,
  vehicleBrand: vehicles.brand,
  vehicleModel: vehicles.model,
  vehiclePlate: vehicles.plateNumber,
};

export type ListFilter = {
  requesterId?: string;
  vehicleId?: string;
  statuses?: RequestStatus[];
  from?: Date;
  to?: Date;
  limit?: number;
  order?: "asc" | "desc";
};

export async function listRequests(filter: ListFilter = {}) {
  const conditions: (SQL | undefined)[] = [];
  if (filter.requesterId) conditions.push(eq(vehicleRequests.requesterId, filter.requesterId));
  if (filter.vehicleId) conditions.push(eq(vehicleRequests.vehicleId, filter.vehicleId));
  if (filter.statuses?.length) conditions.push(inArray(vehicleRequests.status, filter.statuses));
  if (filter.from) conditions.push(gte(vehicleRequests.plannedEndAt, filter.from));
  if (filter.to) conditions.push(lte(vehicleRequests.plannedStartAt, filter.to));

  const q = db
    .select(requestListSelect)
    .from(vehicleRequests)
    .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
    .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      filter.order === "asc"
        ? asc(vehicleRequests.plannedStartAt)
        : desc(vehicleRequests.plannedStartAt)
    )
    .limit(filter.limit ?? 100);

  return q;
}

export const ACTIVE_STATUSES: RequestStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "CHECKED_OUT",
  "RETURNED",
];

export type RequestListRow = Awaited<ReturnType<typeof listRequests>>[number];
