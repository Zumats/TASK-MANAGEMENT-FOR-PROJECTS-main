import { useState } from "react";

export function AnnouncementForm({
  initialData,
  onClose,
  onSave,
}: {
  initialData?: any;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [data, setData] = useState({
    title: initialData?.title || "",
    body: initialData?.body || "",
    type: initialData?.type || "ANNOUNCEMENT",
    isPinned: initialData?.is_pinned ?? false,
    isPublished: initialData?.is_published ?? true,
    coverImage: initialData?.cover_image || "",
    eventStart: initialData?.event_start ? new Date(initialData.event_start).toISOString().slice(0, 16) : "",
    eventEnd: initialData?.event_end ? new Date(initialData.event_end).toISOString().slice(0, 16) : "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...data,
      eventStart: data.eventStart ? new Date(data.eventStart).getTime() : null,
      eventEnd: data.eventEnd ? new Date(data.eventEnd).getTime() : null,
      coverImage: data.coverImage || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#0d0d1a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-white">
            {initialData ? "Edit Announcement" : "New Post"}
          </h2>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form id="announcement-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-white/70 mb-1.5">Title *</label>
              <input
                required
                maxLength={200}
                type="text"
                value={data.title}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-colors"
                placeholder="Important company update..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/70 mb-1.5">Type *</label>
              <select
                value={data.type}
                onChange={(e) => setData({ ...data, type: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 appearance-none"
              >
                <option value="ANNOUNCEMENT">Announcement</option>
                <option value="EVENT">Event</option>
                <option value="DEADLINE">Deadline</option>
                <option value="HOLIDAY">Holiday</option>
                <option value="URGENT">Urgent 🚨</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white/70 mb-1.5">Message Body *</label>
              <textarea
                required
                rows={6}
                value={data.body}
                onChange={(e) => setData({ ...data, body: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-colors resize-none"
                placeholder="Write your announcement here..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-1.5">Cover Image URL</label>
                <input
                  type="url"
                  value={data.coverImage}
                  onChange={(e) => setData({ ...data, coverImage: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="https://..."
                />
              </div>

              {data.type === "EVENT" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-white/70 mb-1.5">Event Start</label>
                    <input
                      type="datetime-local"
                      value={data.eventStart}
                      onChange={(e) => setData({ ...data, eventStart: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white/90 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white/70 mb-1.5">Event End</label>
                    <input
                      type="datetime-local"
                      value={data.eventEnd}
                      onChange={(e) => setData({ ...data, eventEnd: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white/90 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-6 mt-2 pt-4 border-t border-white/10">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={data.isPinned}
                  onChange={(e) => setData({ ...data, isPinned: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-2"
                />
                <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                  📌 Pin to top
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={data.isPublished}
                  onChange={(e) => setData({ ...data, isPublished: e.target.checked })}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-2"
                />
                <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                  👁 Publish immediately
                </span>
              </label>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 shrink-0 bg-white/[0.02] rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="announcement-form"
            className="px-5 py-2.5 rounded-xl bg-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-colors"
          >
            {initialData ? "Save Changes" : "Post Announcement"}
          </button>
        </div>
      </div>
    </div>
  );
}
