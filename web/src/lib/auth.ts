"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { signOut } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserRole } from "@/lib/types";

export type AppUser = {
  user: User;
  role: UserRole;
};

export async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      role: "user" satisfies UserRole,
      department: "other",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function getUserRole(uid: string): Promise<UserRole> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return "user";
  const data = snap.data() as { role?: UserRole };
  if (data.role === "admin") return "admin";
  if (data.role === "manager") return "manager";
  return "user";
}

async function assertUserDocExistsOrSignOut(user: User): Promise<boolean> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return true;
  await signOut(auth);
  return false;
}

export function subscribeAuth(callback: (appUser: AppUser | null) => void): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    // Emit immediately so UI can proceed after first sign-in.
    callback({ user, role: "user" });
    const ok = await assertUserDocExistsOrSignOut(user);
    if (!ok) {
      callback(null);
      return;
    }
    const role = await getUserRole(user.uid);
    callback({ user, role });
  });
}
