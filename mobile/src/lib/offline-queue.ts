import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export type QueuedRequest = {
  id: string;
  timestamp: number;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: string;
  retryCount: number;
};

const QUEUE_KEY = "hyperaccess_api_queue_v1";
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 100;

// Check if device is online
export async function isOnline(): Promise<boolean> {
  const netInfo = await NetInfo.fetch();
  return netInfo.isConnected === true && netInfo.isInternetReachable !== false;
}

// Detect if error is network-related
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("network") || 
           msg.includes("fetch") || 
           msg.includes("failed") ||
           msg.includes("internet") ||
           msg.includes("offline");
  }
  return false;
}

// Load queued requests from AsyncStorage
export async function loadQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_QUEUE_SIZE);
    }
    return [];
  } catch {
    return [];
  }
}

// Save queue to AsyncStorage
export async function saveQueue(queue: QueuedRequest[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE_SIZE)));
  } catch {
    // Storage might be full, remove oldest items
    const reduced = queue.slice(-50);
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(reduced));
    } catch {
      // Can't save, ignore
    }
  }
}

// Add a request to the queue
export async function queueRequest(
  method: QueuedRequest["method"],
  path: string,
  body?: unknown
): Promise<void> {
  const queue = await loadQueue();
  const newRequest: QueuedRequest = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: Date.now(),
    method,
    path,
    body: body ? JSON.stringify(body) : undefined,
    retryCount: 0,
  };
  queue.push(newRequest);
  await saveQueue(queue);
}

// Remove a request from the queue
export async function removeRequest(id: string): Promise<void> {
  const queue = await loadQueue();
  const filtered = queue.filter((r) => r.id !== id);
  await saveQueue(filtered);
}

// Clear the entire queue
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

// Get queue length
export async function getQueueLength(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

// Process the queue - retry all queued requests
export async function processQueue<T>(
  requestFn: (path: string, init: RequestInit) => Promise<T>
): Promise<{
  success: number;
  failed: number;
  remaining: number;
}> {
  const queue = await loadQueue();
  
  if (queue.length === 0) {
    return { success: 0, failed: 0, remaining: 0 };
  } 
  
  const online = await isOnline();
  if (!online) {
    return { success: 0, failed: 0, remaining: queue.length };
  }
  
  let success = 0;
  let failed = 0;
  const remaining: QueuedRequest[] = [];
  
  for (const request of queue) {
    try {
      const options: RequestInit = {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
        },
      };
      
      if (request.body && request.method !== "GET") {
        options.body = request.body;
      }
      
      await requestFn(request.path, options);
      success++;
      continue; // Don't add to remaining (successfully processed)
    } catch (error: any) {
      // If still network error, keep in queue for retry
      if (isNetworkError(error) && request.retryCount < MAX_RETRIES) {
        remaining.push({ ...request, retryCount: request.retryCount + 1 });
      } else if (error?.status >= 500 || error?.status === 429) {
        // Server error or rate limit - retry later
        if (request.retryCount < MAX_RETRIES) {
          remaining.push({ ...request, retryCount: request.retryCount + 1 });
        } else {
          failed++;
        }
      } else {
        // Client error (4xx) - don't retry, it's a permanent error
        failed++;
      }
    }
  }
  
  await saveQueue(remaining);
  
  return { success, failed, remaining: remaining.length };
}
