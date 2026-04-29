"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

export type AppUser = {
  id: number;
  email: string;
  role: "admin" | "manager" | "user";
  department: string;
  name?: string | null;
  age?: number | null;
  bio?: string | null;
  avatarUrl?: string | null;
  position?: string | null;
};

type AuthContextValue = {
  appUser: AppUser | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  appUser: null,
  loading: true,
  refreshSession: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const res = await apiGet<{ user: AppUser | null }>("/api/auth/me");
    setAppUser(res.user);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSession();
        if (cancelled) return;
      } catch {
        if (cancelled) return;
        setAppUser(null);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Presence heartbeat - update last_seen_at every 20 seconds when logged in and tab is visible
  useEffect(() => {
    if (!appUser) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const updatePresence = async () => {
      try {
        await apiPost("/api/auth/presence", {});
      } catch {
        // ignore errors
      }
    };

    const startHeartbeat = () => {
      // Update immediately
      updatePresence();
      // Then update every 20 seconds (shorter than 2-minute threshold)
      if (interval) clearInterval(interval);
      interval = setInterval(updatePresence, 20000);
    };

    const stopHeartbeat = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    // Handle visibility change - pause when tab hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopHeartbeat();
      } else {
        startHeartbeat();
      }
    };

    // Start heartbeat if tab is visible
    if (!document.hidden) {
      startHeartbeat();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopHeartbeat();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appUser]);

  const value = useMemo(() => ({ appUser, loading, refreshSession }), [appUser, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
