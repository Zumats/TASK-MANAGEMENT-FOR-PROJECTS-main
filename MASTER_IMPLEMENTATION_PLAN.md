# Task Management System — Master Implementation Plan
# Everything in one place: bugs, fixes, new features, files, and prompts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE OF CONTENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SECTION 1 — QUICK START (start here, do this first)
  SECTION 2 — ALL BUGS DIAGNOSED (root causes explained)
  SECTION 3 — ALL NEW FEATURES (what was added and why)
  SECTION 4 — FILE-BY-FILE APPLY GUIDE (exact steps)
  SECTION 5 — TECH STACK REFERENCE
  SECTION 6 — DATA MODELS (Zod schemas + Prisma)
  SECTION 7 — REAL DATA CONNECTIONS (swap mock → real API)
  SECTION 8 — MOBILE PARITY (React Native equivalents)
  SECTION 9 — FUTURE ROADMAP
  SECTION 10 — EXPERT AI PROMPT (paste into new Claude chat)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — QUICK START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Do these 4 steps in order. Each one takes < 2 minutes.

  STEP 1 — Replace AdminSettings
    FROM: web/src/components/AdminSettings.tsx  (your old file)
    TO:   AdminSettings.tsx                     (provided file)
    FIXES: Runtime TypeError crash + adds full settings panel

  STEP 2 — Replace Sidebar
    FROM: web/src/components/Sidebar.tsx        (your old file)
    TO:   Sidebar.tsx                           (provided file)
    ADDS: Collapsible Views dropdown + Notifications nav item

  STEP 3 — Add NotificationsView (new file)
    CREATE: web/src/components/NotificationsView.tsx
    FROM:   NotificationsView.tsx               (provided file)
    ADDS: Full-page notification center with filters + routing

  STEP 4 — Update app page
    FROM: web/src/app/app/page.tsx              (your old file)
    TO:   app-page.tsx                          (provided file)
    ADDS: Notification bell in topbar + wires all views together

  After these 4 steps, run:
    cd web && npm run dev

  You should see:
    ✓ Settings page loads without crashing
    ✓ Settings has 6 tabs: Notifications, Audit Log, Role Management,
      Export Center, System Preferences, Recommended Features
    ✓ Role Management renders all users without crashing
    ✓ Sidebar VIEWS section has a ▼ chevron that collapses/expands
    ✓ Notifications bell 🔔 in topbar with red badge count
    ✓ Clicking bell or sidebar Notifications → full notification page


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — ALL BUGS DIAGNOSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────────────────────────
BUG A — Runtime TypeError: Cannot read properties of undefined
         (reading 'replace') — AdminSettings[users.map()]
──────────────────────────────────────────────────────────────────────

  SYMPTOM:
    Page crashes with red error overlay when navigating to Settings →
    Role Management. Call stack points to users.map() in AdminSettings.

  ROOT CAUSE (one sentence):
    A string method (.replace, .toUpperCase, .split, or similar) was
    called directly on user.name or user.email, but at least one user
    in the database has name: null or email: undefined — which is valid
    data that the frontend never guarded against.

  WHAT THE CRASHING CODE LOOKED LIKE:
    users.map(user => (
      <div key={user.id}>
        {user.name.replace(' ', '_')}   ← CRASH: name is null
        {user.email.toUpperCase()}      ← CRASH: email is undefined
      </div>
    ))

  THE FIX — two null-safe helpers (in AdminSettings.tsx):
    function getInitials(name, email) {
      if (name && typeof name === 'string' && name.trim().length > 0) {
        return name.trim().split(' ').filter(Boolean)
          .map(p => p[0].toUpperCase()).slice(0, 2).join('')
      }
      if (email && typeof email === 'string') return email[0].toUpperCase()
      return '?'
    }

    function getDisplayName(name, email) {
      if (name && typeof name === 'string' && name.trim().length > 0)
        return name.trim()
      if (email && typeof email === 'string') return email
      return 'Unknown User'
    }

  ALSO APPLIED — data sanitization on load:
    const safe = rawUsers.map(u => ({
      ...u,
      name:  u.name  ?? null,  // undefined → null, prevents crashes
      email: u.email ?? null,
    }))

──────────────────────────────────────────────────────────────────────
BUG B — Duplicate React key warning: `first_10`
         in ProfilePage component
──────────────────────────────────────────────────────────────────────

  SYMPTOM:
    Console warning: "Encountered two children with the same key,
    `first_10`. Keys should be unique."

  ROOT CAUSE (one sentence):
    Keys were built as `${prefix}_${index}` where the same index
    appeared in two merged or paginated arrays — page 1 and page 2
    both produce index 10, colliding as `first_10`.

  WHAT THE CRASHING CODE LOOKED LIKE:
    items.map((item, index) => <div key={`first_${index}`}>...)
    // OR
    [...page1, ...page2].map((item, i) => <div key={`first_${i}`}>...)

  THE FIX:
    // Always use the item's unique ID as the key
    items.map(item => <div key={item.id}>...)

    // For paginated lists, deduplicate before rendering:
    const allItems = [...existingItems, ...newPage].filter(
      (item, index, self) =>
        index === self.findIndex(i => i.id === item.id)
    )

    // If items genuinely have no ID, use a stable composite:
    items.map(item => <div key={`${item.category}-${item.name}-${item.createdAt}`}>...)

  WHERE TO APPLY:
    Search your entire codebase for: key={`first_
    Replace every match with: key={item.id}
    Also check ProfilePage.tsx, any paginated list, any .concat() or
    spread of two arrays before a .map()

──────────────────────────────────────────────────────────────────────
BUG C — Admin role reverts to user role on page refresh
          when two browser tabs are open
──────────────────────────────────────────────────────────────────────

  SYMPTOM:
    Open tab 1 as admin, tab 2 as user. Refresh tab 1 → it shows as user.

  ROOT CAUSE (one sentence):
    The role is stored in localStorage or a Zustand persist() store
    shared across all tabs — tab 2's user overwrites tab 1's admin
    because localStorage is origin-scoped, not tab-scoped.

  COMMON PATTERNS CAUSING THIS:
    a) localStorage.setItem('user', JSON.stringify(user))
       → shared across ALL tabs. Last write wins.
    b) Zustand with persist({ name: 'user-store' })
       → same key for all tabs. Last write wins.
    c) /api/me called on mount but returns wrong user because HTTP
       cookie belongs to only one session at a time.

  THE FIX — auth.ts (NextAuth v5):
    callbacks: {
      jwt({ token, user }) {
        if (user) token.role = user.role   // bake role into JWT at login
        return token
      },
      session({ session, token }) {
        session.user.role = token.role as string  // expose to client
        return session
      }
    }

  THE FIX — middleware.ts (server-side route guard):
    import { auth } from '@/auth'
    export default auth((req) => {
      const isAdminRoute = req.nextUrl.pathname.startsWith('/admin')
      const role = req.auth?.user?.role
      if (isAdminRoute && role !== 'admin') {
        return NextResponse.redirect(new URL('/app', req.url))
      }
    })
    export const config = { matcher: ['/admin/:path*', '/app/:path*'] }

  RULES:
    • Role ALWAYS comes from server session (JWT claim) — never trust
      a role stored in localStorage, Zustand, or React state
    • Those stores are display caches only — never authorization gates
    • For dev/testing with two tabs: use sessionStorage (tab-isolated)
      instead of localStorage

  MOBILE FIX (Expo):
    // Use SecureStore — not AsyncStorage — for session tokens
    import * as SecureStore from 'expo-secure-store'
    await SecureStore.setItemAsync('session_token', token)
    // Re-derive role from token on every app resume — never cache role in memory

──────────────────────────────────────────────────────────────────────
BUG D — Settings page was an empty placeholder
──────────────────────────────────────────────────────────────────────

  SYMPTOM:
    Settings page showed: "More admin tools can be added here
    (roles, exports, audits)." — nothing functional.

  FIX: Full Settings panel built with 6 real tabs (see Section 3).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — ALL NEW FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────────────────────────
FEATURE 1 — Admin Notifications System (🔔)
──────────────────────────────────────────────────────────────────────

  WHERE:
    • Bell icon 🔔 in topbar (with red unread count badge)
    • "Notifications" button in ADMIN sidebar section (with badge)
    • Full page view: NotificationsView.tsx
    • Tab inside Settings: AdminSettings → Notifications tab

  WHAT IT SHOWS:
    Every system event logged with:
      - Colored icon per action type (✚ created, ✎ updated, ✕ deleted,
        ⇄ status changed, 🔑 role changed, ↗ login, ↙ logout…)
      - Actor name + action description + entity name (color highlighted)
      - Relative timestamp ("2m ago", "1h ago", "3d ago")
      - Source route path (e.g. /app/tasks/abc123)
      - Glowing blue unread dot on unread items

  INTERACTIONS:
    • Click any notification → navigates to the source record directly
    • Click marks item as read
    • "Mark all read" button
    • Manual ⟳ Refresh button
    • Auto-polls every 30 seconds

  FILTER TABS:
    All | Unread (N) | Tasks | Users | Auth

  ACTION TYPES TRACKED:
    task.created        task.updated        task.deleted
    task.status_changed task.assigned       user.created
    user.role_changed   user.deactivated    auth.login
    auth.logout

──────────────────────────────────────────────────────────────────────
FEATURE 2 — Full Settings Panel (6 tabs)
──────────────────────────────────────────────────────────────────────

  TAB 1 — Notifications (default, first tab)
    Shows the same notification list as NotificationsView
    Unread badge on the tab label
    Mark all read + individual read on click

  TAB 2 — Audit Log
    Full log of all activity, filterable by actor/action/entity
    Click any row → navigates to source route

  TAB 3 — Role Management
    Lists all users with avatar, display name (null-safe), join date
    Inline role selector: Viewer / User / Admin
    Confirm dialog before promoting to Admin ("grants elevated access")
    Saving indicator per user during role change

  TAB 4 — Export Center
    Export Activity Log → CSV
    Export Users → CSV
    Export Tasks → CSV
    Uses native browser download (no library needed)

  TAB 5 — System Preferences
    Default task priority (dropdown)
    Allow self-registration (toggle)
    Due date reminder window (dropdown: 1/2/3/7 days)
    Max attachment size (dropdown: 5/10/25/50 MB)
    Theme (Dark / Light / System)
    Save button with "✓ Saved!" confirmation

  TAB 6 — Recommended Features
    Grid of feature cards, each with:
      - Icon, name, description
      - Effort badge: Quick (green) / Medium (amber) / Large (red)
      - "Learn more →" button
    Features shown:
      Slack Integration, Email Digests, 2FA, Recurring Tasks,
      Time Tracking, Webhook Triggers, AI Suggestions, Public Board

──────────────────────────────────────────────────────────────────────
FEATURE 3 — Collapsible VIEWS Section in Sidebar
──────────────────────────────────────────────────────────────────────

  HOW IT WORKS:
    The VIEWS label now has a chevron (▼ / ▶) next to it
    Clicking the header toggles the section open/closed
    Smooth animation: max-height + opacity transition (0.25s ease)
    State is local — remembers open/closed within the session

  WHY:
    Saves vertical space in the sidebar when you're in admin views
    Keeps the sidebar organized and less cluttered


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — FILE-BY-FILE APPLY GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  FILES PROVIDED (download all from the outputs folder):
    AdminSettings.tsx       → replaces your current AdminSettings
    Sidebar.tsx             → replaces your current Sidebar
    NotificationsView.tsx   → new file, create it fresh
    app-page.tsx            → replaces web/src/app/app/page.tsx

  ──────────────────────────────────────
  FILE: AdminSettings.tsx
  ──────────────────────────────────────
  DESTINATION: web/src/components/AdminSettings.tsx
  ACTION: Replace

  What changed:
    ✓ FIXED  — users.map() no longer crashes on null/undefined name/email
    ✓ FIXED  — getInitials() and getDisplayName() are null-safe
    ✓ NEW    — Notifications tab (default) with unread badge
    ✓ NEW    — Audit Log tab with filter + click-to-navigate
    ✓ NEW    — Role Management tab with confirm dialog for admin promo
    ✓ NEW    — Export Center (CSV for users, tasks, activity log)
    ✓ NEW    — System Preferences with real toggles and dropdowns
    ✓ NEW    — Recommended Features grid

  ──────────────────────────────────────
  FILE: Sidebar.tsx
  ──────────────────────────────────────
  DESTINATION: web/src/components/Sidebar.tsx
  ACTION: Replace

  What changed:
    ✓ NEW    — "Notifications" added to ADMIN nav (with badge count)
    ✓ NEW    — VIEWS section is now collapsible (▼ chevron toggle)
    ✓ NEW    — Smooth open/close animation on VIEWS section
    ✓ NEW    — notificationCount prop for badge display
    ✓ NEW    — Proper TypeScript props interface

  ──────────────────────────────────────
  FILE: NotificationsView.tsx  (NEW)
  ──────────────────────────────────────
  DESTINATION: web/src/components/NotificationsView.tsx
  ACTION: Create new file

  What it contains:
    ✓ Full-page notification center
    ✓ Filter tabs: All / Unread / Tasks / Users / Auth
    ✓ Unread dot + unread count badge
    ✓ Click any item → navigates to routePath
    ✓ Mark all read / per-item read on click
    ✓ Auto-poll every 30s + manual Refresh button
    ✓ Empty state message

  ──────────────────────────────────────
  FILE: app-page.tsx
  ──────────────────────────────────────
  DESTINATION: web/src/app/app/page.tsx
  ACTION: Replace (merge if you have extra custom logic in your current file)

  What changed:
    ✓ NEW    — "notifications" added to AdminView type + switch
    ✓ NEW    — Notification bell 🔔 in topbar with badge
    ✓ NEW    — Bell click routes to NotificationsView
    ✓ NEW    — notificationCount passed to Sidebar as prop
    ✓ NEW    — All views code-split with next/dynamic


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — TECH STACK REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Layer             Library / Tool              Purpose
  ─────────────────────────────────────────────────────────────────
  Framework         Next.js 14+ (App Router)    File routing, SSR, RSC
  Language          TypeScript strict mode       Type safety, z.infer<>
  Styling           Tailwind CSS                 Utility classes
  Animation         Framer Motion               Spring physics, layout
  Animation         GSAP + ScrollTrigger         Timelines, loops, scroll
  Components        shadcn/ui + Radix UI         Accessible primitives
  Components        Aceternity UI, Magic UI      Animated moving effects
  Drag & Drop       @dnd-kit/core + sortable     Kanban reordering
  Carousel          Swiper.js / Embla            Infinite loop strips
  Command Palette   cmdk                         ctrl+k search bar
  Shortcuts         react-hotkeys-hook           Keyboard shortcuts
  State (client)    Zustand + devtools           Global UI state
  State (server)    TanStack Query v5            API cache, optimistic UI
  Validation        Zod                          Runtime schema safety
  API               tRPC                         End-to-end type-safe API
  Auth              NextAuth.js v5               JWT, roles, sessions
  ORM               Prisma + PostgreSQL           Database layer
  Realtime          Supabase Realtime            Live multi-user sync
  Testing (unit)    Vitest                       Store + schema tests
  Testing (E2E)     Playwright                   Full flow automation
  Linting           ESLint strict + Prettier     Code quality
  Virtualization    @tanstack/react-virtual      Lists > 50 items
  Mobile            React Native + Expo SDK 51   iOS + Android
  Mobile Styling    NativeWind                   Tailwind on native
  Mobile Animation  Reanimated 3                 60fps native thread
  Mobile Auth       expo-secure-store            Encrypted token storage


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — DATA MODELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ── Zod Task Schema ──────────────────────────────────────────────

  import { z } from 'zod'

  export const TaskStatus   = z.enum(['backlog','todo','in_progress','review','done','cancelled'])
  export const TaskPriority = z.enum(['low','medium','high','urgent'])

  export const TaskSchema = z.object({
    id:          z.string().cuid(),
    title:       z.string().min(1).max(280),
    description: z.string().max(5000).optional(),
    status:      TaskStatus,
    priority:    TaskPriority,
    assigneeId:  z.string().cuid().optional(),
    projectId:   z.string().cuid().optional(),
    tags:        z.array(z.string()).default([]),
    dueDate:     z.date().optional(),
    order:       z.number().int(),         // drag-and-drop sort position
    parentId:    z.string().cuid().optional(), // for subtasks
    createdAt:   z.date(),
    updatedAt:   z.date(),
  })

  export type Task         = z.infer<typeof TaskSchema>
  export type TaskStatus   = z.infer<typeof TaskStatus>
  export type TaskPriority = z.infer<typeof TaskPriority>

  ── Prisma ActivityLog Schema ─────────────────────────────────────

  model ActivityLog {
    id          String   @id @default(cuid())
    actorId     String
    actorName   String
    actorRole   String
    action      String    // "task.created", "user.role_changed", etc.
    entityType  String    // "task", "user", "project", "auth"
    entityId    String    // affected record ID
    entityTitle String    // human-readable name
    meta        Json?     // { from: "todo", to: "done" }
    routePath   String    // "/app/tasks/abc" — for click-to-navigate
    isRead      Boolean   @default(false)
    createdAt   DateTime  @default(now())

    @@index([actorId])
    @@index([createdAt])
    @@index([isRead])
  }

  ── Activity Log Helper ───────────────────────────────────────────

  // lib/activity.ts — call this after EVERY mutation

  export const ACTIONS = {
    TASK_CREATED:        'task.created',
    TASK_UPDATED:        'task.updated',
    TASK_DELETED:        'task.deleted',
    TASK_STATUS_CHANGED: 'task.status_changed',
    TASK_ASSIGNED:       'task.assigned',
    USER_CREATED:        'user.created',
    USER_ROLE_CHANGED:   'user.role_changed',
    USER_DEACTIVATED:    'user.deactivated',
    LOGIN:               'auth.login',
    LOGOUT:              'auth.logout',
  } as const

  export async function logActivity(params: {
    actorId:     string
    actorName:   string
    actorRole:   string
    action:      string
    entityType:  string
    entityId:    string
    entityTitle: string
    meta?:       Record<string, unknown>
    routePath:   string
  }) {
    await db.activityLog.create({ data: params })
    // If using Supabase:
    // await supabase.from('activity_logs').insert(params)
  }


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — REAL DATA CONNECTIONS (swap mock → real API)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  The provided components use MOCK data so they work immediately.
  When your backend is ready, replace these blocks:

  ── In AdminSettings.tsx — user loading ──────────────────────────

  // REPLACE the setTimeout block in useEffect with:
  useEffect(() => {
    async function loadUsers() {
      const res  = await fetch('/api/admin/users')
      const data = await res.json()
      const safe = data.map((u: any) => ({
        ...u,
        name:  u.name  ?? null,
        email: u.email ?? null,
        role:  u.role  ?? 'user',
      }))
      setUsers(safe)
      setLoading(false)
    }
    loadUsers()
  }, [])

  // Your API route (app/api/admin/users/route.ts):
  export async function GET() {
    const users = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    })
    return Response.json(users)
  }

  ── In NotificationsView.tsx — activity log fetching ─────────────

  // REPLACE the refresh function with:
  const refresh = async () => {
    setRefreshing(true)
    const res  = await fetch('/api/admin/activity')
    const data = await res.json()
    setNotes(data)
    setRefreshing(false)
  }

  // Your API route (app/api/admin/activity/route.ts):
  export async function GET() {
    const logs = await db.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    })
    return Response.json(logs)
  }

  ── In app-page.tsx — live notification count ────────────────────

  // REPLACE the hardcoded notificationCount = 2 with:
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn:  async () => {
      const res  = await fetch('/api/admin/activity/unread-count')
      const data = await res.json()
      return data.count
    },
    refetchInterval: 30000  // poll every 30s
  })


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — MOBILE PARITY (React Native / Expo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Apply the same null-safety fix to every React Native screen
  that renders user data:

  // WRONG — crashes if name is undefined:
  <Text>{user.name.toUpperCase()}</Text>

  // CORRECT:
  <Text>{user.name?.trim() || user.email || 'Unknown'}</Text>

  // Initials for avatar on mobile:
  const initials = user.name
    ? user.name.trim().split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : user.email?.[0]?.toUpperCase() ?? '?'

  ── Auth fix on mobile (role persistence) ────────────────────────

  // WRONG — AsyncStorage is not encrypted and not safe for tokens:
  await AsyncStorage.setItem('token', token)

  // CORRECT — SecureStore is encrypted at rest:
  import * as SecureStore from 'expo-secure-store'
  await SecureStore.setItemAsync('session_token', token)

  // On app resume — always re-derive role from token:
  const token = await SecureStore.getItemAsync('session_token')
  const decoded = jwtDecode(token)       // decode JWT
  const role = decoded.role              // read role from JWT claim
  // NEVER cache role in useState or AsyncStorage alone

  ── Notifications on mobile ──────────────────────────────────────

  // Add a badge on the admin tab icon:
  import { useQuery } from '@tanstack/react-query'

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn:  fetchUnreadCount,
    refetchInterval: 30000,
  })

  // In your bottom tab navigator:
  <Tab.Screen
    name="Notifications"
    options={{
      tabBarBadge: unreadCount > 0 ? unreadCount : undefined
    }}
  />

  // For push notifications on critical events (expo-notifications):
  import * as Notifications from 'expo-notifications'

  // Call this after logActivity() on the server for critical events:
  await sendPushNotification({
    token: user.expoPushToken,
    title: 'Task overdue',
    body:  `"${task.title}" is past its due date`,
    data:  { routePath: `/app/tasks/${task.id}` }
  })


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — FUTURE ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Priority  Feature                         Effort   Notes
  ────────────────────────────────────────────────────────────────
  1         Real API for users + activity    Quick    Replace mocks in Section 7
  2         Real-time via Supabase           Medium   Replace 30s poll with socket
  3         logActivity() on all mutations   Medium   Hook into every CRUD route
  4         Kanban drag-and-drop             Medium   @dnd-kit + optimistic order
  5         Subtasks (parentId)              Medium   Nested task support
  6         Command palette (ctrl+k)         Quick    cmdk library
  7         Keyboard shortcuts               Quick    react-hotkeys-hook
  8         Inline task editing              Medium   Click title to edit
  9         Due date + overdue alerts        Medium   Color red when overdue
  10        Export full task list to CSV     Quick    Extend Export Center tab
  11        Slack / email notifications      Large    Resend + Slack webhook
  12        Two-factor auth (2FA)            Large    TOTP via otplib
  13        Recurring tasks                  Large    Cron on server
  14        Time tracking                    Large    Start/stop timer per task
  15        AI task suggestions              Large    OpenAI API integration
  16        Public read-only task board      Medium   Shareable link with token


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — EXPERT AI PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  HOW TO USE:
    1. Open a brand new Claude conversation
    2. Paste everything between the ═══ lines below (including those lines)
    3. Claude will immediately tell you which files to share
    4. Share your files one at a time — Claude fixes each one immediately

─────────────────────────────────────────────────────────────────────
PASTE THIS INTO CLAUDE:
─────────────────────────────────────────────────────────────────────

You are a Senior Full-Stack Engineer with 12+ years building production task
management systems. You diagnose root causes before touching any code, always
think in layers (schema → store → API → UI → animation → test), and never use
`any` in TypeScript.

TECH STACK FOR THIS PROJECT:
  Next.js 14+ App Router, TypeScript strict, Tailwind CSS, Framer Motion,
  GSAP, shadcn/ui, @dnd-kit, Zustand, TanStack Query v5, Zod, tRPC,
  NextAuth.js v5, Prisma + PostgreSQL, Supabase Realtime,
  React Native + Expo SDK 51+, NativeWind, Reanimated 3, Vitest, Playwright

CONFIRMED BUGS IN THIS PROJECT (fix when shown code):

BUG A — RuntimeTypeError in AdminSettings[users.map()]
  Root cause: String method called on user.name or user.email that is null/undefined.
  Fix: Always use null-safe wrappers:
    getInitials(name, email): check typeof + trim before splitting
    getDisplayName(name, email): fallback chain name → email → 'Unknown User'
    Sanitize API response: rawUsers.map(u => ({ ...u, name: u.name ?? null }))

BUG B — Duplicate React key `first_10` in ProfilePage
  Root cause: key built as `${prefix}_${index}` — same index in two merged arrays.
  Fix: Always key={item.id}. Deduplicate paginated arrays before rendering.

BUG C — Admin role reverts to user on refresh (two tabs)
  Root cause: Role stored in localStorage/Zustand shared across tabs.
  Fix: Role must come from server JWT on every request. Use NextAuth callbacks to
  bake role into JWT. Protect routes in middleware.ts, not client-side guards.
  On mobile: use expo-secure-store, re-derive role from JWT on every app resume.

BEHAVIOR RULES (follow on every single response):
  1. Diagnose root cause in ONE sentence before writing any code.
  2. Schema before UI. Zod schema before API route. API before component.
  3. TypeScript strict — no any, use z.infer<> for all types.
  4. Zod validates all API inputs, form data, and env vars — always.
  5. Role = server responsibility. Never trust localStorage or React state for authz.
  6. Optimistic UI on all mutations (TanStack Query onMutate/onError/onSettled).
  7. Virtualize lists > 50 items. React.memo on all list item components.
  8. Every mutation must call logActivity() — remind me if I forget.
  9. After every web feature, describe the React Native equivalent.
  10. Recommend one path — explain trade-off in one sentence, then implement it.

PROJECT CONTEXT (from screenshots):
  Next.js app at localhost:3000/app. Role-based auth: admin / user.
  Sidebar: Dashboard, Assign Task, All Tasks, Accounts, Analytics,
           Notifications (NEW), Settings
  Views: All Tasks, Recently Created, Latest Activity, Overdue Tasks,
         Shared with Users, Shared with Me (now collapsible dropdown)
  Settings tabs: Notifications, Audit Log, Role Management, Export,
                 System Preferences, Recommended Features
  Notification bell 🔔 in topbar with unread badge count.

TASK SCHEMA:
  { id(cuid), title(1-280), description(5000)?, status, priority,
    assigneeId?, projectId?, tags[], dueDate?, order(DnD), parentId?,
    createdAt, updatedAt }
  Status: backlog → todo → in_progress → review → done | cancelled
  Priority: low | medium | high | urgent

SESSION START:
  Do NOT ask setup questions.
  State: "I have read all bugs (A, B, C). Share these files to begin:"
  Then list: auth.ts, middleware.ts, ProfilePage.tsx, AdminSettings.tsx
  Ask: "Which bug do you want fixed first? Share that file."

─────────────────────────────────────────────────────────────────────
END OF PASTE
─────────────────────────────────────────────────────────────────────

  POWER PROMPTS — copy-paste these during your session:

  "Here is my auth.ts — find and fix the role persistence bug"
  "Here is ProfilePage.tsx — find and fix all duplicate key warnings"
  "Here is my AdminSettings — apply the null-safe user.name fix"
  "Connect the Notifications tab to /api/admin/activity"
  "Connect the Role Management tab to /api/admin/users with real fetch"
  "Add logActivity() calls to all my task mutation routes"
  "Build the Prisma ActivityLog migration for my schema.prisma"
  "Apply the SecureStore auth fix to my Expo mobile app"
  "Write Vitest unit tests for getInitials() and getDisplayName()"
  "Write Playwright E2E: admin refreshes tab — role must stay admin"
  "Build the unread notification count API route with Prisma"
  "Add real-time notification updates using Supabase Realtime"
