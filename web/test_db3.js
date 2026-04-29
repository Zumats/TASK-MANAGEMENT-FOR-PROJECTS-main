const Database = require('better-sqlite3');
const d = new Database('./.data/app.db');

try {
  d.exec(`alter table task_comments add column parent_id integer references task_comments(id) on delete set null`);
  console.log("Migration successful");
} catch(e) {
  console.log("Migration error:", e.message);
}

try {
  console.log("columns:", d.prepare("pragma table_info(task_comments)").all().map(c => c.name));
} catch(e) { console.log(e.message); }
