import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Vibration,
  Dimensions,
} from "react-native";
import { apiGet, apiPost, apiPatch, apiDelete } from "../lib/api";

const { width } = Dimensions.get("window");

// Keep reaction picker minimal on mobile for better readability.
const CONFESSION_EMOJIS = ["❤️", "😂", "🔥"] as const;

interface Confession {
  id: string;
  body: string;
  aliasId: string;
  alias: {
    name: string;
    color: string;
  };
  isPinned: boolean;
  isManualPin: boolean;
  isHidden: boolean;
  flagCount: number;
  replyToId?: string | null;
  totalReacts: number;
  createdAt: number;
  reactions: Array<{ emoji: string; count: number; reacted: boolean }>;
}

interface ConfessionChatScreenProps {
  isAdmin?: boolean;
  userId?: string | number;
}

export function ConfessionChatScreen({
  isAdmin = false,
  userId,
}: ConfessionChatScreenProps) {
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [pinnedItem, setPinnedItem] = useState<Confession | null>(null);
  const [alias, setAlias] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState<Confession | null>(null);
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const fetchAlias = async () => {
    try {
      const res = await apiGet<{ alias: any }>("/api/confessions/alias");
      if (res.alias) {
        setAlias(res.alias);
      }
    } catch (e) {
      console.error("Failed to fetch alias", e);
    }
  };

  const generateAlias = async () => {
    try {
      const res = await apiPost<{ alias: any }>("/api/confessions/alias");
      setAlias(res.alias);
    } catch (e) {
      Alert.alert("Error", "Failed to generate alias");
    }
  };

  const fetchData = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        apiGet<{ items: Confession[] }>("/api/confessions"),
        apiGet<{ item: Confession | null }>("/api/confessions/pinned"),
      ]);
      setConfessions(cRes.items || []);
      setPinnedItem(pRes.item);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch both alias and data in parallel — don't wait for alias before loading chat
    fetchAlias();
    fetchData();
    const inv = setInterval(fetchData, 5000);
    return () => clearInterval(inv);
  }, []);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await apiPost("/api/confessions", {
        body: message.trim(),
        replyToId: replyTo?.id || null,
      });
      setMessage("");
      setReplyTo(null);
      fetchData();
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      Alert.alert("Error", "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (id: string, emoji: string) => {
    try {
      Vibration.vibrate(10);
      await apiPost(`/api/confessions/${id}/react`, { emoji });
      fetchData();
    } catch (e) {
      console.error("Reaction failed", e);
    }
  };

  const handleFlag = async (id: string) => {
    Alert.alert("Flag Content", "Report this message as inappropriate?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: async () => {
          try {
            await apiPost(`/api/confessions/${id}/flag`);
            Alert.alert("Success", "Reported to moderators");
          } catch (e) {
            Alert.alert("Error", "Failed to flag");
          }
        },
      },
    ]);
  };

  const handleToggleHide = async (id: string, isCurrentlyHidden: boolean) => {
    try {
      await apiPatch(`/api/confessions/${id}/hide`, {
        action: isCurrentlyHidden ? "unhide" : "hide",
      });
      fetchData();
    } catch (e) {
      Alert.alert("Error", "Failed to update moderation");
    }
  };

  const renderMessage = (item: Confession) => {
    const isOwner = item.aliasId === alias?.id;
    const reactions = item.reactions || [];
    const sortedReactions = [...reactions].sort((a, b) => b.count - a.count);
    const topReaction = sortedReactions[0];
    const totalReacts = reactions.reduce((sum, r) => sum + (r.count || 0), 0);

    return (
      <View
        key={item.id}
        style={[
          styles.msgContainer,
          item.isHidden && { opacity: 0.5 },
          isOwner ? { alignItems: "flex-end" } : { alignItems: "flex-start" },
        ]}
      >
        {item.replyToId && (
          <View
            style={[
              styles.replyBubble,
              isOwner
                ? { alignSelf: "flex-end", marginRight: 40 }
                : { alignSelf: "flex-start", marginLeft: 40 },
            ]}
          >
            <Text style={styles.replyText} numberOfLines={1}>
              Replying to message...
            </Text>
          </View>
        )}

        <View
          style={[
            styles.msgWrapper,
            isOwner
              ? { flexDirection: "row-reverse" }
              : { flexDirection: "row" },
          ]}
        >
          {/* Avatar */}
          <View
            style={[
              styles.avatar,
              { backgroundColor: item.alias?.color || "#fff" },
            ]}
          >
            <Text style={styles.avatarText}>
              {item.alias?.name?.substring(0, 2).toUpperCase()}
            </Text>
          </View>

          <View
            style={[
              styles.bubbleWrapper,
              isOwner
                ? { alignItems: "flex-end", marginRight: 10 }
                : { alignItems: "flex-start", marginLeft: 10 },
            ]}
          >
            <View
              style={[
                styles.msgHeader,
                isOwner
                  ? { justifyContent: "flex-end" }
                  : { justifyContent: "flex-start" },
              ]}
            >
              {!isOwner && (
                <Text
                  style={[
                    styles.aliasText,
                    { color: item.alias?.color || "#fff" },
                  ]}
                >
                  {item.alias?.name}
                  {item.isHidden && " (HIDDEN)"}
                </Text>
              )}
              <Text style={styles.timeText}>
                {new Date(item.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>

            <View
              style={[
                styles.bubble,
                isOwner ? styles.bubbleRight : styles.bubbleLeft,
                isAdmin && item.flagCount >= 3 ? styles.bubbleFlagged : null,
              ]}
            >
              <Text style={styles.bodyText}>{item.body}</Text>
            </View>

            <View
              style={[
                styles.reactionRow,
                isOwner
                  ? { justifyContent: "flex-end" }
                  : { justifyContent: "flex-start" },
              ]}
            >
              {topReaction ? (
                <View style={styles.refPill}>
                  <Text style={styles.refText}>
                    {topReaction.emoji} {totalReacts}
                  </Text>
                </View>
              ) : null}
              {CONFESSION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => handleReact(item.id, emoji)}
                  style={styles.addReact}
                >
                  <Text style={styles.addReactText}>{emoji}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setReplyTo(item)}
                style={styles.addReact}
              >
                <Text style={styles.addReactText}>💬</Text>
              </Pressable>
              <Pressable
                onPress={() => handleFlag(item.id)}
                style={styles.addReact}
              >
                <Text style={styles.addReactText}>⚠️</Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  onPress={() => handleToggleHide(item.id, item.isHidden)}
                  style={styles.addReact}
                >
                  <Text style={styles.addReactText}>
                    {item.isHidden ? "👁️" : "🙈"}
                  </Text>
                </Pressable>
              )}
              {(isAdmin || isOwner) && (
                <Pressable
                  onPress={() => {
                    Alert.alert("Delete", "Delete this message?", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await apiDelete(`/api/confessions/${item.id}`);
                            fetchData();
                          } catch (e) {
                            Alert.alert("Error", "Failed to delete message");
                          }
                        },
                      },
                    ]);
                  }}
                  style={styles.addReact}
                >
                  <Text style={styles.addReactText}>🗑️</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (!alias) {
    return (
      <View style={styles.onboarding}>
        <Text style={styles.onboardingEmoji}>🤫</Text>
        <Text style={styles.onboardingTitle}>Anonymous Chat</Text>
        <Text style={styles.onboardingDesc}>
          Speak your mind freely. Your identity is protected by a unique alias.
        </Text>
        <Pressable style={styles.generateBtn} onPress={generateAlias}>
          <Text style={styles.generateBtnText}>Enter Chat</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Confessions</Text>
        <View style={styles.aliasBadge}>
          <Text style={[styles.aliasBadgeText, { color: alias.color }]}>
            {alias.name}
          </Text>
        </View>
      </View>

      {pinnedItem && (
        <View style={styles.pinnedBanner}>
          <Text style={styles.pinnedTitle}>📌 Pinned:</Text>
          <Text style={styles.pinnedText} numberOfLines={1}>
            {pinnedItem.body}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        onContentSizeChange={() =>
          !replyTo && scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {loading ? (
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 20 }} />
        ) : (
          confessions.slice().reverse().map(renderMessage)
        )}
      </ScrollView>

      {replyTo && (
        <View style={styles.replyPreview}>
          <Text style={styles.replyPreviewText} numberOfLines={1}>
            Replying to {replyTo.alias?.name}: {replyTo.body}
          </Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Text style={styles.closeReply}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="What's on your mind?"
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.sendBtn, !message.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>⬆️</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050110",
  },
  onboarding: {
    flex: 1,
    backgroundColor: "#050110",
    padding: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  onboardingEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 12,
  },
  onboardingDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },
  generateBtn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  topBar: {
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  aliasBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  aliasBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  pinnedBanner: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  pinnedTitle: {
    color: "#3b82f6",
    fontWeight: "700",
    marginRight: 8,
    fontSize: 12,
  },
  pinnedText: {
    color: "#fff",
    fontSize: 12,
    flex: 1,
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    padding: 16,
    paddingBottom: 40,
  },
  msgContainer: {
    marginBottom: 20,
    width: "100%",
  },
  msgWrapper: {
    alignItems: "flex-end",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  avatarText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  bubbleWrapper: {
    maxWidth: "80%",
  },
  msgHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 4,
    gap: 8,
  },
  aliasText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timeText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
  },
  replyBubble: {
    marginBottom: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
  },
  replyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontStyle: "italic",
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleLeft: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: "#2563eb",
    borderTopRightRadius: 4,
  },
  bubbleFlagged: {
    borderWidth: 1,
    borderColor: "#eab308",
  },
  bodyText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 6,
  },
  refPill: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  refPillActive: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderColor: "#3b82f6",
  },
  refText: {
    fontSize: 11,
    color: "#fff",
  },
  addReact: {
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addReactText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    backgroundColor: "#0d0d1a",
    alignItems: "flex-end",
    gap: 12,
  },
  replyPreview: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  replyPreviewText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    flex: 1,
  },
  closeReply: {
    color: "#fff",
    paddingLeft: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    color: "#fff",
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  sendIcon: {
    fontSize: 20,
  },
});
