import { Pressable, Text, View } from "react-native";
import * as Linking from "expo-linking";

type Attachment = {
  id: string;
  name: string;
  url: string;
};

export function AttachmentsPanel({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return (
    <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {attachments.slice(0, 6).map((a) => (
        <Pressable
          key={a.id}
          style={({ pressed }) => [
            {
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
            },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => void Linking.openURL(a.url)}
        >
          <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }} numberOfLines={1}>
            {a.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
