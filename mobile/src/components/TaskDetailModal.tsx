import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TaskItem, TaskStatus, TaskPriority } from "../lib/types";

interface TaskDetailModalProps {
  visible: boolean;
  task: TaskItem | null;
  onClose: () => void;
  users: Array<{ id: string | number; name?: string | null; email: string; avatarUrl?: string | null }>;
}

const statusColors: Record<TaskStatus, string> = {
  todo: "#6b7280",
  "in-progress": "#3b82f6",
  "in-review": "#8b5cf6",
  "on-hold": "#f59e0b",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "on-hold": "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const priorityColors: Record<TaskPriority, string> = {
  low: "#22c55e",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return "Not set";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TaskDetailModal({ visible, task, onClose, users }: TaskDetailModalProps) {
  if (!task) return null;

  const assignee = users.find((u) => String(u.id) === String(task.assignedTo));
  const sharedUsers = users.filter((u) => task.sharedWith?.includes(Number(u.id)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Task #{task.id}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Subject */}
            <View style={styles.section}>
              <Text style={styles.label}>Subject</Text>
              <Text style={styles.subjectText}>{task.title}</Text>
            </View>

            {/* Status & Priority Row */}
            <View style={styles.row}>
              <View style={styles.halfSection}>
                <Text style={styles.label}>Status</Text>
                <View style={[styles.badge, { backgroundColor: `${statusColors[task.status]}20` }]}>
                  <View style={[styles.dot, { backgroundColor: statusColors[task.status] }]} />
                  <Text style={[styles.badgeText, { color: statusColors[task.status] }]}>
                    {statusLabels[task.status]}
                  </Text>
                </View>
              </View>
              <View style={styles.halfSection}>
                <Text style={styles.label}>Priority</Text>
                <View style={[styles.badge, { backgroundColor: `${priorityColors[task.priority]}20` }]}>
                  <Text style={[styles.badgeText, { color: priorityColors[task.priority] }]}>
                    {priorityLabels[task.priority]}
                  </Text>
                </View>
              </View>
            </View>

            {/* Assignee */}
            <View style={styles.section}>
              <Text style={styles.label}>Assignee</Text>
              <View style={styles.userRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(assignee?.name?.[0] || assignee?.email[0] || "?").toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.userName}>{assignee?.name || assignee?.email || "Unassigned"}</Text>
                  {assignee?.name && <Text style={styles.userEmail}>{assignee.email}</Text>}
                </View>
              </View>
            </View>

            {/* Shared With */}
            {sharedUsers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>Shared With ({sharedUsers.length})</Text>
                <View style={styles.sharedList}>
                  {sharedUsers.slice(0, 3).map((u, i) => (
                    <View key={i} style={[styles.sharedAvatar, { marginLeft: i > 0 ? -8 : 0 }]}>
                      <Text style={styles.sharedAvatarText}>
                        {(u.name?.[0] || u.email[0]).toUpperCase()}
                      </Text>
                    </View>
                  ))}
                  {sharedUsers.length > 3 && (
                    <View style={[styles.sharedAvatar, { marginLeft: -8, backgroundColor: "#6b7280" }]}>
                      <Text style={styles.sharedAvatarText}>+{sharedUsers.length - 3}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Dates */}
            <View style={styles.row}>
              <View style={styles.halfSection}>
                <Text style={styles.label}>Start Date</Text>
                <Text style={styles.dateText}>{formatDate(task.startDate)}</Text>
              </View>
              <View style={styles.halfSection}>
                <Text style={styles.label}>Due Date</Text>
                <Text style={[styles.dateText, !task.dueDate && styles.notSet]}>
                  {formatDate(task.dueDate)}
                </Text>
              </View>
            </View>

            {/* Progress */}
            <View style={styles.section}>
              <Text style={styles.label}>Progress ({task.progress}%)</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${task.progress}%` }]} />
              </View>
            </View>

            {/* Department */}
            {task.department && (
              <View style={styles.section}>
                <Text style={styles.label}>Department</Text>
                <Text style={styles.deptText}>{task.department}</Text>
              </View>
            )}

            {/* Description */}
            {task.description && (
              <View style={styles.section}>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.descriptionText}>{task.description}</Text>
              </View>
            )}

            {/* Created */}
            <View style={styles.section}>
              <Text style={styles.label}>Created</Text>
              <Text style={styles.metaText}>
                {formatDate(task.createdAt)} by {task.createdBy?.name || task.createdBy?.email || "Unknown"}
              </Text>
            </View>
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: 16,
    width: "100%",
    maxHeight: "85%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "white",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    padding: 16,
    maxHeight: 400,
  },
  section: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    marginBottom: 16,
  },
  halfSection: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subjectText: {
    fontSize: 16,
    color: "white",
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  userName: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  userEmail: {
    color: "#9ca3af",
    fontSize: 12,
  },
  sharedList: {
    flexDirection: "row",
    alignItems: "center",
  },
  sharedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4b5563",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#1f2937",
  },
  sharedAvatarText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  dateText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  notSet: {
    color: "#6b7280",
    fontStyle: "italic",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#374151",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 3,
  },
  deptText: {
    color: "#d1d5db",
    fontSize: 14,
  },
  descriptionText: {
    color: "#d1d5db",
    fontSize: 14,
    lineHeight: 20,
  },
  metaText: {
    color: "#9ca3af",
    fontSize: 12,
  },
  closeButton: {
    margin: 16,
    padding: 12,
    backgroundColor: "#374151",
    borderRadius: 8,
    alignItems: "center",
  },
  closeButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
