const Database = require('better-sqlite3');
const db = new Database('./.data/app.db');
console.log("DB path:", db.name);
try {
  console.log("transferred_from:", db.prepare("select transferred_from from tasks limit 1").all());
} catch(e) { console.error("tasks error:", e.message); }

try {
  console.log("comment_attachments:", db.prepare("select * from comment_attachments limit 1").all());
} catch(e) { console.error("comment_attachments error:", e.message); }

try {
  console.log("status:", db.prepare("select status from users limit 1").all());
} catch(e) { console.error("users error:", e.message); }

try {
  console.log("type:", db.prepare("select type from notifications limit 1").all());
} catch(e) { console.error("notifications error:", e.message); }
