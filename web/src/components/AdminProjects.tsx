"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { Project, ProjectAssignee } from "@/lib/types";
import { Card } from "@/components/Card";
import { Folder, Edit, Trash2, Plus, Calendar, Link2, Paperclip, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { useDocumentTheme } from "@/hooks/useDocumentTheme";

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.sessionStorage.getItem("tm_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AdminProjects({ onProjectsUpdated }: { onProjectsUpdated?: () => void }) {
  const isDark = useDocumentTheme() === "dark";
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 4;
  const [assigneeModal, setAssigneeModal] = useState<{ name: string; assignees: ProjectAssignee[] } | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Project[] }>("/api/projects");
      setItems(data.items || []);
    } catch (e: any) {
      setToast(e.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredItems = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
  }, [items, nameFilter]);

  useEffect(() => {
    setPage(0);
  }, [nameFilter, items.length]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedItems = filteredItems.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const openNew = () => {
    setEditId(null);
    setName("");
    setDescription("");
    setLinkUrl("");
    setProjectFile(null);
    setRemoveExistingFile(false);
    setModalOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditId(p.id);
    setName(p.name);
    setDescription(p.description);
    setLinkUrl((p.linkUrl as string | undefined) ?? "");
    setProjectFile(null);
    setRemoveExistingFile(false);
    setModalOpen(true);
  };

  const saveProject = async () => {
    if (!name.trim()) {
      setToast("Name is required");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    try {
      if (editId) {
        await apiPatch(`/api/projects/${editId}`, {
          name: name.trim(),
          description: description.trim(),
          linkUrl: linkUrl.trim(),
          ...(removeExistingFile ? { clearFile: true } : {}),
        });
        let newHasFile = removeExistingFile ? false : Boolean(Number((items.find((x) => x.id === editId) as Project | undefined)?.hasFile));
        let newFileName = removeExistingFile ? null : ((items.find((x) => x.id === editId) as Project | undefined)?.fileName ?? null);
        if (projectFile) {
          const fd = new FormData();
          fd.set("file", projectFile);
          await fetch(`/api/projects/${editId}/file`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
            body: fd,
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || "Upload failed");
          });
          newHasFile = true;
          newFileName = projectFile.name;
        }
        setItems((prev) =>
          prev.map((p) =>
            p.id === editId
              ? {
                  ...p,
                  name: name.trim(),
                  description: description.trim(),
                  linkUrl: linkUrl.trim() || null,
                  hasFile: newHasFile ? 1 : 0,
                  fileName: newFileName,
                  updatedAt: Date.now(),
                }
              : p,
          ),
        );
        setToast("Project updated");
      } else {
        const res = await apiPost<{
          id: number;
          name: string;
          description: string;
          createdAt: number;
          updatedAt: number;
          linkUrl?: string | null;
        }>("/api/projects", {
          name: name.trim(),
          description: description.trim(),
          linkUrl: linkUrl.trim(),
        });
        const pid = String(res.id);
        if (projectFile) {
          const fd = new FormData();
          fd.set("file", projectFile);
          await fetch(`/api/projects/${pid}/file`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
            body: fd,
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error || "Upload failed");
          });
        }
        const newRow: Project = {
          id: pid,
          name: res.name,
          description: res.description,
          createdAt: res.createdAt,
          updatedAt: res.updatedAt,
          linkUrl: (res.linkUrl ?? linkUrl).trim() || null,
          hasFile: projectFile ? 1 : 0,
          fileName: projectFile ? projectFile.name : null,
          taskCount: 0,
          assignees: [],
        };
        setItems((prev) => [newRow, ...prev]);
        setToast("Project created");
      }
      setModalOpen(false);
      onProjectsUpdated?.();
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) {
      setToast(e.message || "Failed to save project");
      setTimeout(() => setToast(null), 3000);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await apiDelete(`/api/projects/${deleteConfirm.id}`);
      setItems(prev => prev.filter(p => p.id !== deleteConfirm.id));
      onProjectsUpdated?.();
      setToast(`Project ${deleteConfirm.name} deleted`);
    } catch (e: any) {
      setToast(e.message || "Failed to delete project");
    } finally {
      setDeleteConfirm(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div
      className={
        "admin-projects-root p-8 space-y-8 h-full flex flex-col " +
        (isDark ? "bg-[#0b0b10]" : "bg-slate-50")
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={"text-2xl font-bold tracking-tight " + (isDark ? "text-white" : "text-slate-900")}>
            Projects
          </h2>
          <p className={"mt-1 text-sm " + (isDark ? "text-white/50" : "text-slate-600")}>
            Manage your company's projects and high-level initiatives.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            onClick={openNew}
            className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
          >
            <Plus size={16} /> New Project
          </button>
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by name…"
            className={
              "w-full min-w-[200px] rounded-xl border px-4 py-2 text-sm outline-none sm:max-w-xs " +
              (isDark
                ? "border-white/10 bg-white/5 text-white placeholder:text-white/30"
                : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400")
            }
          />
        </div>
      </div>

      {toast ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          {toast}
        </div>
      ) : null}

      {!loading && items.length > 0 && (
        <div className={"flex flex-wrap items-center justify-between gap-3 text-sm " + (isDark ? "text-white/55" : "text-slate-600")}>
          <span>
            Showing {filteredItems.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
            {nameFilter.trim() ? ` (filtered from ${items.length})` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((x) => Math.max(0, x - 1))}
              className={
                "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 " +
                (isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-700")
              }
            >
              <ChevronLeft size={18} />
            </button>
            <span className="tabular-nums text-xs">
              Page {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((x) => Math.min(pageCount - 1, x + 1))}
              className={
                "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-40 " +
                (isDark ? "border-white/10 bg-white/5 text-white" : "border-slate-200 bg-white text-slate-700")
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <div className={"col-span-full py-12 text-center " + (isDark ? "text-white/50" : "text-slate-500")}>
            Loading projects...
          </div>
        ) : items.length === 0 ? (
          <div className={"col-span-full py-12 text-center " + (isDark ? "text-white/40" : "text-slate-500")}>
            No projects found. Create one to get started.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={"col-span-full py-12 text-center " + (isDark ? "text-white/40" : "text-slate-500")}>
            No projects match this filter.
          </div>
        ) : (
          pagedItems.map(p => {
            const assignees = p.assignees ?? [];
            const shown = assignees.slice(0, 4);
            const extra = assignees.length - shown.length;
            return (
            <div
              key={p.id}
              className={
                "group relative flex flex-col justify-between rounded-3xl border p-6 min-h-[13rem] transition-colors " +
                (isDark
                  ? "border-white/5 bg-[#191922] hover:bg-[#1f1f2a]"
                  : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md")
              }
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Folder size={18} className="text-blue-500" />
                    <h3 className={"font-semibold text-base " + (isDark ? "text-white" : "text-slate-900")}>{p.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 relative z-10">
                    <button 
                      onClick={() => openEdit(p)} 
                      className={
                        "flex h-8 w-8 items-center justify-center rounded-full border transition-all " +
                        (isDark
                          ? "bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10"
                          : "bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-200")
                      }
                      title="Edit"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm({ id: p.id, name: p.name })} 
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all" 
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className={"text-sm line-clamp-2 " + (isDark ? "text-white/50" : "text-slate-600")}>
                  {p.description || "No description provided."}
                </div>
                {(p.linkUrl || Number(p.hasFile)) ? (
                  <div className={"mt-3 flex flex-wrap gap-2 " + (isDark ? "text-blue-400" : "text-blue-600")}>
                    {p.linkUrl ? (
                      <a
                        href={String(p.linkUrl).startsWith("http") ? String(p.linkUrl) : `https://${p.linkUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                      >
                        <Link2 size={12} /> Link
                      </a>
                    ) : null}
                    {Number(p.hasFile) ? (
                      <a
                        href={`/api/projects/${p.id}/file?download=1`}
                        className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                      >
                        <Paperclip size={12} />
                        {p.fileName || "Attachment"}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className={"mt-3 flex items-center justify-between gap-2 border-t pt-3 " + (isDark ? "border-white/5" : "border-slate-100")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Users size={14} className={isDark ? "text-white/35" : "text-slate-400"} />
                    {assignees.length === 0 ? (
                      <span className={"text-[11px] " + (isDark ? "text-white/40" : "text-slate-500")}>No assignees yet</span>
                    ) : (
                      <div className="flex items-center -space-x-2">
                        {shown.map((u) =>
                          u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={u.id}
                              src={u.avatarUrl}
                              alt=""
                              title={u.name || u.email}
                              className="h-7 w-7 rounded-full border-2 border-[#191922] object-cover"
                            />
                          ) : (
                            <div
                              key={u.id}
                              title={u.name || u.email}
                              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#191922] bg-blue-500/25 text-[9px] font-bold text-blue-300"
                            >
                              {(u.name || u.email).slice(0, 2).toUpperCase()}
                            </div>
                          ),
                        )}
                        {extra > 0 ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#191922] bg-white/10 text-[9px] font-bold text-white/70">
                            +{extra}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {assignees.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAssigneeModal({ name: p.name, assignees })}
                      className={"text-[11px] font-semibold underline-offset-2 hover:underline " + (isDark ? "text-blue-400" : "text-blue-600")}
                    >
                      View all
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={"flex items-center justify-between pt-4 mt-4 border-t " + (isDark ? "border-white/5" : "border-slate-100")}>
                <div className={"flex items-center gap-1.5 text-xs " + (isDark ? "text-white/40" : "text-slate-500")}>
                  <Calendar size={12} />
                  <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="rounded border border-blue-500/20 bg-transparent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-500">
                  Active
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      {modalOpen && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card
            className={
              "w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200 " +
              (isDark ? "bg-[#191922]" : "")
            }
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className={"text-xl font-bold " + (isDark ? "text-white" : "text-slate-900")}>
                {editId ? "Edit Project" : "New Project"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className={isDark ? "text-white/40 hover:text-white text-2xl" : "text-slate-400 hover:text-slate-700 text-2xl"}
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                <label className={"text-sm font-medium " + (isDark ? "text-white/70" : "text-slate-600")}>Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={
                    "rounded-xl border px-4 py-2 outline-none transition-colors " +
                    (isDark
                      ? "border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:border-blue-500/50"
                      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500")
                  }
                  placeholder="e.g. Q1 Marketing Campaign"
                />
              </div>
              <div className="grid gap-2">
                <label className={"text-sm font-medium " + (isDark ? "text-white/70" : "text-slate-600")}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={
                    "min-h-[120px] rounded-xl border px-4 py-2 outline-none transition-colors resize-none " +
                    (isDark
                      ? "border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:border-blue-500/50"
                      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500")
                  }
                  placeholder="What is this project about?"
                />
              </div>
              <div className="grid gap-2">
                <label className={"text-sm font-medium " + (isDark ? "text-white/70" : "text-slate-600")}>
                  External link (optional)
                </label>
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className={
                    "rounded-xl border px-4 py-2 outline-none transition-colors " +
                    (isDark
                      ? "border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:border-blue-500/50"
                      : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500")
                  }
                  placeholder="https://…"
                />
              </div>
              <div className="grid gap-2">
                <label className={"text-sm font-medium " + (isDark ? "text-white/70" : "text-slate-600")}>
                  Project file (optional)
                </label>
                <input
                  type="file"
                  className={"text-sm " + (isDark ? "text-white/70 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white" : "text-slate-700")}
                  onChange={(e) => setProjectFile(e.target.files?.[0] ?? null)}
                />
                {editId && Number(items.find((x) => x.id === editId)?.hasFile) ? (
                  <label className={"flex cursor-pointer items-center gap-2 text-xs " + (isDark ? "text-white/60" : "text-slate-600")}>
                    <input
                      type="checkbox"
                      checked={removeExistingFile}
                      onChange={(e) => setRemoveExistingFile(e.target.checked)}
                    />
                    Remove current attachment
                  </label>
                ) : null}
                {projectFile ? (
                  <p className={"text-xs " + (isDark ? "text-white/45" : "text-slate-500")}>Selected: {projectFile.name}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className={
                  "rounded-xl px-6 py-2 text-sm font-medium transition-colors " +
                  (isDark ? "text-white/60 hover:bg-white/5" : "text-slate-600 hover:bg-slate-100")
                }
              >
                Cancel
              </button>
              <button
                onClick={saveProject}
                className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
              >
                {editId ? "Save Changes" : "Create Project"}
              </button>
            </div>
          </Card>
        </div>,
        document.body
      )}

      {assigneeModal &&
        createPortal(
          <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <Card className={"w-full max-w-md max-h-[80vh] overflow-y-auto p-6 " + (isDark ? "bg-[#191922] border-white/10" : "bg-white border-slate-200")}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className={"text-lg font-bold " + (isDark ? "text-white" : "text-slate-900")}>People on this project</h3>
                  <p className={"text-sm " + (isDark ? "text-white/50" : "text-slate-600")}>{assigneeModal.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssigneeModal(null)}
                  className={isDark ? "text-2xl text-white/40 hover:text-white" : "text-2xl text-slate-400 hover:text-slate-700"}
                >
                  ×
                </button>
              </div>
              <ul className="space-y-3">
                {assigneeModal.assignees.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                        {(u.name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className={"truncate font-medium " + (isDark ? "text-white" : "text-slate-900")}>
                        {u.name?.trim() || u.email.split("@")[0]}
                      </div>
                      <div className={"truncate text-xs " + (isDark ? "text-white/50" : "text-slate-500")}>{u.email}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>,
          document.body,
        )}

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className={"w-full max-w-sm p-6 border-rose-500/20 " + (isDark ? "bg-[#191922]" : "")}>
            <h3 className={"text-lg font-bold " + (isDark ? "text-white" : "text-slate-900")}>Delete Project?</h3>
            <p className={"mt-2 text-sm " + (isDark ? "text-white/60" : "text-slate-600")}>
              Are you sure you want to delete{" "}
              <span className={"font-semibold " + (isDark ? "text-white" : "text-slate-900")}>{deleteConfirm.name}</span>? This
              action cannot be undone.
            </p>
            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={"text-sm font-medium " + (isDark ? "text-white/60 hover:text-white" : "text-slate-600 hover:text-slate-900")}
              >
                Cancel
              </button>
              <button onClick={executeDelete} className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white hover:bg-rose-500 transition-colors">Delete</button>
            </div>
          </Card>
        </div>,
        document.body
      )}
    </div>
  );
}
