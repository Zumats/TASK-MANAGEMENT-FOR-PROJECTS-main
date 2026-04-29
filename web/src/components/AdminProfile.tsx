"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card } from "@/components/Card";
import { apiPatch } from "@/lib/api";

export function AdminProfile() {
  const { appUser, refreshSession } = useAuth();
  
  const [editName, setEditName] = useState(appUser?.name ?? "");
  const [editAge, setEditAge] = useState(appUser?.age?.toString() ?? "");
  const [editBio, setEditBio] = useState(appUser?.bio ?? "");
  const [editPosition, setEditPosition] = useState(appUser?.position ?? "");
  
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    setEditName(appUser?.name ?? "");
    setEditAge(appUser?.age?.toString() ?? "");
    setEditBio(appUser?.bio ?? "");
    setEditPosition(appUser?.position ?? "");
  }, [appUser]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const ageNum = editAge ? Number(editAge) : null;
      await apiPatch("/api/auth/profile", {
        name: editName.trim() || null,
        age: ageNum && ageNum > 0 ? ageNum : null,
        bio: editBio.trim() || null,
        position: editPosition.trim() || null,
      });
      await refreshSession();
      showToast('success', "Profile updated successfully");
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget.elements.namedItem("avatar") as HTMLInputElement | null;
    const f = el?.files?.[0] ?? null;
    if (!f) return;
    
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/auth/avatar", { 
        method: "POST", 
        credentials: "include", 
        body: fd 
      });
      if (!res.ok) throw new Error("Upload failed");
      await refreshSession();
      showToast('success', "Profile picture updated");
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (el) el.value = "";
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Admin Profile</h2>
      </div>

      {toast && (
        <div className={`p-4 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        }`}>
          {toast.message}
        </div>
      )}

      <Card className="bg-[#191922] border-white/10 p-8">
        {/* Profile Picture Section */}
        <div className="flex flex-col items-center gap-6 mb-10">
          <div className="relative group">
            <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-white/5 bg-white/5 flex items-center justify-center shadow-2xl transition-transform group-hover:scale-[1.02]">
              {appUser?.avatarUrl ? (
                <img src={appUser.avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <div className="text-4xl text-white/20 font-bold uppercase">
                  {appUser?.email?.substring(0, 2) || "AD"}
                </div>
              )}
              
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              )}
            </div>
            
            <form onSubmit={handleAvatarUpload} className="absolute -bottom-2 -right-2">
              <input
                name="avatar"
                type="file"
                id="avatar-upload"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
              <label
                htmlFor="avatar-upload"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 transition-all hover:scale-110 active:scale-95"
                title="Change picture"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </label>
            </form>
          </div>
          
          <div className="text-center">
            <h3 className="text-lg font-medium text-white">{appUser?.name || "No name set"}</h3>
            <p className="text-sm text-white/40">{appUser?.email}</p>
          </div>
        </div>

        {/* Form Grid */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/30">Display Name</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:bg-white/10 placeholder:text-white/20"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-white/30">Age (Optional)</label>
              <input
                type="number"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:bg-white/10 placeholder:text-white/20"
                value={editAge}
                onChange={(e) => setEditAge(e.target.value)}
                placeholder="Your age"
                min={1}
                max={120}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-white/30">Position / Department</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:bg-white/10 placeholder:text-white/20"
              value={editPosition}
              onChange={(e) => setEditPosition(e.target.value)}
              placeholder="e.g. Senior Project Manager"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-white/30">Bio</label>
            <textarea
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/50 focus:bg-white/10 placeholder:text-white/20 min-h-[120px] resize-none"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Tell something about yourself..."
            />
          </div>

          <button
            type="button"
            disabled={savingProfile}
            onClick={handleSaveProfile}
            className="w-full rounded-xl bg-blue-500 py-4 text-sm font-bold text-white shadow-xl shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            {savingProfile ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving Changes...
              </span>
            ) : "Save Profile Details"}
          </button>
        </div>
      </Card>
    </div>
  );
}
