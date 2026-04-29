"use client";

import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queueLength, setQueueLength] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleQueueUpdate = (e: CustomEvent<{ count: number }>) => {
      setQueueLength(e.detail.count);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("queue-updated" as any, handleQueueUpdate);

    // Check initial queue length
    import("@/lib/offline-queue").then((q) => {
      setQueueLength(q.getQueueLength());
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("queue-updated" as any, handleQueueUpdate);
    };
  }, []);

  return { isOnline, queueLength, hasPendingActions: queueLength > 0 };
}
