import { NextResponse } from "next/server";
import { initDb, getDb } from "@/server/db";

export async function GET() {
  initDb();
  const db = getDb();
  const row = db.prepare("select count(1) as c from users where role = 'admin'").get() as { c: number };
  return NextResponse.json({ allowed: Number(row?.c ?? 0) === 0 });
}
