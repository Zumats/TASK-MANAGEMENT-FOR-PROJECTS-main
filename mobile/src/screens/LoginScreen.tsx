import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { apiPost, setToken } from "../lib/api";

// Simple icon components
function MailIcon() {
  return (
    <Text style={styles.inputIcon}>✉️</Text>
  );
}

function LockIcon() {
  return (
    <Text style={styles.inputIcon}>🔒</Text>
  );
}

function EyeIcon() {
  return (
    <Text style={styles.eyeIcon}>👁️</Text>
  );
}

function EyeSlashIcon() {
  return (
    <Text style={styles.eyeIcon}>🙈</Text>
  );
}

function TaskIcon() {
  return (
    <Text style={styles.logoIcon}>✓</Text>
  );
}

export function LoginScreen({ navigation, route }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // refreshSession can be passed from App.tsx to trigger immediate session update
  const refreshSession: (() => void) | undefined = route?.params?.refreshSession;

  return (
    <View style={styles.container}>
      {/* Background decoration */}
      <View style={styles.bgDecorationTop} />
      <View style={styles.bgDecorationBottom} />

      <View style={styles.card}>
        {/* Logo/Brand */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <TaskIcon />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to manage your tasks</Text>
        </View>

        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Email Input */}
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputContainer}>
          <MailIcon />
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Enter your email"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (error) setError(null);
            }}
          />
        </View>

        {/* Password Input */}
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputContainer}>
          <LockIcon />
          <TextInput
            style={[styles.input, styles.inputWithIcon]}
            secureTextEntry={!showPassword}
            placeholder="Enter your password"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (error) setError(null);
            }}
          />
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeButton}
          >
            {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
          </Pressable>
        </View>

        {/* Sign In Button */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          disabled={loading}
          onPress={async () => {
            if (!email.trim() || !password) {
              setError("Please enter both email and password");
              return;
            }
            try {
              setLoading(true);
              setError(null);
              await setToken(null);
              await apiPost("/api/auth/logout");
              const res = await apiPost<{ token: string }>("/api/auth/login", {
                email: email.trim(),
                password
              });
              await setToken(res.token);
              // Immediately trigger session refresh so navigation happens instantly
              if (refreshSession) refreshSession();
            } catch (e: any) {
              await setToken(null);
              const msg = e?.message || "Login failed";
              if (msg.includes("401") || msg.includes("Invalid")) {
                setError("Invalid email or password");
              } else if (msg === "OFFLINE_QUEUED") {
                setError("You're offline. Please check your connection.");
              } else if (msg.toLowerCase().includes("pending")) {
                setError("Your account is pending admin approval.");
              } else if (msg.toLowerCase().includes("rejected")) {
                setError("Your registration was rejected.");
              } else {
                setError(msg);
              }
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.buttonText}>Signing in...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Register Link */}
        <Pressable onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>
            Don&apos;t have an account? <Text style={styles.linkHighlight}>Create one</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b10",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  bgDecorationTop: {
    position: "absolute",
    top: -100,
    right: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  bgDecorationBottom: {
    position: "absolute",
    bottom: -100,
    left: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(147,51,234,0.15)",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 28,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoIcon: {
    fontSize: 32,
    color: "white",
    fontWeight: "bold",
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorIcon: {
    fontSize: 16,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    flex: 1,
  },
  label: {
    marginTop: 4,
    marginBottom: 6,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 10,
    opacity: 0.6,
  },
  input: {
    flex: 1,
    color: "white",
    fontSize: 14,
    height: "100%",
  },
  inputWithIcon: {
    paddingRight: 40,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    height: "100%",
    justifyContent: "center",
  },
  eyeIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  button: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginHorizontal: 12,
  },
  link: {
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
  },
  linkHighlight: {
    color: "#60a5fa",
    fontWeight: "600",
  },
});
