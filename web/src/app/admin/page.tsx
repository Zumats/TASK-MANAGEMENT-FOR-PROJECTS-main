"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/Card";
import { ApiHttpError, apiGet, apiPost } from "@/lib/api";

export default function AdminBootstrapPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const check = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiGet<{ allowed: boolean }>("/api/admin/bootstrap/status");
      setAllowed(res.allowed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to check status";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-14">
      <Card className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-white">Admin Setup</h1>
        <p className="mt-1 text-sm text-white/70">Create the first admin account (one-time).</p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void check()}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 hover:bg-white/10 disabled:opacity-60"
          >
            Check if allowed
          </button>
          {allowed === true ? (
            <div className="self-center text-xs text-emerald-200">Allowed</div>
          ) : allowed === false ? (
            <div className="self-center text-xs text-amber-200">Already configured</div>
          ) : null}
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            try {
              await apiPost("/api/admin/bootstrap", { email, password });
              await apiPost("/api/auth/login", { email, password });
              router.replace("/app");
            } catch (err) {
              if (err instanceof ApiHttpError) {
                if (err.status === 409) setError("Admin already exists. Login with an admin account.");
                else setError(err.message || "Setup failed");
              } else {
                setError(err instanceof Error ? err.message : "Setup failed");
              }
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <label className="text-sm font-medium text-white/80">Admin Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/35"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/80">Password</label>
            <input
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/35"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={6}
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            type="submit"
          >
            {loading ? "Setting up..." : "Create admin"}
          </button>
        </form>

        <p className="mt-4 text-sm text-white/70">
          Already have admin?{" "}
          <Link className="text-white underline decoration-white/40 hover:decoration-white" href="/login">
            Login
          </Link>
        </p>
      </Card>
    </div>
  );
}
