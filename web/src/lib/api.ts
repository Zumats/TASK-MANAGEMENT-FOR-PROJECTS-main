export type ApiError = {
  error: string;
};

export class ApiHttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.body = body;
  }
}

// Import offline queue utilities
// Note: Using dynamic import to avoid circular dependencies
let offlineQueue: typeof import("./offline-queue") | null = null;

async function getOfflineQueue() {
  if (!offlineQueue && typeof window !== "undefined") {
    offlineQueue = await import("./offline-queue");
  }
  return offlineQueue;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const v = (body as { error?: unknown }).error;
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("failed") ||
      msg.includes("offline");
  }
  return false;
}

function getAuthHeaders(initHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...initHeaders };
  if (typeof window !== "undefined") {
    const token = window.sessionStorage.getItem("tm_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { 
    method: "GET", 
    credentials: "include",
    headers: getAuthHeaders()
  });
  const data = await readJson<unknown>(res);
  if (!res.ok) throw new ApiHttpError(res.status, errorMessageFromBody(data, res.statusText), data);
  return data as T;
}

export async function apiPost<T>(path: string, body?: unknown, options?: { skipQueue?: boolean }): Promise<T> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: getAuthHeaders({ "content-type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await readJson<unknown>(res);
    if (!res.ok) throw new ApiHttpError(res.status, errorMessageFromBody(data, res.statusText), data);
    return data as T;
  } catch (error) {
    if (isNetworkError(error) && !options?.skipQueue && typeof window !== "undefined") {
      const queue = await getOfflineQueue();
      if (queue && !queue.isOnline()) {
        queue.queueRequest("POST", path, body);
        throw new Error("OFFLINE_QUEUED");
      }
    }
    throw error;
  }
}

export async function apiPatch<T>(path: string, body?: unknown, options?: { skipQueue?: boolean }): Promise<T> {
  try {
    const res = await fetch(path, {
      method: "PATCH",
      credentials: "include",
      headers: getAuthHeaders({ "content-type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await readJson<unknown>(res);
    if (!res.ok) throw new ApiHttpError(res.status, errorMessageFromBody(data, res.statusText), data);
    return data as T;
  } catch (error) {
    if (isNetworkError(error) && !options?.skipQueue && typeof window !== "undefined") {
      const queue = await getOfflineQueue();
      if (queue && !queue.isOnline()) {
        queue.queueRequest("PATCH", path, body);
        throw new Error("OFFLINE_QUEUED");
      }
    }
    throw error;
  }
}

export async function apiDelete<T>(path: string, options?: { skipQueue?: boolean }): Promise<T> {
  try {
    const res = await fetch(path, { 
      method: "DELETE", 
      credentials: "include",
      headers: getAuthHeaders()
    });
    const data = await readJson<unknown>(res);
    if (!res.ok) throw new ApiHttpError(res.status, errorMessageFromBody(data, res.statusText), data);
    return data as T;
  } catch (error) {
    if (isNetworkError(error) && !options?.skipQueue && typeof window !== "undefined") {
      const queue = await getOfflineQueue();
      if (queue && !queue.isOnline()) {
        queue.queueRequest("DELETE", path, undefined);
        throw new Error("OFFLINE_QUEUED");
      }
    }
    throw error;
  }
}

export async function apiPut<T>(path: string, body?: unknown, options?: { skipQueue?: boolean }): Promise<T> {
  try {
    const res = await fetch(path, {
      method: "PUT",
      credentials: "include",
      headers: getAuthHeaders({ "content-type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await readJson<unknown>(res);
    if (!res.ok) throw new ApiHttpError(res.status, errorMessageFromBody(data, res.statusText), data);
    return data as T;
  } catch (error) {
    if (isNetworkError(error) && !options?.skipQueue && typeof window !== "undefined") {
      const queue = await getOfflineQueue();
      if (queue && !queue.isOnline()) {
        queue.queueRequest("PUT", path, body);
        throw new Error("OFFLINE_QUEUED");
      }
    }
    throw error;
  }
}

