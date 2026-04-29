"use client";

import Link from "next/link";

const features = [
  {
    emoji: "✅",
    title: "Smart Task Management",
    desc: "Create, assign, and track tasks in real-time with priorities, due dates, progress tracking, and checklist sub-items.",
    color: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/20",
  },
  {
    emoji: "🤫",
    title: "Anonymous Confession Chat",
    desc: "Speak freely with an anonymous alias. React, reply, and connect with teammates without revealing your identity.",
    color: "from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/20",
  },
  {
    emoji: "📌",
    title: "Bulletin Board",
    desc: "Admins can post announcements, events, and pinned updates visible to the entire organization.",
    color: "from-amber-500/20 to-amber-600/10",
    border: "border-amber-500/20",
  },
  {
    emoji: "🔔",
    title: "Real-time Notifications",
    desc: "Instant notifications when tasks are assigned, commented on, or updated. Never miss an important update.",
    color: "from-green-500/20 to-green-600/10",
    border: "border-green-500/20",
  },
  {
    emoji: "👤",
    title: "Role-based Access",
    desc: "Admin, Manager, and User roles with granular permissions. Admins approve registrations and manage users.",
    color: "from-cyan-500/20 to-cyan-600/10",
    border: "border-cyan-500/20",
  },
  {
    emoji: "📎",
    title: "File Attachments",
    desc: "Upload files directly to tasks and comments. Full attachment management with preview and download.",
    color: "from-pink-500/20 to-pink-600/10",
    border: "border-pink-500/20",
  },
  {
    emoji: "⏱️",
    title: "Task Timer",
    desc: "Built-in timer for each task. Track time spent, submit stop reports, and view elapsed time history.",
    color: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/20",
  },
  {
    emoji: "📱",
    title: "Mobile App",
    desc: "Full-featured React Native mobile app with offline support, sync queue, and push-ready notifications.",
    color: "from-indigo-500/20 to-indigo-600/10",
    border: "border-indigo-500/20",
  },
  {
    emoji: "🛡️",
    title: "Secure JWT Auth",
    desc: "Cookie-based JWT authentication with bcrypt password hashing and token expiry management.",
    color: "from-red-500/20 to-red-600/10",
    border: "border-red-500/20",
  },
];

const recommendations = [
  {
    icon: "🚀",
    title: "For Teams Just Starting Out",
    tips: [
      "Have an admin register first and approve all members",
      "Create department-based task categories",
      "Use the Bulletin Board for onboarding announcements",
      "Encourage Confession Chat for anonymous feedback on processes",
    ],
  },
  {
    icon: "🏢",
    title: "For Enterprise Use",
    tips: [
      "Enable manager role for team leads to assign tasks",
      "Use task transfers to reassign workload fairly",
      "Monitor the Activity Log for audit trails",
      "Attach documents directly to task checklists",
    ],
  },
  {
    icon: "📲",
    title: "Mobile & Offline First",
    tips: [
      "Install the Expo app for iOS and Android support",
      "Offline queue automatically syncs when reconnected",
      "Task updates reflect instantly via 2-second polling",
      "Use dark mode for less eye strain on mobile",
    ],
  },
  {
    icon: "🤝",
    title: "Building Team Culture",
    tips: [
      "Pin important confessions to boost team morale",
      "React to confessions with emojis to show support",
      "Use bulletin events for team milestones",
      "Enable task comments for constructive feedback",
    ],
  },
];

const roadmap = [
  { label: "Push Notifications (FCM)", status: "planned", dot: "bg-blue-400" },
  { label: "Dark/Light Theme Toggle", status: "planned", dot: "bg-blue-400" },
  { label: "Task Analytics Dashboard", status: "planned", dot: "bg-blue-400" },
  { label: "Confession Polls", status: "planned", dot: "bg-blue-400" },
  { label: "Calendar View for Tasks", status: "planned", dot: "bg-blue-400" },
  { label: "Export Reports (PDF/CSV)", status: "planned", dot: "bg-blue-400" },
  { label: "Two-Factor Authentication", status: "planned", dot: "bg-blue-400" },
  { label: "Real-time WebSocket Updates", status: "planned", dot: "bg-blue-400" },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#07070f] text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 py-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Task Management Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent mb-6 leading-tight">
            Features & Recommendations
          </h1>
          <p className="text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
            Everything your team needs to stay organized, connected, and productive — in one premium platform.
          </p>
          <div className="flex items-center justify-center gap-4 mt-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-sm font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 transition-all"
            >
              Get Started Free →
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10 transition-all"
            >
              Open App
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-20">

        {/* Features Grid */}
        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Core Features</h2>
            <p className="text-white/40 max-w-lg mx-auto">
              Built for real teams. Designed for real productivity.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border ${f.border} bg-gradient-to-br ${f.color} p-6 hover:scale-[1.02] transition-transform`}
              >
                <div className="text-3xl mb-4">{f.emoji}</div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recommendations */}
        <section>
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Recommendations</h2>
            <p className="text-white/40 max-w-lg mx-auto">
              How to get the most out of this platform for your team.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recommendations.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-white/8 bg-white/3 p-6 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{r.icon}</span>
                  <h3 className="font-bold text-white text-base">{r.title}</h3>
                </div>
                <ul className="space-y-2">
                  {r.tips.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-sm text-white/55">
                      <span className="text-blue-400 mt-0.5">→</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="rounded-3xl border border-white/8 bg-gradient-to-br from-white/4 to-white/2 p-10">
          <h2 className="text-2xl font-bold text-center text-white mb-10">Platform Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "9+", label: "Core Features" },
              { value: "3", label: "User Roles" },
              { value: "∞", label: "Tasks & Projects" },
              { value: "100%", label: "Anonymous Chat" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl font-black bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {s.value}
                </div>
                <div className="text-white/50 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3">Coming Soon</h2>
            <p className="text-white/40">Features we&apos;re actively working on</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roadmap.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-5 py-3.5 hover:bg-white/5 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full ${item.dot} animate-pulse flex-shrink-0`} />
                <span className="text-white/70 text-sm">{item.label}</span>
                <span className="ml-auto text-xs text-blue-400/70 bg-blue-400/10 px-2 py-0.5 rounded-full capitalize">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-10">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Try It?</h2>
          <p className="text-white/40 mb-8 max-w-md mx-auto">
            Sign in or register your team today. Admin approval ensures only verified members join.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 py-3.5 text-sm font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 transition-all"
            >
              Sign In Now
            </Link>
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-bold hover:bg-white/10 transition-all"
            >
              Create Account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
