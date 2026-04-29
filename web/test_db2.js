const Database = require('better-sqlite3');
const db = new Database('./.data/app.db');
try {
  console.log("columns:", db.prepare("pragma table_info(task_comments)").all().map(c => c.name));
} catch(e) { console.error("error:", e.message); }
