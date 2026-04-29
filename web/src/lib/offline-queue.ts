// Offline Queue System for Web
// Stores API requests when offline and replays them when connection returns

export type QueuedRequest = {
  id: string;
  timestamp: number;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  retryCount: number;
};

const QUEUE_KEY = "hyperaccess_api_queue_v1";
const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 100;

// Check if browser is online
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// Detect if error is network-related
export function isNetworkError(error: unknown): boolean {
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

// Load queued requests from localStorage
export function loadQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
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

// Save queue to localStorage
export function saveQueue(queue: QueuedRequest[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE_SIZE)));
  } catch {
    // localStorage might be full, remove oldest items
    const reduced = queue.slice(-50);
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(reduced));
    } catch {
      // Can't save, ignore
    }
  }
}

// Add a request to the queue
export function queueRequest(
  method: QueuedRequest["method"],
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): void {
  const queue = loadQueue();
  const newRequest: QueuedRequest = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: Date.now(),
    method,
    url,
    body,
    headers,
    retryCount: 0,
  };
  queue.push(newRequest);
  saveQueue(queue);
  
  // Dispatch event for UI updates
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("queue-updated", { 
      detail: { count: queue.length } 
    }));
  }
}

// Remove a request from the queue
export function removeRequest(id: string): void {
  const queue = loadQueue();
  const filtered = queue.filter((r) => r.id !== id);
  saveQueue(filtered);
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("queue-updated", { 
      detail: { count: filtered.length } 
    }));
  }
}

// Clear the entire queue
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("queue-updated", { 
      detail: { count: 0 } 
    }));
  }
}

// Get queue length
export function getQueueLength(): number {
  return loadQueue().length;
}

// Process the queue - retry all queued requests
export async function processQueue(): Promise<{
  success: number;
  failed: number;
  remaining: number;
}> {
  const queue = loadQueue();
  
  if (queue.length === 0) {
    return { success: 0, failed: 0, remaining: 0 };
  }
  
  if (!isOnline()) {
    return { success: 0, failed: 0, remaining: queue.length };
  }
  
  let success = 0;
  let failed = 0;
  const remaining: QueuedRequest[] = [];
  
  for (const request of queue) {
    try {
      const options: RequestInit = {
        method: request.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...request.headers,
        },
      };
      
      if (request.body && request.method !== "GET") {
        options.body = JSON.stringify(request.body);
      }
      
      const response = await fetch(request.url, options);
      
      if (response.ok) {
        success++;
        continue; // Don't add to remaining (successfully processed)
      } else if (response.status >= 500 || response.status === 429) {
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
    } catch (error) {
      // Network error - keep in queue for retry
      if (request.retryCount < MAX_RETRIES) {
        remaining.push({ ...request, retryCount: request.retryCount + 1 });
      } else {
        failed++;
      }
    }
  }
  
  saveQueue(remaining);
  
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("queue-updated", { 
      detail: { count: remaining.length } 
    }));
    
    if (success > 0) {
      window.dispatchEvent(new CustomEvent("sync-complete", { 
        detail: { success, failed } 
      }));
    }
  }
  
  return { success, failed, remaining: remaining.length };
}

// Start automatic queue processing
export function startAutoSync(intervalMs = 5000): () => void {
  // Process immediately if online
  if (isOnline()) {
    void processQueue();
  }
  
  // Set up interval
  const intervalId = setInterval(() => {
    if (isOnline() && getQueueLength() > 0) {
      void processQueue();
    }
  }, intervalMs);
  
  // Listen for online event
  const handleOnline = () => {
    void processQueue();
  };
  
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
    }
  };
}
