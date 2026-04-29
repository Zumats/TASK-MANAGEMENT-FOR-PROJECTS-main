import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { getQueueLength, processQueue, isOnline } from "../lib/offline-queue";
import { getToken, apiBaseUrl } from "../lib/api";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [queueLength, setQueueLength] = useState(0);

  useEffect(() => {
    // Initial check
    getQueueLength().then(setQueueLength);
    isOnline().then(setIsConnected);

    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected === true && state.isInternetReachable !== false);
    });

    // Poll queue length every 5 seconds
    const interval = setInterval(() => {
      getQueueLength().then(setQueueLength);
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return { isConnected, queueLength, hasPendingActions: queueLength > 0 };
}

export function SyncIndicator() {
  const { isConnected, queueLength, hasPendingActions } = useNetworkStatus();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    // Process queue when coming back online
    if (isConnected && hasPendingActions) {
      processQueue(async (path: string, init: RequestInit) => {
        // Simple request function for queue processing
        const baseUrl = apiBaseUrl();
        const token = await getToken();
        const headers: Record<string, string> = {
          ...(typeof init.headers === "object" && init.headers ? (init.headers as Record<string, string>) : {}),
        };
        if (token) headers.authorization = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }).then((result: { success: number; failed: number; remaining: number }) => {
        if (result.success > 0) {
          setToastMessage(`Synced ${result.success} action${result.success === 1 ? "" : "s"}`);
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
        }
      });
    }
  }, [isConnected, hasPendingActions]);

  // Don't show anything if online and no pending actions
  if (isConnected && !hasPendingActions) {
    return null;
  }

  return (
    <>
      {/* Status Bar */}
      <View style={[styles.statusBar, !isConnected ? styles.offlineBar : styles.syncingBar]}>
        <Text style={styles.statusText}>
          {!isConnected ? "You're offline" : `Syncing ${queueLength} pending action${queueLength === 1 ? "" : "s"}...`}
        </Text>
      </View>

      {/* Success Toast */}
      {showToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  statusBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1000,
  },
  offlineBar: {
    backgroundColor: "rgba(239,68,68,0.9)",
  },
  syncingBar: {
    backgroundColor: "rgba(245,158,11,0.9)",
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  toast: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "rgba(16,185,129,0.9)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    zIndex: 1000,
  },
  toastText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
});
