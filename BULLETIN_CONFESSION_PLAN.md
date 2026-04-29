# Bulletin Board & Confession Chat — Master Implementation Plan
# For: Task Management System (Next.js + React Native + Supabase)
# Version: 1.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE OF CONTENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SECTION 1  — FEATURE OVERVIEW & DESIGN DECISIONS
  SECTION 2  — COMPLETE DATA MODELS (Prisma + Zod)
  SECTION 3  — BULLETIN BOARD: Full Spec
  SECTION 4  — CONFESSION CHAT: Full Spec
  SECTION 5  — REACTIONS & PINNING SYSTEM: Full Spec
  SECTION 6  — RECOMMENDED ADDITIONAL FEATURES
  SECTION 7  — API ROUTES (all endpoints)
  SECTION 8  — COMPONENT TREE (file structure)
  SECTION 9  — BUILD ORDER (phase-by-phase)
  SECTION 10 — MOBILE PARITY (React Native)
  SECTION 11 — TESTING CHECKLIST
  SECTION 12 — EXPERT AI PROMPT (paste into Claude)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — FEATURE OVERVIEW & DESIGN DECISIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  TWO MAJOR FEATURES
  ──────────────────

  A. BULLETIN BOARD
     A public-facing announcement and events board inside the app.
     Admin can create/edit/delete/pin announcements and events.
     Users can only read — no posting, no editing, no deleting.
     Think: company noticeboard, team announcements, event calendar.

  B. CONFESSION CHAT
     A fully anonymous group chat room where everyone joins under a
     randomly generated alias (e.g. "SilentPanda_42"). The real
     identity is hidden from everyone including admins in the UI.
     Confessions can receive emoji reactions. The most-reacted
     confession is automatically pinned to the top of the chat.
     Think: anonymous feedback wall + group chat hybrid.

  KEY DESIGN DECISIONS
  ────────────────────

  1. Bulletin Board and Confession Chat are SEPARATE features.
     They live in separate sidebar nav items and separate routes.
     They share some UI components (ReactionBar, PinnedBanner) but
     have completely separate data models.

  2. Confession anonymity is "soft anonymous" by default:
     The real userId IS stored in the database (for moderation/admin),
     but the display name shown in the UI is always the random alias.
     Admins CAN reveal identity if they need to for safety — but this
     requires a deliberate action and should be logged.

  3. Reactions use an emoji reaction system (not just a like count).
     Multiple emoji types per post. One reaction type per user per post.
     Reactions are visible to all — they are NOT anonymous.

  4. "Most reacted" pin: the confession with the highest total reaction
     count is auto-pinned. Ties broken by most recent. Pin updates
     in real-time via Supabase or polling.

  5. Bulletin Board events have a start/end date and a type
     (announcement, event, deadline, holiday). Events can optionally
     appear in the Calendar view of the task manager.

  NEW SIDEBAR ITEMS TO ADD
  ────────────────────────
  Under VIEWS section:
    📋 Bulletin Board     → /app/bulletin
    💬 Confession Chat    → /app/confessions


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — COMPLETE DATA MODELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ── PRISMA SCHEMA (add to schema.prisma) ─────────────────────────

  // ─── BULLETIN BOARD ───────────────────────────────────────────

  enum AnnouncementType {
    ANNOUNCEMENT
    EVENT
    DEADLINE
    HOLIDAY
    URGENT
  }

  model Announcement {
    id          String           @id @default(cuid())
    title       String           @db.VarChar(200)
    body        String           @db.Text
    type        AnnouncementType @default(ANNOUNCEMENT)
    isPinned    Boolean          @default(false)
    isPublished Boolean          @default(true)
    coverImage  String?          // optional URL
    eventStart  DateTime?        // for EVENT type
    eventEnd    DateTime?        // for EVENT type
    authorId    String
    author      User             @relation(fields: [authorId], references: [id])
    createdAt   DateTime         @default(now())
    updatedAt   DateTime         @updatedAt

    @@index([isPinned])
    @@index([isPublished])
    @@index([type])
    @@index([eventStart])
  }

  // ─── CONFESSION CHAT ──────────────────────────────────────────

  model ConfessionAlias {
    id          String       @id @default(cuid())
    userId      String       @unique   // one alias per user, stable
    alias       String       @unique   // e.g. "SilentPanda_42"
    avatarColor String                 // hex color for avatar bubble
    createdAt   DateTime     @default(now())
    user        User         @relation(fields: [userId], references: [id])
    confessions Confession[]
    reactions   ConfessionReaction[]
  }

  model Confession {
    id          String               @id @default(cuid())
    body        String               @db.VarChar(1000)
    aliasId     String               // links to ConfessionAlias (NOT userId)
    alias       ConfessionAlias      @relation(fields: [aliasId], references: [id])
    isPinned    Boolean              @default(false)
    isHidden    Boolean              @default(false) // admin moderation
    replyToId   String?              // for threaded replies
    replyTo     Confession?          @relation("Replies", fields: [replyToId], references: [id])
    replies     Confession[]         @relation("Replies")
    reactions   ConfessionReaction[]
    totalReacts Int                  @default(0)    // denormalized for fast sort
    createdAt   DateTime             @default(now())
    updatedAt   DateTime             @updatedAt

    @@index([isPinned])
    @@index([totalReacts(sort: Desc)])
    @@index([createdAt(sort: Desc)])
    @@index([aliasId])
  }

  model ConfessionReaction {
    id           String          @id @default(cuid())
    confessionId String
    aliasId      String          // reactor's alias (stays anonymous)
    emoji        String          // "❤️" | "😂" | "🔥" | "😮" | "👏" | "💀"
    createdAt    DateTime        @default(now())
    confession   Confession      @relation(fields: [confessionId], references: [id], onDelete: Cascade)
    alias        ConfessionAlias @relation(fields: [aliasId], references: [id])

    @@unique([confessionId, aliasId, emoji])  // one per emoji type per user
    @@index([confessionId])
    @@index([aliasId])
  }

  // ─── ZOD SCHEMAS ──────────────────────────────────────────────

  import { z } from 'zod'

  // Bulletin Board
  export const AnnouncementTypeSchema = z.enum([
    'ANNOUNCEMENT', 'EVENT', 'DEADLINE', 'HOLIDAY', 'URGENT'
  ])

  export const AnnouncementSchema = z.object({
    id:          z.string().cuid(),
    title:       z.string().min(1).max(200),
    body:        z.string().min(1).max(10000),
    type:        AnnouncementTypeSchema,
    isPinned:    z.boolean().default(false),
    isPublished: z.boolean().default(true),
    coverImage:  z.string().url().optional(),
    eventStart:  z.date().optional(),
    eventEnd:    z.date().optional(),
    authorId:    z.string().cuid(),
    createdAt:   z.date(),
    updatedAt:   z.date(),
  })

  export const CreateAnnouncementSchema = AnnouncementSchema.omit({
    id: true, authorId: true, createdAt: true, updatedAt: true
  })

  export const UpdateAnnouncementSchema = AnnouncementSchema
    .partial()
    .required({ id: true })

  // Confession Chat
  export const CONFESSION_EMOJIS = ['❤️','😂','🔥','😮','👏','💀'] as const
  export const ConfessionEmojiSchema = z.enum(CONFESSION_EMOJIS)

  export const ConfessionSchema = z.object({
    id:          z.string().cuid(),
    body:        z.string().min(1).max(1000),
    aliasId:     z.string().cuid(),
    alias:       z.string(),           // display alias name
    avatarColor: z.string(),           // display color
    isPinned:    z.boolean(),
    isHidden:    z.boolean(),
    replyToId:   z.string().cuid().optional(),
    totalReacts: z.number().int(),
    createdAt:   z.date(),
  })

  export const CreateConfessionSchema = z.object({
    body:      z.string().min(1).max(1000),
    replyToId: z.string().cuid().optional(),
  })

  export const ReactToConfessionSchema = z.object({
    confessionId: z.string().cuid(),
    emoji:        ConfessionEmojiSchema,
  })

  export type Announcement       = z.infer<typeof AnnouncementSchema>
  export type Confession         = z.infer<typeof ConfessionSchema>
  export type AnnouncementType   = z.infer<typeof AnnouncementTypeSchema>


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — BULLETIN BOARD: FULL SPEC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ROUTE:  /app/bulletin

  ── WHAT USERS SEE ───────────────────────────────────────────────

  Layout: Two-column on desktop, single-column on mobile
    LEFT  → Pinned announcements (always visible at top)
    RIGHT → Chronological feed of all published announcements

  Each announcement card shows:
    • Type badge (color-coded pill): ANNOUNCEMENT / EVENT / DEADLINE
                                     / HOLIDAY / URGENT
    • Title (bold, large)
    • Body text (truncated to 3 lines, "Read more" expands)
    • Optional cover image (16:9 ratio, rounded)
    • Author name + avatar
    • Timestamp (relative: "2 hours ago")
    • For EVENT type: date/time range with calendar icon
    • Pin indicator 📌 if isPinned

  Type badge colors:
    ANNOUNCEMENT  → blue
    EVENT         → purple
    DEADLINE      → red
    HOLIDAY       → green
    URGENT        → orange/amber, pulsing border animation

  Filter bar at top (user-facing):
    [ All ] [ Announcements ] [ Events ] [ Deadlines ] [ Urgent ]
    + date range picker for Events

  ── WHAT ADMINS SEE (extra controls) ─────────────────────────────

  "+ New Announcement" button at top right

  Each card has an admin action menu (⋮ dropdown):
    • Edit
    • Pin / Unpin
    • Publish / Unpublish (draft mode)
    • Delete (with confirmation)

  Admin create/edit form (modal or slide-over panel):
    Field         Type              Validation
    ─────────────────────────────────────────
    Title         text input        required, max 200
    Body          rich text / md    required, max 10000
    Type          dropdown          required
    Cover Image   URL input         optional, valid URL
    Event Start   datetime picker   required if type=EVENT
    Event End     datetime picker   optional, must be after start
    Is Pinned     toggle            optional
    Is Published  toggle            default true

  Admin can have max 3 pinned announcements at once.
  Pinning a 4th automatically unpins the oldest pinned.

  ── ADMIN CRUD RULES ─────────────────────────────────────────────

  CREATE:  POST /api/bulletin          role=admin only
  READ:    GET  /api/bulletin          all authenticated users
  UPDATE:  PATCH /api/bulletin/[id]    role=admin only
  DELETE:  DELETE /api/bulletin/[id]   role=admin only
  PIN:     PATCH /api/bulletin/[id]/pin  role=admin only

  All mutations logged to ActivityLog:
    action: 'bulletin.created' | 'bulletin.updated' | 'bulletin.deleted'
           | 'bulletin.pinned' | 'bulletin.unpinned'
    routePath: '/app/bulletin'

  ── UI INTERACTIONS ──────────────────────────────────────────────

  • Clicking a card expands it inline (accordion) OR opens a detail
    modal — designer choice. Recommended: modal for richer content.
  • Pinned cards have a subtle shimmer/glow border (CSS animation).
  • URGENT type cards have a pulsing red border animation.
  • New announcements (< 24h old) show a "NEW" badge.
  • Admin unpublished drafts show with reduced opacity + "Draft" badge,
    visible to admin only.
  • Smooth Framer Motion card entrance animation on load.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — CONFESSION CHAT: FULL SPEC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ROUTE:  /app/confessions

  ── ALIAS GENERATION (one-time per user) ─────────────────────────

  When a user first visits /app/confessions, the system:
    1. Checks if they have a ConfessionAlias in the database
    2. If NOT → generates a random alias and assigns a color
    3. Shows a "Welcome" modal: "You're joining as [SilentPanda_42]"
    4. Alias is permanent — same alias every time they return
       (This creates a consistent anonymous identity, not one-time)

  Alias generation algorithm:
    const ADJECTIVES = ['Silent','Cosmic','Mystic','Neon','Shadow',
      'Ancient','Electric','Phantom','Velvet','Quantum', ... (50+)]
    const ANIMALS    = ['Panda','Tiger','Raven','Fox','Wolf','Otter',
      'Hawk','Cobra','Lynx','Crane', ... (50+)]
    const num        = Math.floor(Math.random() * 99) + 1

    alias = `${randomAdjective}${randomAnimal}_${num}`
    // e.g. "SilentPanda_42", "CosmicFox_7", "NeonRaven_99"

  Avatar color: assigned from a preset palette of 20 colors,
    chosen by: colorPalette[hashUserId(userId) % 20]
    (deterministic so the same user always gets the same color)

  Alias format rules:
    - Must be globally unique (retry if collision)
    - 3-30 characters total
    - No real name parts (do not use user.name or user.email)
    - Never changes after assignment (permanent identity)

  ── CHAT LAYOUT ──────────────────────────────────────────────────

  Page layout:
    TOP    → Pinned confession banner (if exists) — always visible
    MIDDLE → Scrollable confession feed (newest at bottom, like chat)
    BOTTOM → Compose bar (text input + submit button)

  Each confession message shows:
    • Color avatar bubble with alias initials (e.g. "SP" for SilentPanda)
    • Alias name (bold, colored to match avatar)
    • Message body (max 1000 chars)
    • Timestamp (relative)
    • Reaction bar: [ ❤️ 12 ] [ 😂 5 ] [ 🔥 3 ] [ + ]
    • Reply button → opens threaded reply
    • 📌 PIN badge if this is the top-pinned confession
    • Admin-only: 🚫 Hide button (soft-delete from view)

  Compose bar:
    • Text area (max 1000 chars, char counter shown at 800+)
    • Your alias shown: "Posting as SilentPanda_42"
    • Submit button (Enter to send, Shift+Enter for newline)
    • Anonymous reminder: "Your real identity is hidden from everyone"

  ── PINNING LOGIC (auto-pin most reacted) ────────────────────────

  The TOP-PINNED confession is automatically determined:
    SELECT * FROM Confession
    WHERE isHidden = false
    ORDER BY totalReacts DESC, createdAt DESC
    LIMIT 1

  Pin banner shows at top of page:
    📌 "Most Loved Confession" → shows the confession content,
    alias, reaction counts, and a "Jump to message" button.

  Pin updates:
    - Recalculated after every reaction add/remove
    - Real-time via Supabase or 10s polling
    - Animated entrance: slides down from top when it changes

  Manual admin pin:
    Admins can ALSO manually pin a specific confession regardless
    of reaction count. Manual pin overrides the auto-pin.
    Manual pin is cleared if admin unpins it, reverting to auto.

  ── REACTIONS SYSTEM ─────────────────────────────────────────────

  Available emojis: ❤️  😂  🔥  😮  👏  💀

  Rules:
    • User can react with MULTIPLE different emojis on one confession
    • User can react with each emoji ONLY ONCE per confession
    • Clicking an emoji you already reacted with → REMOVES your reaction
    • Reaction counts shown next to each emoji
    • Reacting as anonymous — the reactor's alias is stored but
      the reaction count display shows aggregate (not who reacted)
    • Hovering a reaction count shows tooltip: "SilentPanda + 4 others"
      (shows your alias if you reacted, anonymized for others)

  totalReacts field:
    Denormalized sum of all reactions on that confession.
    Updated via Prisma transaction:
      await db.$transaction([
        db.confessionReaction.create({ data: reactionData }),
        db.confession.update({
          where: { id: confessionId },
          data: { totalReacts: { increment: 1 } }
        })
      ])

  ── THREADED REPLIES ─────────────────────────────────────────────

  Clicking "Reply" on a confession:
    • Opens an indented sub-thread below that confession
    • Shows existing replies in that thread
    • Compose bar changes to "Replying to CosmicFox_7..."
    • Reply appears indented under parent
    • Replies can also receive reactions
    • Max 1 level of threading (replies cannot be replied to)
      — keeps the chat readable

  ── ADMIN MODERATION ─────────────────────────────────────────────

  Admins see a 🚫 Hide button on every confession.
    • Hiding sets isHidden = true — removes from public feed
    • Hidden confessions show as "[Removed by moderator]" placeholder
      visible to admin only in a faded state
    • Unhide restores the confession
    • Logged to ActivityLog: action = 'confession.hidden'

  Admin identity revelation (opt-in, audit-logged):
    In admin panel Settings → Audit Log, admins can see a special
    "Confession Audit" section. To reveal who posted a confession:
      1. Admin clicks "Reveal identity" on a hidden/flagged confession
      2. Confirmation dialog: "This action is logged. Reveal real user?"
      3. Shows real user name + email
      4. Logged to ActivityLog: action = 'confession.identity_revealed'
         with the confessionId, adminId, and timestamp

  Flagging system (user-initiated):
    Users can flag a confession as inappropriate (🚩 button).
    Flag increments a flagCount on the confession.
    Confessions with flagCount >= 3 get a yellow border in admin view.
    Admin is notified via the notification system.

  ── CHAT REAL-TIME ───────────────────────────────────────────────

  New confessions appear in real-time:
    Option A (preferred): Supabase Realtime channel subscription
      supabase.channel('confessions')
        .on('postgres_changes', { event: 'INSERT', table: 'Confession' },
          (payload) => addConfessionToFeed(payload.new))
        .subscribe()

    Option B (simpler): Poll every 5 seconds
      useQuery({ queryKey: ['confessions'], refetchInterval: 5000 })

  Typing indicator: show "Someone is typing..." when any user
  is composing (debounced, via Supabase presence channel).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — REACTIONS & PINNING SYSTEM: FULL SPEC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ── REACTION BAR COMPONENT ───────────────────────────────────────

  // ReactionBar.tsx — reusable, works on confessions AND announcements

  Props:
    confessionId: string
    reactions: { emoji: string; count: number; reacted: boolean }[]
    onReact: (emoji: string) => void

  Visual states:
    Default:     gray background, gray count
    Reacted:     colored background matching emoji tone, bold count
    Hover:       slight scale-up (1.1x) with CSS transform
    Animation:   count increments with a +1 pop animation

  Emoji color map (background when reacted):
    ❤️  → rose-100   / rose-800 text
    😂  → yellow-100 / yellow-800
    🔥  → orange-100 / orange-800
    😮  → blue-100   / blue-800
    👏  → green-100  / green-800
    💀  → gray-100   / gray-800

  ── AUTO-PIN ALGORITHM ───────────────────────────────────────────

  Runs after every reaction change:

    async function refreshPin() {
      const topConfession = await db.confession.findFirst({
        where:   { isHidden: false },
        orderBy: [{ totalReacts: 'desc' }, { createdAt: 'desc' }],
      })

      // Clear all auto-pins first (don't clear manual admin pins)
      await db.confession.updateMany({
        where: { isPinned: true, isManualPin: false },
        data:  { isPinned: false }
      })

      // Set new top as pinned
      if (topConfession && topConfession.totalReacts > 0) {
        await db.confession.update({
          where: { id: topConfession.id },
          data:  { isPinned: true, isManualPin: false }
        })
      }
    }

  Note: add isManualPin: Boolean @default(false) to Confession model
  so admin manual pins are not overwritten by auto-pin.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 6 — RECOMMENDED ADDITIONAL FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  These are recommended additions that make both features significantly
  better. Organized by effort and impact.

  ── HIGH IMPACT, QUICK TO BUILD ──────────────────────────────────

  1. ANNOUNCEMENT READ RECEIPTS
     Track which users have seen each announcement.
     Show admin: "Seen by 12/20 users" on each card.
     Show users: checkmark ✓ when they've read it.
     Model: AnnouncementRead { userId, announcementId, readAt }
     UI: Small avatar stack of who's read it (admin view only).

  2. CONFESSION BOOKMARKS / SAVED
     Users can privately bookmark confessions they want to revisit.
     Bookmarks are private — only visible to that user.
     "My Saved" tab in the confession page.
     Model: ConfessionBookmark { aliasId, confessionId, savedAt }

  3. ANNOUNCEMENT COMMENTS (read-only confessions are boring)
     Allow users to COMMENT on announcements — but using their
     REAL name (not anonymous). Encourages genuine discussion.
     Admin can disable comments per announcement.
     Model: AnnouncementComment { id, body, authorId, announcementId }

  4. TRENDING / HOT BADGE
     Confession with most reactions in the last 1 hour gets a
     🔥 "Trending" badge regardless of all-time pin.
     Separate from the pinned system — shows in the feed inline.
     Calculated: reactions created WHERE createdAt > now() - 1hr

  5. @ALIAS MENTIONS IN CONFESSIONS
     Type @S to get alias autocomplete dropdown.
     Mentioned alias gets a notification (still anonymous — just says
     "Someone mentioned you in a confession").
     Highlight @SilentPanda_42 in blue in rendered message.

  ── MEDIUM IMPACT, MEDIUM EFFORT ─────────────────────────────────

  6. CONFESSION CATEGORIES / TOPICS
     When posting, user optionally picks a topic tag:
     [ Rant ] [ Question ] [ Appreciation ] [ Idea ] [ Story ] [ Other ]
     Filter bar in chat lets users filter by topic.
     Topic shows as a colored pill on each message.

  7. ANNOUNCEMENT RSVP FOR EVENTS
     For EVENT type announcements, add an RSVP system:
     [ ✓ Going ] [ ? Maybe ] [ ✗ Can't Go ] buttons.
     Admin sees response counts + list of who's going.
     Model: EventRSVP { userId, announcementId, status }
     Integrates with the task manager calendar view.

  8. DAILY CONFESSION DIGEST EMAIL
     Admin can enable: "Send daily email digest of top confessions"
     to all users (opt-out available per user).
     Uses Resend API. Sent at 8am system timezone.
     Shows: top 3 confessions by reactions from yesterday.

  9. CONFESSION SEARCH
     Full-text search across confession body.
     Fuzzy search — return confessions containing query words.
     Search is admin-only (to prevent targeted searching by users).
     Using Prisma: WHERE body ILIKE '%query%'
     Or Supabase full-text search: .textSearch('body', query)

  10. CONFESSION CHAT ROOMS / CHANNELS
     Instead of one global confession room, allow multiple named
     channels: #general #work-rants #appreciation #random
     Admin creates/manages channels.
     Users join any channel — still anonymous per-channel.
     Each channel has its own alias (or same alias across all).

  ── LOWER PRIORITY, HIGH POLISH ──────────────────────────────────

  11. ANIMATED ALIAS REVEAL ONBOARDING
     First-time visitor gets a full-screen animation:
     Cards flip one by one showing random aliases, then one
     "lands" and pulses: "You are... SilentPanda_42!"
     Framer Motion: staggered card flip + final reveal bounce.

  12. CONFESSION LEADERBOARD (admin only)
     Shows: most confessed alias, most reacted alias,
     most reactions given, most active time of day.
     Useful for admin to understand engagement patterns.
     Purely aggregate — never reveals real identity.

  13. BULLETIN BOARD PUSH NOTIFICATIONS
     When admin posts a URGENT announcement, push notification
     sent to all users via expo-notifications (mobile) and
     browser Notification API (web).

  14. CONFESSION POLL / VOTE
     Special confession type: a mini-poll with 2-4 options.
     Other users vote anonymously. Results shown as bar chart.
     Model: ConfessionPoll { options: string[], votes: PollVote[] }

  15. EMOJI STORM MODE
     When a confession receives 20+ reactions in 60 seconds,
     trigger a CSS particle animation of the top emoji raining
     across the screen for 3 seconds. Pure CSS/JS, no library.
     Fun engagement mechanic that rewards viral confessions.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 7 — API ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ── BULLETIN BOARD ───────────────────────────────────────────────

  GET    /api/bulletin
    Query: ?type=EVENT&pinned=true&page=1&limit=20
    Auth: all users
    Returns: paginated announcements (published only for users,
             all for admins)

  POST   /api/bulletin
    Auth: admin only
    Body: CreateAnnouncementSchema
    Logs: bulletin.created

  PATCH  /api/bulletin/[id]
    Auth: admin only
    Body: UpdateAnnouncementSchema
    Logs: bulletin.updated

  DELETE /api/bulletin/[id]
    Auth: admin only
    Logs: bulletin.deleted

  PATCH  /api/bulletin/[id]/pin
    Auth: admin only
    Body: { isPinned: boolean }
    Logs: bulletin.pinned | bulletin.unpinned

  POST   /api/bulletin/[id]/read
    Auth: all users
    Marks current user as having read this announcement

  GET    /api/bulletin/[id]/reads
    Auth: admin only
    Returns: list of users who have read + count

  POST   /api/bulletin/[id]/rsvp          (future feature)
    Auth: all users
    Body: { status: 'going' | 'maybe' | 'cant_go' }

  ── CONFESSION CHAT ──────────────────────────────────────────────

  GET    /api/confessions/alias
    Auth: all users
    Returns: current user's alias (creates one if none exists)

  GET    /api/confessions
    Query: ?page=1&limit=50&topic=rant
    Auth: all users
    Returns: confessions newest-first, with reaction counts
             and whether current user reacted

  POST   /api/confessions
    Auth: all users
    Body: CreateConfessionSchema
    Validates alias exists for current user
    Logs: confession.created (with aliasId only, NOT userId)

  DELETE /api/confessions/[id]
    Auth: alias owner OR admin
    Soft-delete (sets isHidden = true)

  POST   /api/confessions/[id]/react
    Auth: all users
    Body: ReactToConfessionSchema
    Toggle: if reaction exists → remove, else → create
    Calls refreshPin() after each reaction change
    Returns: updated reaction counts

  PATCH  /api/confessions/[id]/hide
    Auth: admin only
    Body: { isHidden: boolean }
    Logs: confession.hidden | confession.unhidden

  PATCH  /api/confessions/[id]/pin
    Auth: admin only (manual pin override)
    Body: { isPinned: boolean }
    Logs: confession.pinned_manually

  POST   /api/confessions/[id]/flag
    Auth: all users
    Increments flagCount, notifies admin if threshold reached

  GET    /api/confessions/pinned
    Auth: all users
    Returns: current top-pinned confession

  POST   /api/confessions/[id]/bookmark   (future feature)
    Auth: all users (by alias)
    Toggle bookmark on/off


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 8 — COMPONENT TREE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  web/src/
  ├── app/
  │   ├── (app)/
  │   │   ├── bulletin/
  │   │   │   └── page.tsx              ← BulletinPage
  │   │   └── confessions/
  │   │       └── page.tsx              ← ConfessionPage
  │   └── api/
  │       ├── bulletin/
  │       │   ├── route.ts              ← GET list, POST create
  │       │   └── [id]/
  │       │       ├── route.ts          ← PATCH, DELETE
  │       │       ├── pin/route.ts
  │       │       ├── read/route.ts
  │       │       └── rsvp/route.ts
  │       └── confessions/
  │           ├── route.ts              ← GET list, POST create
  │           ├── alias/route.ts        ← GET/POST alias
  │           ├── pinned/route.ts       ← GET top-pinned
  │           └── [id]/
  │               ├── route.ts          ← DELETE
  │               ├── react/route.ts
  │               ├── hide/route.ts
  │               ├── pin/route.ts
  │               ├── flag/route.ts
  │               └── bookmark/route.ts
  │
  └── components/
      ├── bulletin/
      │   ├── BulletinBoard.tsx         ← main board container
      │   ├── AnnouncementCard.tsx      ← individual card
      │   ├── AnnouncementForm.tsx      ← admin create/edit modal
      │   ├── AnnouncementDetail.tsx    ← expanded detail modal
      │   ├── BulletinFilters.tsx       ← filter bar
      │   ├── PinnedBanner.tsx          ← pinned strip at top
      │   ├── RSVPButtons.tsx           ← future: going/maybe/no
      │   └── ReadReceiptStack.tsx      ← avatar stack of readers
      │
      └── confessions/
          ├── ConfessionChat.tsx        ← main chat container
          ├── ConfessionMessage.tsx     ← individual message
          ├── ConfessionCompose.tsx     ← compose bar at bottom
          ├── ConfessionPinnedBanner.tsx← top-pinned display
          ├── AliasWelcomeModal.tsx     ← first-time onboarding
          ├── ReactionBar.tsx           ← emoji reaction strip
          ├── ReactionTooltip.tsx       ← hover shows who reacted
          ├── ReplyThread.tsx           ← indented replies
          ├── ConfessionFlagButton.tsx  ← 🚩 report button
          └── AliasAvatar.tsx           ← colored initial bubble


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 9 — BUILD ORDER (phase by phase)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Build in this exact order. Each phase is testable before moving on.

  ── PHASE 1: DATABASE (Day 1) ─────────────────────────────────────

  Step 1.1  Add Announcement + ConfessionAlias + Confession +
            ConfessionReaction models to schema.prisma
  Step 1.2  Run: npx prisma migrate dev --name add_bulletin_and_confessions
  Step 1.3  Write Zod schemas in lib/schemas/bulletin.ts
            and lib/schemas/confession.ts
  Step 1.4  Write alias generation utility in lib/aliasGenerator.ts
  Step 1.5  Write logActivity() calls for all new action types

  ── PHASE 2: BULLETIN BOARD API (Day 1-2) ────────────────────────

  Step 2.1  GET  /api/bulletin    — paginated list with filters
  Step 2.2  POST /api/bulletin    — create (admin only, Zod validated)
  Step 2.3  PATCH /api/bulletin/[id]   — update
  Step 2.4  DELETE /api/bulletin/[id] — delete
  Step 2.5  PATCH /api/bulletin/[id]/pin — pin/unpin
  Step 2.6  POST /api/bulletin/[id]/read — mark as read

  ── PHASE 3: BULLETIN BOARD UI (Day 2-3) ─────────────────────────

  Step 3.1  BulletinBoard.tsx container with TanStack Query
  Step 3.2  AnnouncementCard.tsx (all types, type badge colors)
  Step 3.3  PinnedBanner.tsx (top pinned strip)
  Step 3.4  BulletinFilters.tsx (filter pills)
  Step 3.5  AnnouncementForm.tsx (admin modal with all fields)
  Step 3.6  Admin CRUD controls on cards (⋮ menu)
  Step 3.7  Framer Motion entrance animations

  ── PHASE 4: CONFESSION API (Day 3-4) ────────────────────────────

  Step 4.1  GET/POST /api/confessions/alias
  Step 4.2  GET /api/confessions (with reaction counts per alias)
  Step 4.3  POST /api/confessions (create with alias lookup)
  Step 4.4  POST /api/confessions/[id]/react (toggle + refreshPin)
  Step 4.5  GET /api/confessions/pinned
  Step 4.6  PATCH /api/confessions/[id]/hide (admin)
  Step 4.7  POST /api/confessions/[id]/flag

  ── PHASE 5: CONFESSION CHAT UI (Day 4-5) ────────────────────────

  Step 5.1  AliasWelcomeModal.tsx (first-time visit)
  Step 5.2  AliasAvatar.tsx (colored initial bubble)
  Step 5.3  ConfessionMessage.tsx (message bubble)
  Step 5.4  ReactionBar.tsx (emoji reactions with toggle)
  Step 5.5  ConfessionPinnedBanner.tsx (top-pinned sticky header)
  Step 5.6  ConfessionCompose.tsx (compose bar, char counter)
  Step 5.7  ConfessionChat.tsx (main container, scroll to bottom)
  Step 5.8  ReplyThread.tsx (indented replies)

  ── PHASE 6: REAL-TIME & POLISH (Day 5-6) ────────────────────────

  Step 6.1  Supabase Realtime for new confessions
  Step 6.2  Typing indicator via Supabase presence
  Step 6.3  Auto-scroll to new messages
  Step 6.4  Reaction count +1 pop animation
  Step 6.5  URGENT announcement pulsing border animation
  Step 6.6  Pin banner slide-in animation when pin changes
  Step 6.7  Admin moderation (hide, manual pin, identity reveal)

  ── PHASE 7: RECOMMENDED FEATURES (Day 7+) ───────────────────────

  Step 7.1  Read receipts (AnnouncementRead model + UI)
  Step 7.2  Confession bookmarks
  Step 7.3  Trending/Hot badge (reactions in last 1h)
  Step 7.4  @alias mentions
  Step 7.5  Announcement comments
  Step 7.6  Event RSVP
  Step 7.7  Confession topics/categories
  Step 7.8  Animated alias reveal onboarding
  Step 7.9  Push notifications for URGENT announcements
  Step 7.10 Emoji storm animation on viral confessions

  ── PHASE 8: MOBILE (Day 8-9) ─────────────────────────────────────

  Step 8.1  Bulletin Board screen (React Native)
  Step 8.2  Announcement card component (NativeWind)
  Step 8.3  Confession Chat screen
  Step 8.4  Confession message bubble (Reanimated entrance)
  Step 8.5  Reaction bar on native (haptic feedback on react)
  Step 8.6  Alias welcome flow on mobile
  Step 8.7  Push notifications for URGENT via expo-notifications


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 10 — MOBILE PARITY (React Native / Expo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Shared logic (put in packages/core, import in both web and mobile):
    • Zod schemas (AnnouncementSchema, ConfessionSchema)
    • aliasGenerator.ts
    • Reaction emoji constants + color maps
    • AnnouncementType color/label map
    • API fetch functions (useAnnouncements, useConfessions hooks)

  Mobile-specific implementations:

  BulletinBoard (React Native):
    <FlatList
      data={announcements}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <AnnouncementCard item={item} />}
      refreshControl={<RefreshControl onRefresh={refetch} />}
    />

  AnnouncementCard (NativeWind):
    <Animated.View
      entering={FadeInDown.springify().damping(20)}
      className="bg-zinc-900 rounded-2xl p-4 mb-3 border border-zinc-800"
    >
      <View className="flex-row items-center gap-2 mb-2">
        <TypeBadge type={item.type} />
        {item.isPinned && <PinBadge />}
      </View>
      <Text className="text-white font-semibold text-base">{item.title}</Text>
      <Text className="text-zinc-400 text-sm mt-1" numberOfLines={3}>
        {item.body}
      </Text>
    </Animated.View>

  ConfessionChat (React Native):
    // Use FlashList for 60fps long confession feeds
    import { FlashList } from '@shopify/flash-list'

    <FlashList
      data={confessions}
      estimatedItemSize={100}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <ConfessionMessage message={item} />}
      onEndReached={loadMore}
      ListHeaderComponent={<ConfessionPinnedBanner />}
    />

  Reactions (native haptics):
    import * as Haptics from 'expo-haptics'

    const handleReact = async (emoji) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      await reactToConfession(confessionId, emoji)
    }

  Push notifications for URGENT announcements:
    import * as Notifications from 'expo-notifications'

    // Server side: after creating URGENT announcement
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: user.expoPushToken,
        title: '🚨 Urgent Announcement',
        body: announcement.title,
        data: { route: '/app/bulletin', id: announcement.id }
      })
    })


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 11 — TESTING CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  UNIT TESTS (Vitest)
  ──────────────────
  □ aliasGenerator() never produces duplicates in 10,000 runs
  □ aliasGenerator() never contains real name parts
  □ hashUserId() always returns same color for same userId
  □ AnnouncementSchema rejects missing title, body, type
  □ CreateConfessionSchema rejects body > 1000 chars
  □ ReactToConfessionSchema rejects unknown emoji
  □ refreshPin() correctly identifies top confession by totalReacts
  □ refreshPin() breaks ties by createdAt desc
  □ refreshPin() does not override manual admin pin

  INTEGRATION TESTS (Vitest + Prisma test DB)
  ──────────────────────────────────────────
  □ POST /api/bulletin — admin creates announcement → appears in GET list
  □ POST /api/bulletin — user role → returns 403
  □ DELETE /api/bulletin/[id] — user role → returns 403
  □ POST /api/confessions/alias — creates alias if none exists
  □ POST /api/confessions/alias — returns existing alias on second call
  □ POST /api/confessions — creates confession linked to alias not userId
  □ POST /api/confessions/[id]/react — creates reaction
  □ POST /api/confessions/[id]/react — second call with same emoji removes it
  □ POST /api/confessions/[id]/react — updates totalReacts on confession
  □ refreshPin() called after react — correct confession isPinned = true

  E2E TESTS (Playwright)
  ─────────────────────
  □ Admin navigates to Bulletin, clicks "+ New", fills form, submits
    → card appears in feed
  □ Admin pins announcement → shows 📌 at top with shimmer border
  □ User navigates to Bulletin → cannot see "+ New" button
  □ User clicks filter "Events" → only EVENT type cards shown
  □ User visits /app/confessions for first time → alias modal shows
  □ User posts confession → appears in chat with alias (not real name)
  □ User reacts ❤️ to confession → count increments
  □ User reacts ❤️ again → count decrements (toggle remove)
  □ Most-reacted confession appears in pinned banner
  □ Admin hides confession → shows [Removed] placeholder
  □ Two tabs: tab 1 posts confession → tab 2 sees it (real-time)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 12 — EXPERT AI PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  HOW TO USE:
    1. Open a brand-new Claude conversation
    2. Paste EVERYTHING between the ══ lines below
    3. Claude will confirm it understood and ask which phase to start
    4. Share your schema.prisma and Claude builds from Phase 1 forward

─────────────────────────────────────────────────────────────────────
PASTE START ══════════════════════════════════════════════════════════

You are a Senior Full-Stack Engineer implementing two new features inside
an existing Next.js 14 + React Native task management system. You write
precise, production-grade TypeScript. You always diagnose before coding.
You think in layers: schema → API → component → animation → test.

════════════════════════════════════════════════════════
PROJECT CONTEXT
════════════════════════════════════════════════════════

Stack: Next.js 14 App Router, TypeScript strict, Tailwind CSS,
       Framer Motion, GSAP, shadcn/ui, Zustand, TanStack Query v5,
       Zod, NextAuth.js v5, Prisma + PostgreSQL / Supabase,
       React Native + Expo SDK 51+, NativeWind, Reanimated 3,
       Vitest (unit), Playwright (E2E)

Existing system: task management app with admin/user roles,
kanban board, sidebar navigation, notifications panel, settings panel.
Located at localhost:3000/app. Sidebar has ADMIN and VIEWS sections.

════════════════════════════════════════════════════════
FEATURE 1: BULLETIN BOARD (/app/bulletin)
════════════════════════════════════════════════════════

What it is: Admin-controlled announcement + events board. Users read only.

Prisma models to add:
  enum AnnouncementType { ANNOUNCEMENT EVENT DEADLINE HOLIDAY URGENT }
  model Announcement {
    id, title(max 200), body(text), type(AnnouncementType),
    isPinned(bool), isPublished(bool), coverImage(string?),
    eventStart(DateTime?), eventEnd(DateTime?),
    authorId → User, createdAt, updatedAt
  }
  model AnnouncementRead { userId, announcementId, readAt }
  model EventRSVP { userId, announcementId, status(going/maybe/cant_go) }

API routes:
  GET/POST   /api/bulletin             (list + create)
  PATCH/DELETE /api/bulletin/[id]      (update + delete, admin only)
  PATCH      /api/bulletin/[id]/pin    (admin only, max 3 pins)
  POST       /api/bulletin/[id]/read   (mark read, all users)
  GET        /api/bulletin/[id]/reads  (admin only, who read)
  POST       /api/bulletin/[id]/rsvp   (all users, for EVENT type)

UI rules:
  - Type badge colors: ANNOUNCEMENT=blue, EVENT=purple, DEADLINE=red,
    HOLIDAY=green, URGENT=orange with pulsing border animation
  - Max 3 pinned at once — pinning 4th auto-unpins oldest
  - Admin sees ⋮ menu on each card: Edit / Pin / Publish / Delete
  - Users see no edit controls at all
  - NEW badge for announcements < 24h old
  - Framer Motion entrance animations on card load
  - All mutations logged to ActivityLog

════════════════════════════════════════════════════════
FEATURE 2: CONFESSION CHAT (/app/confessions)
════════════════════════════════════════════════════════

What it is: Anonymous group chat. Every user gets a permanent random
alias (e.g. "SilentPanda_42"). Real identity hidden in UI.
Most-reacted confession is auto-pinned to top. Emoji reactions.
Threaded replies (1 level deep). Admin moderation.

Prisma models to add:
  model ConfessionAlias {
    id, userId(@unique), alias(@unique), avatarColor, createdAt
  }
  model Confession {
    id, body(max 1000), aliasId, isPinned(bool), isManualPin(bool),
    isHidden(bool), flagCount(int, default 0), replyToId(Confession?),
    totalReacts(int, default 0, denormalized), createdAt, updatedAt
  }
  model ConfessionReaction {
    id, confessionId, aliasId, emoji(string)
    @@unique([confessionId, aliasId, emoji])
  }
  model ConfessionBookmark { aliasId, confessionId, savedAt }

Alias generation (deterministic color, random adjective+animal+number):
  alias = `${ADJECTIVE}_${ANIMAL}_${1-99}`
  color = PALETTE[hash(userId) % PALETTE.length]
  Always same alias for same user (permanent)
  Show "Welcome modal" on first visit

API routes:
  GET/POST     /api/confessions                (list + create)
  GET/POST     /api/confessions/alias          (get or create alias)
  GET          /api/confessions/pinned         (top auto-pinned)
  POST         /api/confessions/[id]/react     (toggle emoji reaction)
  PATCH        /api/confessions/[id]/hide      (admin: soft delete)
  PATCH        /api/confessions/[id]/pin       (admin: manual pin)
  POST         /api/confessions/[id]/flag      (all users: report)
  POST         /api/confessions/[id]/bookmark  (alias owner: save)

Auto-pin logic (runs after every reaction):
  topConfession = findFirst(WHERE isHidden=false, ORDER BY totalReacts DESC,
                             createdAt DESC)
  Clear all non-manual pins → set topConfession.isPinned = true
  isManualPin=true pins are NOT overwritten by auto-pin

Reactions: emojis = [❤️, 😂, 🔥, 😮, 👏, 💀]
  Toggle: same emoji = remove reaction; different emoji = add
  Update totalReacts in same Prisma transaction as reaction change
  Reaction bar shows aggregate counts (not who reacted)
  Hover tooltip: "You + N others" or "N people"

Real-time: Supabase Realtime channel 'confessions' for new messages.
Fallback: poll every 5 seconds with TanStack Query refetchInterval.

Admin moderation:
  - Hide button on every message (sets isHidden, shows [Removed] placeholder)
  - Manual pin override
  - Identity reveal (requires confirmation, logged to ActivityLog)
  - Flagged confessions (flagCount >= 3) highlighted in admin view

════════════════════════════════════════════════════════
RECOMMENDED FEATURES (implement after core):
════════════════════════════════════════════════════════

  1. Announcement read receipts (AnnouncementRead model, avatar stack)
  2. Confession bookmarks (private, "My Saved" tab)
  3. Trending badge (most reactions in last 1 hour)
  4. @alias mentions with notification
  5. Announcement comments (real name, admin can disable per post)
  6. Event RSVP (going/maybe/cant_go, integrates with calendar)
  7. Confession topic tags [Rant][Question][Appreciation][Idea][Story]
  8. Daily confession digest email (Resend, opt-out)
  9. Animated alias reveal onboarding (Framer Motion card flip)
  10. URGENT push notifications (expo-notifications + browser API)
  11. Emoji storm animation when confession gets 20+ reactions in 60s
  12. Confession polls (2-4 option mini-vote)
  13. Multiple confession channels (#general #work-rants #appreciation)

════════════════════════════════════════════════════════
BEHAVIOR RULES (follow on every response)
════════════════════════════════════════════════════════

1. Schema first. Never write a component before its Prisma model
   and Zod schema are confirmed correct.

2. Anonymity is sacred. Confession routes NEVER expose userId in
   API responses — only aliasId and alias display name. Log
   identity reveals separately with full audit trail.

3. Role enforcement at API layer, not UI.
   Admin-only routes check role server-side on every request.
   Never rely on hiding a button as the only access control.

4. Zod validates everything. All POST/PATCH bodies, all query params,
   all environment variables. Throw 400 with clear message on failure.

5. Optimistic UI on reactions. Reaction toggle must feel instant.
   Use TanStack Query onMutate to increment/decrement count
   immediately, roll back on error.

6. totalReacts is denormalized. Always update it in the same
   Prisma $transaction as the reaction create/delete.
   Never recalculate by counting reactions on each request.

7. refreshPin() runs in a transaction after every reaction change.
   It must never overwrite isManualPin=true confessions.

8. Activity logging is mandatory. Call logActivity() after every
   successful mutation: bulletin.created, confession.hidden,
   confession.identity_revealed, etc.

9. After every web component, describe the React Native equivalent.
   Use FlashList (not FlatList) for the confession chat list.
   Use expo-haptics on reaction tap.

10. One feature at a time. Build and verify Phase 1 (DB) before
    Phase 2 (API). Build and verify Phase 2 before Phase 3 (UI).

════════════════════════════════════════════════════════
SESSION START PROTOCOL
════════════════════════════════════════════════════════

Do NOT ask setup questions. Instead:

1. Confirm: "I understand both features. Ready to build."
2. Say: "Share your schema.prisma and I will add the
   Announcement, ConfessionAlias, Confession, and
   ConfessionReaction models with the migration command."
3. After schema is done, ask: "Which do you want first:
   Bulletin Board API or Confession Chat API?"

Then build phase by phase. Never skip ahead.

PASTE END ════════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────────────

  POWER PROMPTS — copy-paste these during your build session:

  BULLETIN BOARD:
  "Build the GET /api/bulletin route with pagination and type filters"
  "Build AnnouncementCard.tsx with type badges, pin shimmer, and NEW badge"
  "Build the admin AnnouncementForm modal with all fields and Zod validation"
  "Add the max-3-pins enforcement to the PATCH /api/bulletin/[id]/pin route"
  "Build BulletinFilters.tsx with filter pills and date range for events"
  "Add Framer Motion staggered entrance animations to the bulletin feed"
  "Build the read receipt system: POST /read route + avatar stack component"

  CONFESSION CHAT:
  "Build the alias generation utility with adjective+animal+number format"
  "Build GET /api/confessions/alias — create if none exists, always same"
  "Build the AliasWelcomeModal with animated alias reveal"
  "Build ConfessionMessage.tsx with avatar bubble, reactions, reply button"
  "Build ReactionBar.tsx with toggle logic, counts, and +1 pop animation"
  "Build the refreshPin() function as a Prisma transaction"
  "Build ConfessionChat.tsx with Supabase Realtime subscription"
  "Build the admin moderation controls: hide button + identity reveal"
  "Build the typing indicator using Supabase presence channel"

  MOBILE:
  "Build the React Native BulletinBoard screen with FlashList + pull-to-refresh"
  "Build the React Native ConfessionChat with FlashList + haptic reactions"
  "Add expo-notifications push for URGENT announcements"
