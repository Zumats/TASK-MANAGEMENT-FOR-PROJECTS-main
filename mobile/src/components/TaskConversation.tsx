import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  Image,
  Modal,
  Dimensions,
  Platform,
  Clipboard,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { TaskComment } from "../lib/types";
import { apiPost, apiDelete, apiBaseUrl, apiGet } from "../lib/api";

type TaskConversationProps = {
  taskId: string;
  comments: TaskComment[];
  currentUserId: string;
  currentUserEmail: string;
  onCommentsChange: () => void;
};

export function TaskConversation({
  taskId,
  comments,
  currentUserId,
  currentUserEmail,
  onCommentsChange,
}: TaskConversationProps) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ uri: string; name: string; mimeType: string; isVideo?: boolean }[]>([]);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video'; name: string } | null>(null);

  // Message Options State
  const [activeMenuComment, setActiveMenuComment] = useState<TaskComment | null>(null);
  const [forwardingComment, setForwardingComment] = useState<TaskComment | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [taskList, setTaskList] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  useEffect(() => {
    if (forwardingComment) {
      loadTaskList();
    }
  }, [forwardingComment]);

  const loadTaskList = async () => {
    setLoadingTasks(true);
    try {
      const res = await apiGet<{ items: any[] }>("/api/tasks");
      setTaskList(res.items || []);
    } catch (e) {
      console.log("Failed to load tasks for forwarding", e);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleForward = async (targetTaskId: string) => {
    if (!forwardingComment) return;
    try {
      await apiPost(`/api/tasks/${targetTaskId}/comments`, {
        message: forwardingComment.text || "📎 Forwarded Attachment",
      });
      setForwardingComment(null);
      setForwardSearch("");
      Alert.alert("Success", "Message forwarded");
      onCommentsChange();
    } catch (e) {
      Alert.alert("Error", "Failed to forward message");
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert("Copied", "Message copied to clipboard", [{ text: "OK", onPress: () => {} }], { cancelable: true });
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map(asset => {
          const isVideo = asset.type === 'video';
          let mimeType = isVideo ? "video/mp4" : "image/jpeg";
          if (asset.fileName) {
            const ext = asset.fileName.split('.').pop()?.toLowerCase();
            if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';
            else if (ext === 'webp') mimeType = 'image/webp';
            else if (ext === 'mov') mimeType = 'video/quicktime';
          }
          return {
            uri: asset.uri,
            name: asset.fileName || `media_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
            mimeType,
            isVideo,
          };
        });
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.log("Error picking image", err);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: false,
        multiple: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
        }));
        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.log("Error picking document", err);
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Auto scroll logic can be handled via onContentSizeChange,
  // but if needed, we can also trigger smooth scrolling manually here.

  const handleSend = async () => {
    const text = messageText.trim();
    if ((!text && selectedFiles.length === 0) || sending) return;

    setSending(true);
    try {
      const messageTextToSend = text || "📎 Attachment";
      const res = await apiPost<{comment: {id: string}}>(`/api/tasks/${taskId}/comments`, { 
        message: messageTextToSend,
        parent_id: replyTo?.id
      });
      setMessageText("");
      setReplyTo(null);
      
      if (res.comment?.id && selectedFiles.length > 0) {
        // Upload attachments sequentially
        for (const file of selectedFiles) {
          const fd = new FormData();
          fd.append("file", {
            uri: file.uri,
            name: file.name,
            type: file.mimeType
          } as any);
          
          await fetch(`${apiBaseUrl()}/api/tasks/${taskId}/comments/${res.comment.id}/attachments`, {
            method: "POST",
            body: fd,
          }).catch(err => console.log('File upload failed:', err));
        }
        
        setSelectedFiles([]);
      }
      
      onCommentsChange();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      Alert.alert("Error", msg);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    Alert.alert("Delete", "Delete this message?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await apiDelete(`/api/tasks/${taskId}/comments/${commentId}`);
            onCommentsChange();
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to delete";
            Alert.alert("Error", msg);
          }
        },
      },
    ]);
  };

  // Sort comments by createdAt
  const sortedComments = [...comments].sort((a, b) => a.createdAt - b.createdAt);

  // Group comments by date
  const groupedComments: { date: string; items: TaskComment[] }[] = [];
  let lastDate: string | null = null;
  let currentGroup: TaskComment[] = [];

  sortedComments.forEach((comment) => {
    const commentDate = new Date(comment.createdAt).toLocaleDateString();
    if (commentDate !== lastDate) {
      if (currentGroup.length > 0 && lastDate) {
        groupedComments.push({ date: lastDate, items: currentGroup });
      }
      currentGroup = [comment];
      lastDate = commentDate;
    } else {
      currentGroup.push(comment);
    }
  });
  if (currentGroup.length > 0 && lastDate) {
    groupedComments.push({ date: lastDate, items: currentGroup });
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // Check if message is from current user
  const isMe = (comment: TaskComment) => {
    const idMatch = String(comment.createdBy) === String(currentUserId);
    const emailMatch =
      comment.createdByEmail && currentUserEmail
        ? String(comment.createdByEmail).toLowerCase() ===
          String(currentUserEmail).toLowerCase()
        : false;
    return idMatch || emailMatch;
  };

  return (
    <View style={styles.container}>
      {/* Header (Collapsible toggle) */}
      <Pressable 
        style={({pressed}) => [styles.header, pressed && { opacity: 0.8 }]} 
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>💬</Text>
          <Text style={styles.headerTitle}>Task Conversation</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.messageCount}>
            {comments.length} message{comments.length !== 1 ? "s" : ""}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
            {isExpanded ? "▲" : "▼"}
          </Text>
        </View>
      </Pressable>

      {isExpanded && (
        <>
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            nestedScrollEnabled={true}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {groupedComments.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>
                  No messages yet. Start the conversation...
                </Text>
              </View>
            ) : (
          groupedComments.map((group, groupIndex) => (
            <View key={group.date}>
              {/* Date separator */}
              <View style={styles.dateSeparator}>
                <Text style={styles.dateText}>{formatDate(group.date)}</Text>
              </View>

              {/* Messages for this date */}
              {group.items.map((comment, index) => {
                const fromMe = isMe(comment);
                const showSender =
                  index === 0 ||
                  String(group.items[index - 1]?.createdBy) !==
                    String(comment.createdBy);

                return (
                  <View
                    key={comment.id}
                    style={[
                      styles.messageRow,
                      fromMe ? styles.messageRowRight : styles.messageRowLeft,
                    ]}
                  >
                    <View style={{ alignItems: fromMe ? "flex-end" : "flex-start", maxWidth: '90%' }}>
                      {/* Sender name for others */}
                      {!fromMe && showSender && comment.createdByEmail && (
                        <Text style={[styles.senderName, { marginLeft: 12 }]}>
                          {comment.createdByEmail.split("@")[0]}
                        </Text>
                      )}

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* Render dots on left for sent messages */}
                        {fromMe && (
                          <Pressable 
                            style={styles.menuDots} 
                            onPress={() => setActiveMenuComment(comment)}
                          >
                            <Text style={styles.menuDotsText}>⋮</Text>
                          </Pressable>
                        )}

                        <Pressable
                          onLongPress={() => setActiveMenuComment(comment)}
                          onPress={() => {
                            // Single press also opens menu for better discovery if no other action
                            setActiveMenuComment(comment);
                          }}
                          style={({pressed}) => [
                            styles.messageBubble,
                            fromMe ? styles.bubbleMe : styles.bubbleOther,
                            pressed && {opacity: 0.9}
                          ]}
                        >
                          {/* Replied marker */}
                          {comment.parentId && (
                            <View style={styles.repliedBanner}>
                              <Text style={styles.repliedBannerText} numberOfLines={1}>Replied Message Context</Text>
                            </View>
                          )}

                          {/* Message text */}
                          {comment.text && !comment.text.match(/attachment/i) && !comment.text.match(/📎/) && (
                            <Text
                              style={[
                                styles.messageText,
                                fromMe ? styles.textMe : styles.textOther,
                              ]}
                            >
                              {comment.text}
                            </Text>
                          )}
                          
                          {/* Attachments */}
                          {comment.attachments && comment.attachments.length > 0 && (
                            <View style={styles.attachmentList}>
                              {comment.attachments.map(a => {
                                const isImage = a.contentType?.startsWith('image/') || (a.url && a.url.match(/\.(jpeg|jpg|gif|png|webp)(?:$|\?)/i));
                                const isVideo = a.contentType?.startsWith('video/') || (a.url && a.url.match(/\.(mp4|mov|avi|webm)(?:$|\?)/i));
                                
                                return (
                                  <Pressable 
                                    key={a.id} 
                                    style={[styles.attachmentItem, (isImage || isVideo) && { padding: 0, backgroundColor: 'transparent', overflow: 'hidden' }]}
                                    onPress={() => {
                                      if (isImage) setFullscreenMedia({ url: `${apiBaseUrl()}${a.url}`, type: 'image', name: a.name });
                                      else if (isVideo) setFullscreenMedia({ url: `${apiBaseUrl()}${a.url}`, type: 'video', name: a.name });
                                      else Linking.openURL(`${apiBaseUrl()}${a.url}?download=1`);
                                    }}
                                  >
                                    {isImage ? (
                                      <Image 
                                        source={{ uri: `${apiBaseUrl()}${a.url}` }} 
                                        style={{ width: 140, height: 140, borderRadius: 8, backgroundColor: '#f0f0f0' }} 
                                        resizeMode="contain" 
                                      />
                                    ) : isVideo ? (
                                      <View style={{ width: 140, height: 80, borderRadius: 8, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.4)', justifyContent: 'center', alignItems: 'center' }}>
                                          <Text style={{ color: 'white', fontSize: 14, marginLeft: 2 }}>▶</Text>
                                        </View>
                                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                                          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 8 }} numberOfLines={1}>{a.name}</Text>
                                        </View>
                                      </View>
                                    ) : (
                                      <>
                                        <Text style={styles.attachmentIcon}>📎</Text>
                                        <Text style={styles.attachmentName} numberOfLines={1}>{a.name}</Text>
                                      </>
                                    )}
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}

                          {/* Timestamp */}
                          <View style={styles.messageFooter}>
                            <Text
                              style={[
                                styles.timestamp,
                                fromMe ? styles.timestampMe : styles.timestampOther,
                              ]}
                            >
                              {formatTime(comment.createdAt)}
                              {fromMe && <Text> ✓</Text>}
                            </Text>
                          </View>
                        </Pressable>

                        {/* Render dots on right for received messages */}
                        {!fromMe && (
                          <Pressable 
                            style={styles.menuDots} 
                            onPress={() => setActiveMenuComment(comment)}
                          >
                            <Text style={styles.menuDotsText}>⋮</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
        </ScrollView>

          {/* Context Banners */}
          {replyTo && (
            <View style={styles.replyContextBanner}>
              <View style={styles.replyContextTextContainer}>
                <Text style={styles.replyContextTitle}>Replying to message</Text>
                <Text style={styles.replyContextBody} numberOfLines={1}>{replyTo.text}</Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)}>
                <Text style={styles.replyContextClose}>×</Text>
              </Pressable>
            </View>
          )}

          {/* Queued Attachments Banner */}
          {selectedFiles.length > 0 && (
            <View style={styles.queuedFilesBanner}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                {selectedFiles.map((file, index) => {
                  const isMedia = file.mimeType.startsWith('image/') || file.isVideo;
                  return (
                    <View key={index} style={styles.queuedFileItem}>
                      {isMedia ? (
                        <>
                          <Image source={{ uri: file.uri }} style={{ width: 60, height: 60, borderRadius: 8 }} />
                          {file.isVideo && (
                            <View style={{ position: 'absolute', width: 60, height: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8 }}>
                              <Text style={{ color: 'white', fontSize: 16 }}>▶</Text>
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={{ width: 60, height: 60, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ fontSize: 24 }}>📄</Text>
                          <Text style={{ color: 'white', fontSize: 8, marginTop: 4, paddingHorizontal: 4 }} numberOfLines={1}>{file.name}</Text>
                        </View>
                      )}
                      <Pressable 
                        style={({pressed}) => [styles.queuedFileRemove, pressed && { opacity: 0.8 }]} 
                        onPress={() => removeSelectedFile(index)}
                      >
                        <Text style={styles.queuedFileRemoveText}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Input */}
          <View style={styles.inputContainer}>
            <Pressable onPress={pickImage} style={[styles.attachButton, { marginRight: 4 }]}>
              <Text style={styles.attachButtonText}>🖼️</Text>
            </Pressable>
            <Pressable onPress={pickDocument} style={styles.attachButton}>
              <Text style={styles.attachButtonText}>📎</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              multiline={false}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              editable={!sending}
            />
            <Pressable
              onPress={handleSend}
              disabled={(!messageText.trim() && selectedFiles.length === 0) || sending}
              style={({ pressed }) => [
                styles.sendButton,
                ((!messageText.trim() && selectedFiles.length === 0) || sending) && styles.sendButtonDisabled,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.sendButtonText}>➤</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Fullscreen Media Modal */}
      <Modal visible={!!fullscreenMedia} transparent animationType="fade" onRequestClose={() => setFullscreenMedia(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalClose} onPress={() => setFullscreenMedia(null)}>
            <Text style={styles.modalCloseText}>✕</Text>
          </Pressable>
          
          <View style={styles.modalContent}>
            {fullscreenMedia?.type === 'image' ? (
              <Image source={{ uri: fullscreenMedia.url }} style={styles.fullImage} resizeMode="contain" />
            ) : fullscreenMedia?.type === 'video' ? (
              <View style={styles.videoPlaceholder}>
                <Text style={{ color: 'white', fontSize: 40 }}>▶</Text>
                <Text style={{ color: 'white', marginTop: 20 }}>Video Player</Text>
                <Pressable 
                  style={styles.downloadBtn} 
                  onPress={() => Linking.openURL(`${fullscreenMedia.url}?download=1`)}
                >
                  <Text style={styles.downloadBtnText}>Open in Browser / Download</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {fullscreenMedia?.type === 'image' && (
            <View style={styles.modalFooter}>
              <Text style={styles.modalFileName} numberOfLines={1}>{fullscreenMedia.name}</Text>
              <Pressable 
                style={styles.downloadBtn} 
                onPress={() => Linking.openURL(`${fullscreenMedia.url}?download=1`)}
              >
                <Text style={styles.downloadBtnText}>Download Image</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      {/* Message Options Menu */}
      <Modal visible={!!activeMenuComment} transparent animationType="slide" onRequestClose={() => setActiveMenuComment(null)}>
        <Pressable style={styles.menuOverlay} onPress={() => setActiveMenuComment(null)}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Message Options</Text>
              <Pressable onPress={() => setActiveMenuComment(null)}>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 20 }}>×</Text>
              </Pressable>
            </View>

            <Pressable 
              style={styles.menuOption} 
              onPress={() => {
                if (activeMenuComment) setReplyTo(activeMenuComment);
                setActiveMenuComment(null);
              }}
            >
              <Text style={styles.menuOptionIcon}>↩️</Text>
              <Text style={styles.menuOptionText}>Reply</Text>
            </Pressable>

            <Pressable 
              style={styles.menuOption} 
              onPress={() => {
                setForwardingComment(activeMenuComment);
                setActiveMenuComment(null);
              }}
            >
              <Text style={styles.menuOptionIcon}>➡️</Text>
              <Text style={styles.menuOptionText}>Forward</Text>
            </Pressable>

            {activeMenuComment?.text && (
              <Pressable 
                style={styles.menuOption} 
                onPress={() => {
                  copyToClipboard(activeMenuComment.text);
                  setActiveMenuComment(null);
                }}
              >
                <Text style={styles.menuOptionIcon}>📋</Text>
                <Text style={styles.menuOptionText}>Copy Text</Text>
              </Pressable>
            )}

            {activeMenuComment && isMe(activeMenuComment) && (
              <Pressable 
                style={styles.menuOption} 
                onPress={() => {
                  handleDelete(activeMenuComment.id);
                  setActiveMenuComment(null);
                }}
              >
                <Text style={styles.menuOptionIcon}>🗑️</Text>
                <Text style={[styles.menuOptionText, styles.menuOptionTextDestructive]}>Unsend</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Forwarding Modal */}
      <Modal visible={!!forwardingComment} transparent animationType="fade" onRequestClose={() => setForwardingComment(null)}>
        <View style={[styles.modalOverlay, { padding: 20 }]}>
          <View style={[styles.menuContainer, { borderRadius: 20, width: '100%', maxHeight: '80%' }]}>
            <View style={styles.forwardHeader}>
              <Text style={styles.forwardTitle}>Forward Message</Text>
              <Pressable onPress={() => setForwardingComment(null)}>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 24 }}>×</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.forwardSearch}
              placeholder="Search tasks..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={forwardSearch}
              onChangeText={setForwardSearch}
            />

            <ScrollView style={styles.forwardList}>
              {loadingTasks ? (
                <View style={styles.forwardEmpty}>
                  <Text style={styles.forwardEmptyText}>Loading tasks...</Text>
                </View>
              ) : (
                taskList
                  .filter(t => 
                    t.id !== forwardingComment?.taskId && 
                    (t.title?.toLowerCase().includes(forwardSearch.toLowerCase()) || 
                     t.description?.toLowerCase().includes(forwardSearch.toLowerCase()))
                  )
                  .map(t => (
                    <Pressable key={t.id} style={styles.forwardItem} onPress={() => handleForward(t.id)}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.forwardItemTitle} numberOfLines={1}>{t.title}</Text>
                        <Text style={styles.forwardItemSub} numberOfLines={1}>
                          {t.department?.replace('_', ' ')} • {t.status}
                        </Text>
                      </View>
                      <Text style={styles.forwardItemIcon}>➤</Text>
                    </Pressable>
                  ))
              )}
              {!loadingTasks && taskList.length === 0 && (
                <View style={styles.forwardEmpty}>
                  <Text style={styles.forwardEmptyText}>No tasks found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
    minHeight: 150,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 16,
  },
  headerTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  messageCount: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
  messagesContainer: {
    maxHeight: 200,
    minHeight: 80,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
    opacity: 0.6,
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    textAlign: "center",
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 6,
  },
  dateText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
    width: "100%",
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  menuDots: {
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  menuDotsText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 22,
    fontWeight: "bold",
  },
  messageBubble: {
    maxWidth: "85%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: "#0A84FF",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#2C2C2E",
    borderBottomLeftRadius: 4,
  },
  senderName: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    marginBottom: 3,
    fontWeight: "600",
  },
  messageText: {
    fontSize: 14,
    lineHeight: 18,
    color: "white",
  },
  textMe: {
    color: "white",
  },
  textOther: {
    color: "white",
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  timestamp: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
  },
  timestampMe: {
    color: "rgba(255,255,255,0.7)",
  },
  timestampOther: {
    color: "rgba(255,255,255,0.5)",
  },
  deleteButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "white",
    fontSize: 14,
    maxHeight: 100,
  },
  // Options Menu Styles
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  menuTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  menuOptionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  menuOptionText: {
    color: "white",
    fontSize: 15,
  },
  menuOptionTextDestructive: {
    color: "#ff453a",
  },
  // Forward Modal Styles
  forwardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  forwardTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  forwardSearch: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "white",
    fontSize: 15,
    marginBottom: 16,
  },
  forwardList: {
    maxHeight: 400,
  },
  forwardItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  forwardItemTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  forwardItemSub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  forwardItemIcon: {
    fontSize: 14,
    color: "#0A84FF",
  },
  forwardEmpty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  forwardEmptyText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  sendButtonText: {
    color: "white",
    fontSize: 18,
    marginLeft: 2,
  },
  repliedBanner: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  repliedBannerText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontStyle: 'italic',
  },
  replyContextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderLeftWidth: 3,
    borderColor: "#3b82f6",
    marginBottom: -10, // pull down closer to the input
    paddingBottom: 14,
    zIndex: -1,
  },
  replyContextTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  replyContextTitle: {
    color: "#3b82f6",
    fontSize: 12,
    fontWeight: "bold",
  },
  replyContextBody: {
    color: "white",
    fontSize: 13,
  },
  replyContextClose: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
    padding: 4,
  },
  fileContextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderLeftWidth: 3,
    borderColor: "#10b981",
    marginBottom: -10, // pull down closer to the input
    paddingBottom: 14,
    zIndex: -1,
  },
  fileContextIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  fileContextName: {
    color: "white",
    fontSize: 13,
    flex: 1,
  },
  attachButton: {
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
  },
  attachButtonText: {
    fontSize: 16,
  },
  attachmentList: {
    marginTop: 8,
    gap: 6,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 8,
    borderRadius: 8,
  },
  attachmentIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  attachmentName: {
    color: "#3b82f6",
    fontSize: 12,
    textDecorationLine: "underline",
    flex: 1,
  },
  queuedFilesBanner: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginBottom: -10,
    paddingBottom: 10,
    zIndex: -1,
  },
  queuedFileItem: {
    position: "relative",
    marginRight: 8,
  },
  queuedFileRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1e1e24", // Assuming dark background match
  },
  queuedFileRemoveText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 25,
    zIndex: 10,
    padding: 10,
  },
  modalCloseText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '300',
  },
  modalContent: {
    width: '100%',
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: Dimensions.get('window').width,
    height: '100%',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalFooter: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalFileName: {
    color: 'white',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  downloadBtn: {
    backgroundColor: '#0A84FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  downloadBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
