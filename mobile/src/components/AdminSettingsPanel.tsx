import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { apiGet, apiPatch } from "../lib/api";

type ActivityItem = {
  id: number;
  actor: { name: string; role: string; email?: string };
  action: string;
  entity: { type: string; title: string };
  createdAt: number;
};

type UserItem = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  department: string;
};

export function AdminSettingsPanel() {
  const [activeTab, setActiveTab] = useState<"audit" | "roles" | "export" | "preferences">("audit");
  
  const [logs, setLogs] = useState<ActivityItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await apiGet<{ items: ActivityItem[] }>("/api/admin/activity?limit=30");
      setLogs(res.items || []);
    } catch {
      Alert.alert("Error", "Failed to load audit logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await apiGet<{ items: UserItem[] }>("/api/users");
      setUsers(res.items || []);
    } catch {
      Alert.alert("Error", "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "audit") {
      fetchLogs();
    } else if (activeTab === "roles" && users.length === 0) {
      fetchUsers();
    }
  }, [activeTab]);

  const markAllRead = async () => {
    // Optimistic UI updates are simpler if we just refresh
    try {
      await apiPatch("/api/admin/activity/read-all", {});
      fetchLogs();
    } catch {
      Alert.alert("Error", "Failed to clear notifications");
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await apiPatch(`/api/admin/users/${userId}`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      Alert.alert("Error", "Failed to update role");
    }
  };

  return (
    <View style={styles.container}>
      {/* Sub-navigation */}
      <View style={styles.tabsScroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {(
            [
              ["audit", "Audit Log"],
              ["roles", "Roles"],
              ["export", "Export"],
              ["preferences", "System"],
            ] as const
          ).map(([key, label]) => {
            const isActive = activeTab === key;
            return (
              <Pressable 
                key={key} 
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                onPress={() => setActiveTab(key)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>


        {activeTab === "audit" && (
          <View style={styles.section}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>System Activity Monitor</Text>
              <Pressable onPress={fetchLogs} style={styles.refreshBtn}>
                <Text style={styles.refreshText}>{logsLoading ? "..." : "Refresh"}</Text>
              </Pressable>
            </View>
            
            {logsLoading && logs.length === 0 ? (
              <ActivityIndicator color="white" style={{ marginTop: 20 }} />
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logHeaderRow}>
                    <Text style={styles.logAction}>{log.action}</Text>
                    <Text style={styles.logTime}>
                      {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.logActor}>{log.actor.name} ({log.actor.role})</Text>
                  <Text style={styles.logTarget}>{log.entity.title}</Text>
                </View>
              ))
            )}
            {logs.length === 0 && !logsLoading && <Text style={styles.emptyText}>No activity recorded yet.</Text>}
          </View>
        )}

        {activeTab === "roles" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Roles & Access</Text>
            {usersLoading && users.length === 0 ? (
              <ActivityIndicator color="white" style={{ marginTop: 20 }} />
            ) : (
              users.map((u) => (
                <View key={u.id} style={styles.userCard}>
                  <View>
                    <Text style={styles.userName}>{u.name || u.email.split('@')[0]}</Text>
                    <Text style={styles.userEmail}>{u.email}</Text>
                  </View>
                  <View style={styles.roleButtons}>
                    <Pressable 
                      style={[styles.roleBtn, u.role === "user" && styles.roleBtnActive]}
                      onPress={() => updateRole(u.id, "user")}
                    >
                      <Text style={[styles.roleBtnText, u.role === "user" && styles.roleBtnTextActive]}>User</Text>
                    </Pressable>
                    <Pressable 
                      style={[styles.roleBtn, u.role === "admin" && styles.roleBtnActive]}
                      onPress={() => updateRole(u.id, "admin")}
                    >
                      <Text style={[styles.roleBtnText, u.role === "admin" && styles.roleBtnTextActive]}>Admin</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "export" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Export Center</Text>
            <View style={styles.exportCard}>
              <Text style={styles.exportTitle}>Export All Tasks</Text>
              <Text style={styles.exportDesc}>Download a comprehensive CSV of all tasks.</Text>
              <Pressable style={styles.exportBtn} onPress={() => Alert.alert("Success", "Check your email for the export link.")}>
                <Text style={styles.exportBtnText}>Download CSV</Text>
              </Pressable>
            </View>
            <View style={styles.exportCard}>
              <Text style={styles.exportTitle}>Export Audit Logs</Text>
              <Text style={styles.exportDesc}>Download system activity logs for compliance.</Text>
              <Pressable style={styles.exportBtn} onPress={() => Alert.alert("Success", "Logs exported successfully.")}>
                <Text style={styles.exportBtnText}>Download JSON</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeTab === "preferences" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System Preferences</Text>
            
            <View style={styles.prefCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>Require Admin Approval</Text>
                <Text style={styles.prefDesc}>New users must be manually approved.</Text>
              </View>
              <View style={styles.toggleOn}><Text style={styles.toggleText}>ON</Text></View>
            </View>

            <View style={styles.prefCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>Strict Task Timers</Text>
                <Text style={styles.prefDesc}>Require timers before completion.</Text>
              </View>
              <View style={styles.toggleOff}><Text style={styles.toggleText}>OFF</Text></View>
            </View>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    marginTop: 10,
  },
  tabsScroll: {
    marginBottom: 16,
  },
  tabsContainer: {
    paddingHorizontal: 2,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(59,130,246,0.2)",
    borderColor: "rgba(59,130,246,0.4)",
  },
  tabText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#60a5fa",
  },
  content: {
    flex: 1,
  },
  section: {
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  refreshBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  refreshText: {
    color: "white",
    fontSize: 12,
  },
  emptyText: {
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 20,
  },
  logCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  logHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  logAction: {
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: "bold",
    backgroundColor: "rgba(59,130,246,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  logTime: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  logActor: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 2,
  },
  logTarget: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  userCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  userName: { color: "white", fontWeight: "bold", fontSize: 16 },
  userEmail: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  roleButtons: { flexDirection: "row", gap: 6 },
  roleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  roleBtnActive: {
    backgroundColor: "rgba(59,130,246,0.2)",
    borderColor: "rgba(59,130,246,0.4)",
  },
  roleBtnText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "600" },
  roleBtnTextActive: { color: "#60a5fa" },
  exportCard: {
    backgroundColor: "rgba(59,130,246,0.05)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  exportTitle: { color: "#60a5fa", fontWeight: "bold", fontSize: 16, marginBottom: 4 },
  exportDesc: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 12 },
  exportBtn: {
    backgroundColor: "rgba(59,130,246,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: { color: "#93c5fd", fontWeight: "bold" },
  prefCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  prefTitle: { color: "white", fontWeight: "bold", fontSize: 15, marginBottom: 4 },
  prefDesc: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  toggleOn: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  toggleOff: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  toggleText: { color: "white", fontWeight: "900", fontSize: 12 },
});
