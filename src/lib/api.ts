import "server-only";
import { NextResponse } from "next/server";
import { AuthError, LoginError } from "./auth";
import { RuleError } from "./trips";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof AuthError) return fail(err.message, err.status);
  if (err instanceof RuleError) return fail(err.message, 400);
  if (err instanceof LoginError) return fail(err.message, 400);
  if (err instanceof Error) {
    console.error("[api]", err);
    return fail(err.message || "เกิดข้อผิดพลาดในระบบ", 500);
  }
  console.error("[api] unknown", err);
  return fail("เกิดข้อผิดพลาดในระบบ", 500);
}

/** Wraps a route handler so business-rule and auth errors become clean JSON. */
export function route<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>
) {
  return async (req: Request, ...args: Args) => {
    try {
      return await handler(req, ...args);
    } catch (err) {
      return handleError(err);
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new RuleError("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
}
