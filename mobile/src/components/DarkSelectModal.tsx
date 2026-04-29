import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export type DarkSelectOption = {
  label: string;
  value: string;
  subtitle?: string;
  avatarUrl?: string | null;
};

export function DarkSelectModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
  searchable,
  resolveAvatarUrl,
}: {
  visible: boolean;
  title: string;
  options: DarkSelectOption[];
  selectedValue: string;
  onClose: () => void;
  onSelect: (value: string) => void;
  searchable?: boolean;
  resolveAvatarUrl?: (url: string | null | undefined) => string | null;
}) {
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!visible) setFilter("");
  }, [visible]);

  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchable || !q) return options;
    return options.filter((o) => {
      const blob = `${o.label} ${o.subtitle ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [options, q, searchable]);

  const list = searchable ? filtered : options;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={({ pressed }) => [styles.close, pressed && { opacity: 0.85 }]} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {searchable ? (
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="Search…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.search}
            />
          ) : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {list.length ? (
              list.map((o) => {
                const selected = o.value === selectedValue;
                const av = resolveAvatarUrl?.(o.avatarUrl);
                return (
                  <Pressable
                    key={o.value}
                    style={({ pressed }) => [styles.item, selected && styles.itemSelected, pressed && { opacity: 0.9 }]}
                    onPress={() => {
                      onSelect(o.value);
                      onClose();
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                      {av ? (
                        <Image source={{ uri: av }} style={styles.avatar} />
                      ) : resolveAvatarUrl ? (
                        <View style={styles.avatarPlaceholder}>
                          <Text style={styles.avatarLetter}>{o.label.slice(0, 1).toUpperCase()}</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.itemText, selected && styles.itemTextSelected]} numberOfLines={1}>
                          {o.label}
                        </Text>
                        {o.subtitle ? (
                          <Text
                            style={[styles.subtitleMuted, selected && styles.subtitleOnSelected]}
                            numberOfLines={1}
                          >
                            {o.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.7)" }}>No options</Text>
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  itemSelected: {
    backgroundColor: "white",
  },
  itemText: { color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  itemTextSelected: { color: "black" },
  subtitleMuted: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 },
  subtitleOnSelected: { color: "rgba(0,0,0,0.5)" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 14 },
});
