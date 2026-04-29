"use client";

import { useEffect } from "react";

export function StartOfflineSync() {
  useEffect(() => {
    // Dynamically import and start the offline sync
    import("@/lib/offline-queue").then((queue) => {
      // Start auto-sync with 5 second interval
      const cleanup = queue.startAutoSync(5000);
      
      // Cleanup on unmount
      return cleanup;
    });
  }, []);

  return null;
}
