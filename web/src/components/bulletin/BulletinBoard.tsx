"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Announcement } from "@/lib/schemas/bulletin";
import { BulletinFilters } from "./BulletinFilters";
import { AnnouncementCard } from "./AnnouncementCard";
import { AnnouncementForm } from "./AnnouncementForm";
import { useAuth } from "@/components/AuthProvider";

export function BulletinBoard() {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === "admin";

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const qs = filterType !== "ALL" ? `?type=${filterType}` : "";
      const res = await apiGet<{ items: any[] }>(`/api/bulletin${qs}`);
      setAnnouncements(res.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAnnouncements();
  }, [filterType]);

  const handleSave = async (data: any) => {
    try {
      if (editingItem) {
        await apiPatch(`/api/bulletin/${editingItem.id}`, data);
      } else {
        await apiPost(`/api/bulletin`, data);
      }
      setIsFormOpen(false);
      setEditingItem(null);
      void fetchAnnouncements();
    } catch (e) {
      alert("Failed to save announcement");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await apiDelete(`/api/bulletin/${id}`);
      void fetchAnnouncements();
    } catch (e) {
      alert("Failed to delete");
    }
  };

  const handlePin = async (id: string, currentPin: boolean) => {
    try {
      await apiPatch(`/api/bulletin/${id}/pin`, { isPinned: !currentPin });
      void fetchAnnouncements();
    } catch (e) {
      alert("Failed to pin");
    }
  };

  const pinnedItems = announcements.filter((a) => a.is_pinned);
  const feedItems = announcements.filter((a) => !a.is_pinned);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">📋 Bulletin Board</h1>
          <p className="text-white/60 mt-2 text-sm">Company announcements, events, and important notices.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingItem(null);
              setIsFormOpen(true);
            }}
            className="rounded-xl bg-blue-500 hover:bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all"
          >
            + New Post
          </button>
        )}
      </div>

      <BulletinFilters currentFilter={filterType} onFilterChange={setFilterType} />

      <div className="grid gap-6 md:grid-cols-12 items-start relative">
        {/* Left column: Pinned (Sticky) */}
        <div className="md:col-span-4 sticky top-24 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest pl-2">📌 Pinned</h2>
          {pinnedItems.length > 0 ? (
            pinnedItems.map((item) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                onEdit={() => { setEditingItem(item); setIsFormOpen(true); }}
                onDelete={() => handleDelete(item.id)}
                onPin={() => handlePin(item.id, item.is_pinned)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-white/5 bg-white/5 p-6 text-center">
              <p className="text-white/40 text-sm">No pinned items.</p>
            </div>
          )}
        </div>

        {/* Right column: Feed */}
        <div className="md:col-span-8 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest pl-2">Latest</h2>
          {loading ? (
            <div className="p-12 text-center text-white/50">Loading feed...</div>
          ) : feedItems.length > 0 ? (
            feedItems.map((item, i) => (
              <AnnouncementCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                index={i}
                onEdit={() => { setEditingItem(item); setIsFormOpen(true); }}
                onDelete={() => handleDelete(item.id)}
                onPin={() => handlePin(item.id, item.is_pinned)}
              />
            ))
          ) : (
            <div className="p-12 text-center rounded-2xl border border-white/5 bg-white/5">
              <p className="text-white/40">No announcements match this filter.</p>
            </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <AnnouncementForm
          initialData={editingItem}
          onClose={() => {
            setIsFormOpen(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
