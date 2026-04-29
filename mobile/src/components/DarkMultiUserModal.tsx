import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type MultiUserOption = {
  id: string;
  label: string;
  subtitle?: string;
  avatarUrl?: string | null;
};

export function DarkMultiUserModal({
  visible,
  title,
  options,
  selectedIds,
  onClose,
  onToggle,
  resolveAvatarUrl,
}: {
  visible: boolean;
  title: string;
  options: MultiUserOption[];
  selectedIds: string[];
  onClose: () => void;
  onToggle: (userId: string) => void;
  resolveAvatarUrl: (url: string | null | undefined) => string | null;
}) {
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!visible) setFilter("");
  }, [visible]);

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return options;
    return options.filter((o) => {
      const blob = `${o.label} ${o.subtitle ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [options, q]);

  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.85 }]} onPress={onClose}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.search}
          />

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {filtered.length ? (
              filtered.map((o) => {
                const selected = selSet.has(o.id);
                const av = resolveAvatarUrl(o.avatarUrl);
                return (
                  <Pressable
                    key={o.id}
                    style={({ pressed }) => [styles.item, selected && styles.itemSelected, pressed && { opacity: 0.9 }]}
                    onPress={() => onToggle(o.id)}
                  >
                    {av ? (
                      <Image source={{ uri: av }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarLetter}>{o.label.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.itemText, selected && styles.itemTextSelected]} numberOfLines={1}>
                        {o.label}
                      </Text>
                      {o.subtitle ? (
                        <Text style={styles.subtitle} numberOfLines={1}>
                          {o.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.check}>{selected ? "✓" : ""}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.7)" }}>No matches</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 16,
    justifyContent: "center",
  },
  sheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#0b0b10",
    maxHeight: 520,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  title: { color: "white", fontWeight: "800" },
  close: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closeText: { color: "white", fontWeight: "700", fontSize: 12 },
  search: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "white",
    fontSize: 14,
  },
  list: { paddingHorizontal: 12 },
  listContent: { paddingVertical: 12, gap: 10 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemSelected: {
    backgroundColor: "rgba(59,130,246,0.25)",
    borderColor: "rgba(59,130,246,0.45)",
  },
  itemText: { color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  itemTextSelected: { color: "white" },
  subtitle: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
  check: { width: 22, color: "#4ade80", fontWeight: "900", fontSize: 16 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "white", fontWeight: "900", fontSize: 14 },
});
