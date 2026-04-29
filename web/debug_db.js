import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), ".data", "app.db");
console.log("Checking DB at:", dbPath);

const db = new Database(dbPath);

function checkTable(name) {
    try {
        const info = db.prepare(`PRAGMA table_info(${name})`).all();
        console.log(`Table ${name}:`, info.length > 0 ? "EXISTS" : "MISSING", info.map(c => c.name).join(", "));
    } catch (e) {
        console.log(`Table ${name}: ERROR`, e.message);
    }
}

const tables = ["users", "tasks", "notifications", "attachments", "task_checklist", "task_comments", "timer_reports", "comment_attachments", "task_shares", "activity_logs"];
tables.forEach(checkTable);

// Test common queries
try {
    const res = db.prepare("select t.*, u1.email as assigned_to_email from tasks t join users u1 on u1.id=t.assigned_to LIMIT 1").get();
    console.log("Tasks query: OK");
} catch (e) {
    console.log("Tasks query: FAILED", e.message);
}

try {
    const res = db.prepare("SELECT * FROM activity_logs LIMIT 1").get();
    console.log("Activity logs query: OK");
} catch (e) {
    console.log("Activity logs query: FAILED", e.message);
}

try {
    const res = db.prepare("SELECT * FROM timer_reports LIMIT 1").get();
    console.log("Timer reports query: OK");
} catch (e) {
    console.log("Timer reports query: FAILED", e.message);
}
