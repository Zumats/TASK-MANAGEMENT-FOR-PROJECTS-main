import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { isNetworkError, queueRequest, isOnline, loadQueue } from "./offline-queue";

const TOKEN_KEY = "tm_token";

export async function setToken(token: string | null) {
  if (!token) {
    await AsyncStorage.removeItem(TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (explicit && String(explicit).trim()) return String(explicit);

  // Android emulator cannot reach host machine via localhost.
  if (Platform.OS === "android" && Constants.isDevice === false) {
    return "http://10.0.2.2:3000";
  }

  // Try to infer host from the Expo dev server URL (e.g. "10.0.0.218:8081").
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ??
    (Constants.expoConfig as any)?.hostUri ??
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ??
    (Constants as any)?.manifest?.debuggerHost;

  if (typeof hostUri === "string" && hostUri.includes(":")) {
    const host = hostUri.split(":")[0];
    if (host) return `http://${host}:3000`;
  }

  return "http://localhost:3000";
}

export async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  // Don't set Content-Type manually - let fetch set it with proper boundary
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: formData as any,
    });

    const text = await res.text();

    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!res.ok) {
      if (data && typeof data === "object" && data !== null && "error" in data) {
        const msg = (data as { error?: unknown }).error;
        throw new Error(`[${res.status}] ${typeof msg === "string" ? msg : res.statusText}`);
      }
      if (text) throw new Error(`[${res.status}] ${text}`);
      throw new Error(`[${res.status}] ${res.statusText}`);
    }

    return data as T;
  } catch (error) {
    // Check if network error and offline
    if (isNetworkError(error)) {
      const online = await isOnline();
      if (!online) {
        throw new Error("OFFLINE_NO_MULTIPART");
      }
    }
    throw error;
  }
}

async function request<T>(path: string, init: RequestInit, options?: { skipQueue?: boolean }): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(typeof init.headers === "object" && init.headers ? (init.headers as Record<string, string>) : {}),
  };
  headers["content-type"] = headers["content-type"] || "application/json";
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
    const text = await res.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // The server might return HTML for 404/500 pages.
        data = { raw: text };
      }
    }
    if (!res.ok) {
      if (data && typeof data === "object" && "error" in data) {
        const msg = (data as { error?: unknown }).error;
        throw new Error(typeof msg === "string" ? msg : res.statusText);
      }
      throw new Error(
        `[${res.status}] ${typeof res.statusText === "string" ? res.statusText : "Request failed"}`,
      );
    }
    return data as T;
  } catch (error) {
    // If network error and not explicitly skipping queue, add to offline queue
    if (isNetworkError(error) && !options?.skipQueue) {
      const online = await isOnline();
      if (!online && init.method && init.method !== "GET") {
        await queueRequest(
          init.method as any,
          path,
          init.body ? JSON.parse(init.body as string) : undefined
        );
        throw new Error("OFFLINE_QUEUED");
      }
    }
    throw error;
  }
}

export function apiGet<T>(path: string) {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, options?: { skipQueue?: boolean }) {
  return request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }, options);
}

export function apiPatch<T>(path: string, body?: unknown, options?: { skipQueue?: boolean }) {
  return request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }, options);
}

export function apiDelete<T>(path: string, options?: { skipQueue?: boolean }) {
  return request<T>(path, { method: "DELETE" }, options);
}
