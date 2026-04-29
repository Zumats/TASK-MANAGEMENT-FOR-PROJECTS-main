"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type PollItem = {
  id: number;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  createdAt: number;
  isActive: boolean;
  createdByEmail: string;
  myVote: { option_index: number; feedback: string | null } | null;
};

export function CommunityPolls({ canCreate }: { canCreate: boolean }) {
  const [items, setItems] = useState<PollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [opt1, setOpt1] = useState("");
  const [opt2, setOpt2] = useState("");
  const [opt3, setOpt3] = useState("");
  const [feedbackByPoll, setFeedbackByPoll] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ items: PollItem[] }>("/api/community/polls");
      setItems(res.items ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load polls";
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createPoll = async () => {
    const opts = [opt1, opt2, opt3].map((x) => x.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      setToast("Provide question and at least 2 options");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    try {
      await apiPost("/api/community/polls", { question, options: opts });
      setQuestion("");
      setOpt1("");
      setOpt2("");
      setOpt3("");
      await load();
      setToast("Poll created");
      setTimeout(() => setToast(null), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create poll";
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const vote = async (pollId: number, optionIndex: number) => {
    try {
      await apiPost(`/api/community/polls/${pollId}/vote`, {
        optionIndex,
        feedback: feedbackByPoll[pollId] ?? "",
      });
      await load();
      setToast("Vote saved");
      setTimeout(() => setToast(null), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to vote";
      setToast(msg);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const active = useMemo(() => items.filter((p) => p.isActive), [items]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Polls & Feedback</h2>
          <p className="mt-1 text-sm text-white/55">
            Vote quickly, add optional feedback, and see results instantly.
          </p>
        </div>
        <div className="text-xs text-white/40">
          {active.length} active poll{active.length === 1 ? "" : "s"}
        </div>
      </div>

      {toast ? (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
          {toast}
        </div>
      ) : null}

      {canCreate ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">Create Poll</div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-white/35">
              admin
            </div>
          </div>
          <div className="mt-3 grid gap-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="rounded-xl border border-white/15 bg-[#101014] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
              placeholder="Poll question"
            />
            <div className="grid gap-2 md:grid-cols-3">
              <input value={opt1} onChange={(e) => setOpt1(e.target.value)} className="rounded-xl border border-white/15 bg-[#101014] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" placeholder="Option 1" />
              <input value={opt2} onChange={(e) => setOpt2(e.target.value)} className="rounded-xl border border-white/15 bg-[#101014] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" placeholder="Option 2" />
              <input value={opt3} onChange={(e) => setOpt3(e.target.value)} className="rounded-xl border border-white/15 bg-[#101014] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50" placeholder="Option 3 (optional)" />
            </div>
            <div className="flex justify-end">
              <button onClick={createPoll} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 active:scale-[0.98] transition-all">
                Create Poll
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        {loading ? <div className="text-sm text-white/50">Loading polls...</div> : null}
        {!loading && active.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
            No active polls yet.
          </div>
        ) : null}

        {active.map((poll) => (
          <div key={poll.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-white font-medium">{poll.question}</div>
              <div className="text-xs text-white/45">
                {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {poll.options.map((opt, idx) => {
                const count = poll.counts[idx] ?? 0;
                const pct = poll.totalVotes ? Math.round((count / poll.totalVotes) * 100) : 0;
                const selected = poll.myVote?.option_index === idx;
                return (
                  <button
                    key={`${poll.id}_${idx}`}
                    onClick={() => vote(poll.id, idx)}
                    className={
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors " +
                      (selected
                        ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                        : "border-white/10 bg-[#101014] text-white/80 hover:bg-white/10")
                    }
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span>{opt}</span>
                      <span className="text-xs opacity-80">{count} • {pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-1.5 bg-sky-400" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <textarea
                value={feedbackByPoll[poll.id] ?? poll.myVote?.feedback ?? ""}
                onChange={(e) => setFeedbackByPoll((prev) => ({ ...prev, [poll.id]: e.target.value }))}
                className="w-full rounded-xl border border-white/15 bg-[#101014] px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
                rows={2}
                placeholder="Optional feedback..."
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

