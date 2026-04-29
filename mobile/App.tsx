import "react-native-gesture-handler";

import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { AdminScreen } from "./src/screens/AdminScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { apiGet, getToken, setToken } from "./src/lib/api";
import { SyncIndicator } from "./src/components/SyncIndicator";

const Stack = createNativeStackNavigator();

type AppUser = {
  id: number;
  email: string;
  role: "admin" | "manager" | "user";
  department: string;
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<"admin" | "manager" | "user">("user");
  const [loading, setLoading] = useState(true);
  const [sessionTick, setSessionTick] = useState(0);

  const refreshSession = async () => {
    setSessionTick((x) => x + 1);
  };

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await apiGet<{ user: AppUser | null }>("/api/auth/me");
        if (cancelled) return;
        setUser(res.user);
        setRole(res.user?.role ?? "user");
      } catch {
        if (cancelled) return;
        setUser(null);
        setRole("user");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    void refresh();
    const id = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionTick]);

  useEffect(() => {
    let cancelled = false;
    let last: string | null = null;
    const id = setInterval(async () => {
      const t = await getToken();
      if (cancelled) return;
      if (t !== last) {
        last = t;
        setSessionTick((x) => x + 1);
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <SyncIndicator />
      {user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {role === "admin" || role === "manager" ? (
            <Stack.Screen name="Admin" component={AdminScreen} />
          ) : (
            <Stack.Screen name="Profile" component={ProfileScreen} />
          )}
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            initialParams={{ refreshSession }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            initialParams={{ refreshSession }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
