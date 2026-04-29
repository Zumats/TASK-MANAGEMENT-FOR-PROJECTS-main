import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { apiGet } from "../lib/api";

interface TimerReport {
  id: number;
  taskId?: string;
  task_id?: string;
  userId?: number;
  user_id?: number;
  elapsedSeconds?: number;
  elapsed_seconds?: number;
  stopNote?: string | null;
  stop_note?: string | null;
  createdAt?: number;
  created_at?: number;
  userEmail?: string;
  user_email?: string;
  userName?: string | null;
  user_name?: string | null;
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

interface TaskInlineReportsProps {
  taskId: string;
}

export function TaskInlineReports({ taskId }: TaskInlineReportsProps) {
  const [reports, setReports] = useState<TimerReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchReports = async () => {
      try {
        setLoading(true);
        const data = await apiGet<{ items: TimerReport[] } | any>(`/api/tasks/${taskId}/reports`);
        let items: TimerReport[] = [];
        if (data && typeof data === "object") {
          if (Array.isArray(data.items)) {
            items = data.items;
          } else if (Array.isArray(data)) {
            items = data;
          }
        }
        // Sort by created date descending and take last 2
        items.sort((a, b) => {
          const dateA = a.createdAt || a.created_at || 0;
          const dateB = b.createdAt || b.created_at || 0;
          return dateB - dateA;
        });
        if (!cancelled) {
          setReports(items.slice(0, 2));
        }
      } catch (err) {
        console.error("[TaskInlineReports] Error fetching reports:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchReports();
    return () => { cancelled = true; };
  }, [taskId]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 12, alignItems: "center" }}>
        <ActivityIndicator size="small" color="#60a5fa" />
      </View>
    );
  }

  if (reports.length === 0) {
    return (
      <View style={{ paddingVertical: 8 }}>
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
          No timer reports yet. Start and stop the timer to create reports.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      {reports.map((r, idx) => (
        <View
          key={String(r.id) || idx}
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: "rgba(59,130,246,0.2)",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 14 }}>⏱</Text>
              <View>
                <Text style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "700", color: "white" }}>
                  {formatHms(r.elapsedSeconds || r.elapsed_seconds || 0)}
                </Text>
                <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                  {r.userName || r.user_name || r.userEmail || r.user_email || "You"}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              {(r.createdAt || r.created_at)
                ? new Date(r.createdAt || r.created_at || 0).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "-"}
            </Text>
          </View>
          {(r.stopNote || r.stop_note) && (
            <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}>
              <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>Stop note:</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }} numberOfLines={2}>
                {r.stopNote || r.stop_note}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
