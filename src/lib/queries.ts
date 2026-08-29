import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { trips, users, vehicles } from "@/db/schema";
import type { TripStatus } from "@/db/schema";

export const tripListSelect = {
  id: trips.id,
  tripNo: trips.tripNo,
  status: trips.status,
  purpose: trips.purpose,
  destination: trips.destination,
  passengerCount: trips.passengerCount,
  checkedOutAt: trips.checkedOutAt,
  returnedAt: trips.returnedAt,
  expectedReturnAt: trips.expectedReturnAt,
  odometerOut: trips.odometerOut,
  odometerIn: trips.odometerIn,
  fuelOut: trips.fuelOut,
  fuelIn: trips.fuelIn,
  hasDamage: trips.hasDamage,
  driverId: trips.driverId,
  driverName: users.name,
  driverEmail: users.email,
  vehicleId: vehicles.id,
  vehicleBrand: vehicles.brand,
  vehicleModel: vehicles.model,
  vehiclePlate: vehicles.plateNumber,
};

export type TripFilter = {
  driverId?: string;
  vehicleId?: string;
  statuses?: TripStatus[];
  from?: Date;
  to?: Date;
  limit?: number;
  order?: "asc" | "desc";
};

export async function listTrips(filter: TripFilter = {}) {
  const conditions: (SQL | undefined)[] = [];
  if (filter.driverId) conditions.push(eq(trips.driverId, filter.driverId));
  if (filter.vehicleId) conditions.push(eq(trips.vehicleId, filter.vehicleId));
  if (filter.statuses?.length) conditions.push(inArray(trips.status, filter.statuses));
  if (filter.from) conditions.push(gte(trips.checkedOutAt, filter.from));
  if (filter.to) conditions.push(lte(trips.checkedOutAt, filter.to));

  return db
    .select(tripListSelect)
    .from(trips)
    .innerJoin(users, eq(users.id, trips.driverId))
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(filter.order === "asc" ? asc(trips.checkedOutAt) : desc(trips.checkedOutAt))
    .limit(filter.limit ?? 100);
}

export type TripListRow = Awaited<ReturnType<typeof listTrips>>[number];
