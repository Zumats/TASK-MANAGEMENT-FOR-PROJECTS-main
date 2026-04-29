"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  taskId: string | null;
  createdAtMs: number;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
};

function mapNotification(id: string, data: DocumentData): NotificationItem {
  return {
    id,
    title: String(data.title ?? "(untitled)"),
    message: String(data.message ?? ""),
    taskId: data.taskId ? String(data.taskId) : null,
    createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
  };
}

export function NotificationsBell({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
    );

    let first = true;
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs
        .map((d) => mapNotification(d.id, d.data()))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      setItems(next.slice(0, 10));

      if (!first) {
        const addedDocs = snap.docChanges().filter((c) => c.type === "added");
        if (addedDocs.length) {
          setUnread((n) => n + addedDocs.length);
          const addedToasts = addedDocs
            .map((c) => mapNotification(c.doc.id, c.doc.data()))
            .map((n) => ({ id: n.id, title: n.title, message: n.message }));
          setToasts((prev) => {
            const merged = [...addedToasts, ...prev];
            return merged.slice(0, 3);
          });
          for (const t of addedToasts) {
            window.setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, 4500);
          }
        }
      }
      first = false;
    });

    return () => unsub();
  }, [uid]);

  const list = useMemo(() => items, [items]);

  return (
    <div className="relative z-50">
      <div className="pointer-events-none fixed right-4 top-20 z-[60] grid w-[340px] gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 12, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="pointer-events-auto rounded-2xl border border-white/15 bg-black/55 p-4 text-white shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            >
              <div className="text-sm font-semibold">{t.title}</div>
              {t.message ? <div className="mt-1 text-sm text-white/75">{t.message}</div> : null}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setUnread(0);
        }}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-white/90 backdrop-blur-xl transition-transform hover:scale-[1.02] active:scale-[0.98]"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 ? (
          <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.18)] animate-pulse" />
        ) : null}
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-fuchsia-500 px-1 text-[11px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 mt-3 w-[320px] overflow-hidden rounded-2xl border border-white/15 bg-black/40 text-white shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl z-50"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-semibold">Notifications</div>
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                onClick={() => setOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="max-h-[320px] overflow-auto">
              {list.length ? (
                list.map((n) => (
                  <div key={n.id} className="border-t border-white/10 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.message ? <div className="mt-1 text-sm text-white/75">{n.message}</div> : null}
                        <div className="mt-2 text-[11px] text-white/50">{new Date(n.createdAtMs).toLocaleString()}</div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                        onClick={async () => {
                          await deleteDoc(doc(db, "users", uid, "notifications", n.id));
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border-t border-white/10 px-4 py-6 text-sm text-white/70">No tasks yet.</div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
