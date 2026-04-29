const Database = require('better-sqlite3');
const db = new Database('c:/Users/ADMIN/Desktop/bb project/task-management1-maste-main/task-management1-maste-main/web/main.db');

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));
    
    const confessionsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE name='confessions'").get();
    console.log('Confessions Schema:', confessionsSchema ? confessionsSchema.sql : 'NOT FOUND');
    
    const count = db.prepare("SELECT count(*) as count FROM confessions").get();
    console.log('Confessions count:', count.count);
    
    const last = db.prepare("SELECT * FROM confessions ORDER BY id DESC LIMIT 1").get();
    console.log('Last confession:', last);
} catch (e) {
    console.error('Error:', e.message);
} finally {
    db.close();
}
