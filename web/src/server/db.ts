import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "app.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export function initDb(): void {
  const d = getDb();

  d.exec(`
    create table if not exists users (
      id integer primary key autoincrement,
      email text not null unique,
      password_hash text not null,
      role text not null default 'user',
      department text not null default 'other',
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists projects (
      id integer primary key autoincrement,
      name text not null,
      description text not null default '',
      created_at integer not null,
      updated_at integer not null
    );

    create table if not exists tasks (
      id integer primary key autoincrement,
      title text not null,
      description text not null,
      assigned_to integer not null,
      assigned_by integer not null,
      status text not null default 'in_process',
      progress integer not null default 0,
      priority text not null default 'medium',
      start_date integer,
      due_date integer,
      department text not null default 'other',
      created_at integer not null,
      updated_at integer not null,
      project_id integer,
      foreign key (assigned_to) references users(id) on delete cascade,
      foreign key (assigned_by) references users(id) on delete cascade,
      foreign key (project_id) references projects(id) on delete set null
    );

    create table if not exists notifications (
      id integer primary key autoincrement,
      user_id integer not null,
      title text not null,
      message text not null,
      task_id integer,
      created_at integer not null,
      read integer not null default 0,
      foreign key (user_id) references users(id) on delete cascade,
      foreign key (task_id) references tasks(id) on delete set null
    );

    create table if not exists attachments (
      id integer primary key autoincrement,
      task_id integer not null,
      checklist_item_id integer,
      uploaded_by integer not null,
      name text not null,
      path text not null,
      content_type text not null,
      size integer not null,
      created_at integer not null,
      foreign key (task_id) references tasks(id) on delete cascade,
      foreign key (uploaded_by) references users(id) on delete cascade
    );

    create table if not exists task_checklist (
      id integer primary key autoincrement,
      task_id integer not null,
      text text not null,
      done integer not null default 0,
      created_at integer not null,
      foreign key (task_id) references tasks(id) on delete cascade
    );

    create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
    create index if not exists idx_tasks_assigned_by on tasks(assigned_by);
    create index if not exists idx_notifications_user_id on notifications(user_id);
    create index if not exists idx_attachments_task_id on attachments(task_id);
    create index if not exists idx_task_checklist_task_id on task_checklist(task_id);
  `);

  // Migrations: add columns/indexes that may not exist in older databases
  try {
    d.exec(`alter table attachments add column checklist_item_id integer`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`create index if not exists idx_attachments_checklist_item_id on attachments(checklist_item_id)`);
  } catch {
    // Index likely already exists
  }
  // Migrations: add name, age, bio columns for user profile
  try {
    d.exec(`alter table users add column name text`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`alter table users add column age integer`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`alter table users add column bio text`);
  } catch {
    // Column likely already exists
  }
  // Migration: add avatar_url for profile picture
  try {
    d.exec(`alter table users add column avatar_url text`);
  } catch {
    // Column likely already exists
  }
  // Migration: add position for profile
  try {
    d.exec(`alter table users add column position text`);
  } catch {
    // Column likely already exists
  }
  // Migration: add timer_running for live task status tracking
  try {
    d.exec(`alter table tasks add column timer_running integer not null default 0`);
  } catch {
    // Column likely already exists
  }
  // Migration: add elapsed_seconds to save stopped timer time
  try {
    d.exec(`alter table tasks add column elapsed_seconds integer not null default 0`);
  } catch {
    // Column likely already exists
  }
  // Migration: add task_comments table for admin-user chat
  try {
    d.exec(`
      create table if not exists task_comments (
        id integer primary key autoincrement,
        task_id integer not null,
        user_id integer not null,
        parent_id integer,
        message text not null,
        created_at integer not null,
        foreign key (task_id) references tasks(id) on delete cascade,
        foreign key (user_id) references users(id) on delete cascade,
        foreign key (parent_id) references task_comments(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_task_comments_task_id on task_comments(task_id)`);
  } catch {
    // Table likely already exists
  }
  // Migration: add parent_id for reply threading
  try {
    d.exec(`alter table task_comments add column parent_id integer`);
  } catch {
    // Column likely already exists
  }
  // Migration: add timer_reports table for stop reports
  try {
    d.exec(`
      create table if not exists timer_reports (
        id integer primary key autoincrement,
        task_id integer not null,
        user_id integer not null,
        elapsed_seconds integer not null default 0,
        stop_note text,
        created_at integer not null,
        foreign key (task_id) references tasks(id) on delete cascade,
        foreign key (user_id) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_timer_reports_task_id on timer_reports(task_id)`);
  } catch {
    // Table likely already exists
  }
  // Migration: add status for user approval workflow
  try {
    d.exec(`alter table users add column status text not null default 'approved'`);
  } catch {
    // Column likely already exists
  }
  // Migration: add last_seen_at / last_login_at for online/offline presence
  try {
    d.exec(`alter table users add column last_seen_at integer`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`alter table users add column last_login_at integer`);
  } catch {
    // Column likely already exists
  }
  // Migration: add last_seen_at and last_login_at for presence
  try {
    d.exec(`alter table users add column last_seen_at integer`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`alter table users add column last_login_at integer`);
  } catch {
    // Column likely already exists
  }
  // Migration: add comment_attachments table for message file uploads
  try {
    d.exec(`
      create table if not exists comment_attachments (
        id integer primary key autoincrement,
        comment_id integer not null,
        task_id integer not null,
        uploaded_by integer not null,
        name text not null,
        path text not null,
        content_type text not null,
        size integer not null,
        created_at integer not null,
        foreign key (comment_id) references task_comments(id) on delete cascade,
        foreign key (task_id) references tasks(id) on delete cascade,
        foreign key (uploaded_by) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_comment_attachments_comment_id on comment_attachments(comment_id)`);
    d.exec(`create index if not exists idx_comment_attachments_task_id on comment_attachments(task_id)`);
  } catch {
    // Table likely already exists
  }
  // Migration: add parent_id for reply-to-message feature
  try {
    d.exec(`alter table task_comments add column parent_id integer references task_comments(id) on delete set null`);
  } catch {
    // Column likely already exists
  }
  // Migration: add transferred_from for task transfer audit trail
  try {
    d.exec(`alter table tasks add column transferred_from integer`);
  } catch {
    // Column likely already exists
  }
  // Migration: add type column to notifications for message notifs
  try {
    d.exec(`alter table notifications add column type text not null default 'general'`);
  } catch {
    // Column likely already exists
  }

  try {
    d.exec(`alter table tasks add column project_id integer references projects(id) on delete set null`);
  } catch {
    // Column likely already exists
  }
  try {
    d.exec(`create index if not exists idx_tasks_project_id on tasks(project_id)`);
  } catch {
    // Index likely already exists
  }

  // Migration: add projects table if it doesn't exist
  try {
    d.exec(`
      create table if not exists projects (
        id integer primary key autoincrement,
        name text not null,
        description text not null default '',
        created_at integer not null,
        updated_at integer not null
      )
    `);
  } catch {
    // Table likely already exists
  }

  try {
    d.exec(`alter table projects add column link_url text`);
  } catch {
    /* exists */
  }
  try {
    d.exec(`alter table projects add column file_path text`);
  } catch {
    /* exists */
  }
  try {
    d.exec(`alter table projects add column file_name text`);
  } catch {
    /* exists */
  }
  try {
    d.exec(`alter table projects add column file_content_type text`);
  } catch {
    /* exists */
  }
  try {
    d.exec(`alter table projects add column file_size integer`);
  } catch {
    /* exists */
  }

  // Migration: add task_shares table for enterprise sharing feature
  try {
    d.exec(`
      create table if not exists task_shares (
        id integer primary key autoincrement,
        task_id integer not null,
        from_user_id integer not null,
        to_user_id integer not null,
        created_at integer not null,
        foreign key (task_id) references tasks(id) on delete cascade,
        foreign key (from_user_id) references users(id) on delete cascade,
        foreign key (to_user_id) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_task_shares_task_id on task_shares(task_id)`);
    d.exec(`create index if not exists idx_task_shares_to_user_id on task_shares(to_user_id)`);
  } catch {
    // Table likely already exists
  }

  // Migration: add activity_logs for system auditing
  try {
    d.exec(`
      create table if not exists activity_logs (
        id integer primary key autoincrement,
        actor_id integer not null,
        actor_name text not null,
        actor_role text not null,
        action text not null,
        entity_type text not null,
        entity_id integer not null,
        entity_title text not null,
        meta text,
        route_path text not null,
        is_read integer not null default 0,
        created_at integer not null,
        foreign key (actor_id) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_activity_logs_actor_id on activity_logs(actor_id)`);
    d.exec(`create index if not exists idx_activity_logs_created_at on activity_logs(created_at)`);
  } catch {
    // Table likely already exists
  }

  // Phase 8: Bulletin Board & Confession Chat Models
  try {
    d.exec(`
      create table if not exists announcements (
        id text primary key,
        title text not null,
        body text not null,
        type text not null default 'ANNOUNCEMENT',
        is_pinned integer not null default 0,
        is_published integer not null default 1,
        cover_image text,
        event_start integer,
        event_end integer,
        author_id integer not null,
        created_at integer not null,
        updated_at integer not null,
        foreign key (author_id) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_announcements_type on announcements(type)`);
    d.exec(`create index if not exists idx_announcements_is_pinned on announcements(is_pinned)`);
  } catch {
    // Table likely already exists
  }

  try {
    d.exec(`
      create table if not exists confession_aliases (
        id text primary key,
        user_id integer not null unique,
        alias text not null unique,
        avatar_color text not null,
        created_at integer not null,
        foreign key (user_id) references users(id) on delete cascade
      )
    `);
  } catch {
    // Table likely already exists
  }

  try {
    d.exec(`
      create table if not exists confessions (
        id text primary key,
        body text not null,
        alias_id text not null,
        is_pinned integer not null default 0,
        is_manual_pin integer not null default 0,
        is_hidden integer not null default 0,
        flag_count integer not null default 0,
        reply_to_id text,
        total_reacts integer not null default 0,
        created_at integer not null,
        updated_at integer not null,
        foreign key (alias_id) references confession_aliases(id) on delete cascade,
        foreign key (reply_to_id) references confessions(id) on delete set null
      )
    `);
    d.exec(`create index if not exists idx_confessions_alias_id on confessions(alias_id)`);
  } catch {
    // Table likely already exists
  }

  try {
    d.exec(`
      create table if not exists confession_reactions (
        id text primary key,
        confession_id text not null,
        alias_id text not null,
        emoji text not null,
        created_at integer not null,
        foreign key (confession_id) references confessions(id) on delete cascade,
        foreign key (alias_id) references confession_aliases(id) on delete cascade,
        unique(confession_id, alias_id, emoji)
      )
    `);
  } catch {
    // Table likely already exists
  }

  // Community polls
  try {
    d.exec(`
      create table if not exists community_polls (
        id integer primary key autoincrement,
        question text not null,
        options_json text not null,
        created_by integer not null,
        created_at integer not null,
        is_active integer not null default 1,
        foreign key (created_by) references users(id) on delete cascade
      )
    `);
    d.exec(`
      create table if not exists community_poll_votes (
        id integer primary key autoincrement,
        poll_id integer not null,
        user_id integer not null,
        option_index integer not null,
        feedback text,
        created_at integer not null,
        updated_at integer not null,
        foreign key (poll_id) references community_polls(id) on delete cascade,
        foreign key (user_id) references users(id) on delete cascade,
        unique(poll_id, user_id)
      )
    `);
    d.exec(`create index if not exists idx_community_polls_created_at on community_polls(created_at)`);
    d.exec(`create index if not exists idx_community_poll_votes_poll_id on community_poll_votes(poll_id)`);
    d.exec(`create index if not exists idx_community_poll_votes_user_id on community_poll_votes(user_id)`);
  } catch {
    // Tables likely already exist
  }

  // Generic uploaded reports
  try {
    d.exec(`
      create table if not exists user_reports (
        id integer primary key autoincrement,
        user_id integer not null,
        title text not null,
        description text,
        file_name text,
        file_data_url text,
        created_at integer not null,
        foreign key (user_id) references users(id) on delete cascade
      )
    `);
    d.exec(`create index if not exists idx_user_reports_user_id on user_reports(user_id)`);
    d.exec(`create index if not exists idx_user_reports_created_at on user_reports(created_at)`);
  } catch {
    // Table likely already exists
  }

  // Migration: add admin_approved for admin approval workflow (user marks done → admin reviews)
  try {
    d.exec(`alter table tasks add column admin_approved integer not null default 0`);
  } catch {
    // Column likely already exists
  }
}
