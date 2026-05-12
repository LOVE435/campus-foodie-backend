import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'campus-foodie.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      no_repeat_days INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS canteens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canteen_id INTEGER NOT NULL REFERENCES canteens(id),
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      canteen_id INTEGER NOT NULL REFERENCES canteens(id),
      window_id INTEGER NOT NULL REFERENCES windows(id),
      meal_types TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      creator_id INTEGER NOT NULL REFERENCES users(id),
      is_public INTEGER DEFAULT 1,
      likes_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      food_id INTEGER NOT NULL REFERENCES foods(id),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, food_id)
    );

    CREATE TABLE IF NOT EXISTS draw_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      food_id INTEGER NOT NULL REFERENCES foods(id),
      meal_type TEXT NOT NULL,
      draw_date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_id INTEGER NOT NULL REFERENCES foods(id),
      reporter_id INTEGER NOT NULL REFERENCES users(id),
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  seedCanteens();
}

function seedCanteens() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM canteens').get() as { cnt: number };
  if (count.cnt > 0) return;

  const canteens = [
    { name: '一食堂', windows: ['家常小炒', '面食窗口', '麻辣烫', '煲仔饭', '早餐铺'] },
    { name: '二食堂', windows: ['烤肉饭', '石锅拌饭', '饺子馆', '西餐简餐', '奶茶店'] },
    { name: '三食堂', windows: ['川湘风味', '粤式烧腊', '清真窗口', '自助快餐', '烘焙坊'] },
    { name: '教工食堂', windows: ['精品小炒', '营养套餐', '面点王'] },
  ];

  const insertCanteen = db.prepare('INSERT INTO canteens (name) VALUES (?)');
  const insertWindow = db.prepare('INSERT INTO windows (canteen_id, name) VALUES (?, ?)');

  for (const c of canteens) {
    const result = insertCanteen.run(c.name);
    const canteenId = result.lastInsertRowid;
    for (const w of c.windows) {
      insertWindow.run(canteenId, w);
    }
  }
}

export default db;
