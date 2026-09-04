const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE TABLE classrooms (id TEXT PRIMARY KEY, is_closed INTEGER DEFAULT 0)');
db.prepare('INSERT INTO classrooms (id, is_closed) VALUES (?, ?)').run('cr_1', 0);
db.prepare('INSERT INTO classrooms (id, is_closed) VALUES (?, ?)').run('cr_2', 1);
const classrooms = db.prepare('SELECT * FROM classrooms').all();
console.log(classrooms);
console.log(classrooms.map(c => Boolean(c.is_closed)));
