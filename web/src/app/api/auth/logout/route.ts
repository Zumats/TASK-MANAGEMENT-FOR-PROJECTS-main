import { NextResponse, type NextRequest } from "next/server";
import { cookieName } from "@/server/auth";
import { requireUser } from "@/server/http";
import { logActivity, ACTIONS } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (user) {
    logActivity({
      actor_id: user.id,
      actor_name: user.email.split("@")[0],
      actor_role: user.role,
      action: ACTIONS.LOGOUT,
      entity_type: "user",
      entity_id: user.id,
      entity_title: user.email,
      route_path: "/logout",
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName(), "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
