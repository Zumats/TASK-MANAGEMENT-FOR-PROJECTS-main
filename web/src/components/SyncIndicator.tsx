"use client";

import { useEffect, useState } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function SyncIndicator() {
  const { isOnline, queueLength, hasPendingActions } = useNetworkStatus();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSyncComplete = (e: CustomEvent<{ success: number; failed: number }>) => {
      if (e.detail.success > 0) {
        setToastMessage(`Synced ${e.detail.success} action${e.detail.success === 1 ? "" : "s"}`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    };

    window.addEventListener("sync-complete" as any, handleSyncComplete);
    return () => {
      window.removeEventListener("sync-complete" as any, handleSyncComplete);
    };
  }, []);

  // Don't render anything during SSR to prevent hydration mismatch
  if (!mounted) return null;

  // Don't show anything if online and no pending actions
  if (isOnline && !hasPendingActions) {
    return null;
  }

  return (
    <>
      {/* Status Bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium transition-all ${
          isOnline
            ? "bg-amber-500/90 text-white"
            : "bg-red-500/90 text-white"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {!isOnline && (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m0 0l2.829-2.829m-6.364 6.364a9 9 0 010-12.728m0 0l2.829 2.829M3 3l3 3" />
              </svg>
              <span>You're offline</span>
            </>
          )}
          {isOnline && hasPendingActions && (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Syncing {queueLength} pending action{queueLength === 1 ? "" : "s"}...</span>
            </>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {showToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Spacer for fixed header */}
      {!isOnline && <div className="h-10" />}
      {isOnline && hasPendingActions && <div className="h-10" />}
    </>
  );
}
