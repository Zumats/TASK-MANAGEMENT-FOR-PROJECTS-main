import { useState, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
  
export type AdminTab =
  | "dashboard"
  | "assign"
  | "tasks"
  | "projects"
  | "users_tasks"
  | "users"
  | "meetings"
  | "analytics"
  | "settings"
  | "all_open"
  | "recently_created"
  | "latest_activity"
  | "overdue"
  | "shared_with_users"
  | "shared_with_me"
  | "community"
  | "bulletin"
  | "confessions"
  | "community_polls"
  | "profile";

type NavChild = {
  id: AdminTab;
  label: string;
  icon: string;
};

type NavItem =
  | {
      id: AdminTab;
      label: string;
      icon: string;
      children?: NavChild[];
      isDivider?: false;
    }
  | { isDivider: true; id?: never; label?: never; icon?: never; children?: never };

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "\u263A" },
  { id: "projects", label: "Projects", icon: "\u25A1" },
  { id: "assign", label: "Assign Task", icon: "\u271A" },
  {
    id: "all_open",
    label: "Work Overview",
    icon: "\u25A3",
    children: [
      { id: "recently_created", label: "Recently Created", icon: "\u2297" },
      { id: "latest_activity", label: "Latest Activity", icon: "\u26A1" },
      { id: "overdue", label: "Overdue", icon: "\u26A0" },
      { id: "shared_with_users", label: "Shared with Users", icon: "\u2605" },
      { id: "shared_with_me", label: "Shared with Me", icon: "\u25BD" },
    ],
  },
  { id: "users_tasks", label: "Users Tasks", icon: "\u2611" },
  { id: "users", label: "Accounts", icon: "\u263B" },
  { id: "meetings", label: "Meetings", icon: "\u25E6" },
  { id: "settings", label: "Settings", icon: "\u2699" },
  { isDivider: true },
  {
    id: "community",
    label: "Community",
    icon: "\u25CE",
    children: [
      { id: "bulletin", label: "Announcements", icon: "\u25B2" },
      { id: "confessions", label: "Anonymous Wall", icon: "\u25CF" },
      { id: "community_polls", label: "Polls & Feedback", icon: "\u25D1" },
    ],
  },
];

function IconBox({ char, active }: { char: string; active?: boolean }) {
  return (
    <View
      style={[
        styles.iconBox,
        active ? styles.iconBoxActive : null,
      ]}
    >
      <Text style={[styles.iconText, active ? styles.iconTextActive : null]}>
        {char}
      </Text>
    </View>
  );
}

export function MobileAdminDrawer({
  open,
  active,
  onClose,
  onSelect,
}: {
  open: boolean;
  active: AdminTab;
  onClose: () => void;
  onSelect: (tab: AdminTab) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const activeAncestors = useMemo(() => {
    const set = new Set<string>();
    for (const item of NAV_ITEMS) {
      if (!item.children?.length) continue;
      if (item.children.some((c) => c.id === active)) set.add(item.id);
    }
    return set;
  }, [active]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? activeAncestors.has(id)),
    }));
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => {}}>
          {/* ADMINISTRATION header */}
          <View style={styles.headerSection}>
            <Text style={styles.headerTitle}>ADMINISTRATION</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {NAV_ITEMS.map((item, idx) => {
              if ("isDivider" in item && item.isDivider) {
                return (
                  <View
                    key={`div-${idx}`}
                    style={styles.divider}
                  />
                );
              }

              const navItem = item as Exclude<NavItem, { isDivider: true }>;
              const isChildActive = navItem.children?.some(
                (c) => c.id === active
              );
              const isActive = active === navItem.id || isChildActive;
              const hasChildren = (navItem.children?.length ?? 0) > 0;
              const groupOpen = hasChildren
                ? (openGroups[navItem.id] ?? activeAncestors.has(navItem.id))
                : false;

              return (
                <View key={navItem.id}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.item,
                      isActive && styles.itemActive,
                      pressed && styles.itemPressed,
                    ]}
                    onPress={() => {
                      if (hasChildren) {
                        toggleGroup(navItem.id);
                      }
                      onSelect(navItem.id);
                      if (!hasChildren) onClose();
                    }}
                  >
                    <View style={styles.itemRow}>
                      <IconBox
                        char={navItem.icon}
                        active={isActive}
                      />
                      <Text
                        style={[
                          styles.itemText,
                          isActive && styles.itemTextActive,
                        ]}
                      >
                        {navItem.label}
                      </Text>
                    </View>
                    {hasChildren ? (
                      <Text
                        style={[
                          styles.chevron,
                          groupOpen && styles.chevronOpen,
                        ]}
                      >
                        {"\u25BC"}
                      </Text>
                    ) : null}
                  </Pressable>

                  {/* Submenu */}
                  {hasChildren && groupOpen ? (
                    <View style={styles.submenu}>
                      <View style={styles.submenuCard}>
                        {navItem.children!.map((child) => {
                          const childActive = active === child.id;
                          return (
                            <Pressable
                              key={child.id}
                              style={({ pressed }) => [
                                styles.childItem,
                                childActive && styles.childItemActive,
                                pressed && styles.childItemPressed,
                              ]}
                              onPress={() => {
                                onSelect(child.id);
                                onClose();
                              }}
                            >
                              <IconBox
                                char={child.icon}
                                active={childActive}
                              />
                              <Text
                                style={[
                                  styles.childText,
                                  childActive && styles.childTextActive,
                                ]}
                              >
                                {child.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "flex-start",
  },
  drawer: {
    width: 264,
    height: "100%",
    backgroundColor: "#14141c",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.05)",
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  headerTitle: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase" as any,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginVertical: 10,
    marginHorizontal: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  itemActive: {
    backgroundColor: "rgba(59,130,246,0.10)",
    borderRightWidth: 2,
    borderRightColor: "#3b82f6",
  },
  itemPressed: {
    opacity: 0.85,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBoxActive: {},
  iconText: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  iconTextActive: {
    color: "#60a5fa",
  },
  itemText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  itemTextActive: {
    color: "#60a5fa",
    fontWeight: "700",
  },
  chevron: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    transform: [{ rotate: "-90deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "0deg" }],
  },
  submenu: {
    paddingLeft: 6,
    paddingRight: 4,
    marginBottom: 4,
  },
  submenuCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  childItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },
  childItemActive: {
    backgroundColor: "rgba(59,130,246,0.20)",
  },
  childItemPressed: {
    opacity: 0.85,
  },
  childText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontWeight: "500",
  },
  childTextActive: {
    color: "#93c5fd",
    fontWeight: "700",
  },
});
