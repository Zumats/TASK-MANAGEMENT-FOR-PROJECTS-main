import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/api";
import { DarkSelectModal } from "../components/DarkSelectModal";

type AnnouncementType = "ANNOUNCEMENT" | "EVENT" | "URGENT";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  is_pinned: boolean;
  is_read: boolean;
  created_at: number;
  userId: string;
  userEmail?: string;
  userName?: string;
}

interface BulletinBoardScreenProps {
  isAdmin?: boolean;
}

export function BulletinBoardScreen({ isAdmin = false }: BulletinBoardScreenProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [showFilterModal, setShowFilterModal] = useState(false);

  const fetchAnnouncements = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const qs = filterType !== "ALL" ? `?type=${filterType}` : "";
      const res = await apiGet<{ items: Announcement[] }>(`/api/bulletin${qs}`);
      setAnnouncements(res.items || []);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to load bulletin board");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [filterType]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAnnouncements(true);
  }, [filterType]);

  const handleMarkRead = async (id: string) => {
    // Local optimistic update (mobile endpoints may be incomplete).
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    // Best-effort server update; ignore failures to avoid noisy logs / parse errors.
    try {
      await apiPost(`/api/bulletin/${id}/read`);
    } catch {
      // no-op
    }
  };

  const handlePin = async (item: Announcement) => {
    try {
      await apiPatch(`/api/bulletin/${item.id}/pin`, { isPinned: !item.is_pinned });
      fetchAnnouncements(true);
    } catch (e) {
      Alert.alert("Error", "Failed to toggle pin");
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete Post", "Are you sure you want to delete this announcement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/api/bulletin/${id}`);
            fetchAnnouncements(true);
          } catch (e) {
            Alert.alert("Error", "Failed to delete");
          }
        },
      },
    ]);
  };

  const pinnedItems = announcements.filter((a) => a.is_pinned);
  const feedItems = announcements.filter((a) => !a.is_pinned);

  const getStatusColor = (type: AnnouncementType) => {
    switch (type) {
      case "URGENT": return "#ef4444";
      case "EVENT": return "#f59e0b";
      default: return "#3b82f6";
    }
  };

  const renderCard = (item: Announcement) => (
    <View key={item.id} style={styles.card}>
      <View style={[styles.typeIndicator, { backgroundColor: getStatusColor(item.type) }]} />
      <Pressable 
        style={styles.cardContent}
        onPress={() => {
          if (!item.is_read) handleMarkRead(item.id);
          Alert.alert(item.title, item.content);
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.dateText}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.cardText} numberOfLines={3}>{item.content}</Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.tagPill}>
            <Text style={[styles.tagText, { color: getStatusColor(item.type) }]}>{item.type}</Text>
          </View>
          {isAdmin && (
            <View style={styles.adminActions}>
              <Pressable onPress={() => handlePin(item)} style={styles.actionBtn}>
                <Text style={styles.actionEmoji}>{item.is_pinned ? "📍" : "📌"}</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                <Text style={styles.actionEmoji}>🗑️</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bulletin Board</Text>
          <Text style={styles.subtitle}>Important updates & notices</Text>
        </View>
        <Pressable 
          style={styles.filterBtn}
          onPress={() => setShowFilterModal(true)}
        >
          <Text style={styles.filterBtnText}>{filterType}</Text>
        </Pressable>
      </View>

      <ScrollView 
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
        }
      >
        {pinnedItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PINNED</Text>
            {pinnedItems.map(renderCard)}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LATEST</Text>
          {loading && !refreshing ? (
            <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
          ) : feedItems.length > 0 ? (
            feedItems.map(renderCard)
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No announcements found.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <DarkSelectModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        title="Filter by Type"
        options={[
          { label: "All Types", value: "ALL" },
          { label: "Announcement", value: "ANNOUNCEMENT" },
          { label: "Event", value: "EVENT" },
          { label: "Urgent", value: "URGENT" },
        ]}
        selectedValue={filterType}
        onSelect={(v) => {
          setFilterType(v);
          setShowFilterModal(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050110",
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  filterBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 2,
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  typeIndicator: {
    width: 6,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
    marginLeft: 8,
  },
  dateText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
  },
  cardText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagPill: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
  },
  adminActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
  actionEmoji: {
    fontSize: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
  },
});
