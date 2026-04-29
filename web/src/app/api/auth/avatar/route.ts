import { NextResponse, type NextRequest } from "next/server";
import { initDb, getDb } from "@/server/db";
import { getTokenFromRequest, verifyToken } from "@/server/auth";
import { writeFile } from "fs/promises";
import { mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  initDb();
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const jwtUser = verifyToken(token);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(file.name) || ".jpg";
    const filename = `avatar_${jwtUser.id}_${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    // Write file
    await writeFile(filepath, buffer);

    // Generate URL
    const avatarUrl = `/uploads/avatars/${filename}`;

    // Update user record
    const db = getDb();
    const now = Date.now();
    db.prepare("update users set avatar_url = ?, updated_at = ? where id = ?").run(avatarUrl, now, jwtUser.id);

    return NextResponse.json({ avatarUrl }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
