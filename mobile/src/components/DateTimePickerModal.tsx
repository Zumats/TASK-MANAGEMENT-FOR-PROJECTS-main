import { useState, useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

interface DateTimePickerModalProps {
  visible: boolean;
  value: Date | null;
  onClose: () => void;
  onSelect: (date: Date) => void;
  title?: string;
}

export function DateTimePickerModal({ visible, value, onClose, onSelect, title = "Select date & time" }: DateTimePickerModalProps) {
  const [tempDate, setTempDate] = useState<Date>(value ?? new Date());

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setTempDate(value ?? new Date());
    }
  }, [visible, value]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "set" && selectedDate) {
      // Keep the time from tempDate, update the date
      const newDate = new Date(selectedDate);
      newDate.setHours(tempDate.getHours(), tempDate.getMinutes());
      setTempDate(newDate);
      onSelect(newDate);
      onClose();
    } else if (event.type === "dismissed") {
      onClose();
    }
  };

  // For iOS, show date picker in modal
  if (Platform.OS === "ios") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="spinner"
              onChange={(_, date) => date && setTempDate(date)}
              themeVariant="dark"
              textColor="white"
              style={{ width: "100%" }}
            />
            <View style={styles.actions}>
              <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]} onPress={onClose}>
                <Text style={[styles.buttonText, { color: "white" }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                style={({ pressed }) => [styles.button, styles.confirmBtn, pressed && { opacity: 0.9 }]} 
                onPress={() => {
                  onSelect(tempDate);
                  onClose();
                }}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // For Android, use system native calendar picker (date only)
  if (!visible) return null;

  return (
    <DateTimePicker
      value={tempDate}
      mode="date"
      display="calendar"
      onChange={handleDateChange}
      minimumDate={new Date()}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "rgba(30,30,38,0.98)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 16,
    width: "100%",
    maxWidth: 360,
  },
  title: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  confirmBtn: {
    backgroundColor: "white",
    borderColor: "white",
  },
  buttonText: {
    color: "black",
    fontWeight: "700",
    fontSize: 14,
  },
});
