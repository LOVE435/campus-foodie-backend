import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  const { canteen, meal_type, tag, keyword, page = '1', pageSize = '20' } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const limit = Number(pageSize);

  let sql = `
    SELECT f.*, c.name as canteen_name, w.name as window_name,
           u.nickname as creator_name,
           (SELECT COUNT(*) FROM likes WHERE food_id = f.id AND user_id = ?) as is_liked
    FROM foods f
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    JOIN users u ON f.creator_id = u.id
    WHERE f.status = 'active' AND f.is_public = 1
  `;
  const params: any[] = [req.userId];

  if (canteen) {
    sql += ' AND f.canteen_id = ?';
    params.push(canteen);
  }
  if (meal_type) {
    sql += ' AND f.meal_types LIKE ?';
    params.push(`%"${meal_type}"%`);
  }
  if (tag) {
    sql += ' AND f.tags LIKE ?';
    params.push(`%"${tag}"%`);
  }
  if (keyword) {
    sql += ' AND f.name LIKE ?';
    params.push(`%${keyword}%`);
  }

  sql += ' ORDER BY f.likes_count DESC, f.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const foods = db.prepare(sql).all(...params);
  const countSql = sql.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM').replace(/ ORDER BY.*/, '');
  const { total } = db.prepare(countSql).get(...params.slice(0, -2)) as any;

  const list = (foods as any[]).map(f => formatFood(f));

  return res.json({ list, total, page: Number(page), pageSize: limit });
});

router.get('/my-foods', (req: AuthRequest, res: Response) => {
  const foods = db.prepare(`
    SELECT f.*, c.name as canteen_name, w.name as window_name
    FROM foods f
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    WHERE f.creator_id = ?
    ORDER BY f.id DESC
  `).all(req.userId);

  return res.json({ list: (foods as any[]).map(f => formatFood(f)) });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const food = db.prepare(`
    SELECT f.*, c.name as canteen_name, w.name as window_name,
           u.nickname as creator_name,
           (SELECT COUNT(*) FROM likes WHERE food_id = f.id AND user_id = ?) as is_liked
    FROM foods f
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    JOIN users u ON f.creator_id = u.id
    WHERE f.id = ?
  `).get(req.userId, req.params.id) as any;

  if (!food) return res.status(404).json({ error: '食物不存在' });

  return res.json(formatFood(food));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const { name, canteenId, windowId, mealTypes, tags, isPublic } = req.body;

  if (!name || !canteenId || !windowId) {
    return res.status(400).json({ error: '名称、食堂和窗口不能为空' });
  }

  if (name.length > 30) {
    return res.status(400).json({ error: '名称不能超过30个字' });
  }

  const sensitivePattern = /[操草艹操妈的逼屌鸡巴傻逼操你妈fuck shit damn]/i;
  if (sensitivePattern.test(name)) {
    return res.status(400).json({ error: '名称含不文明用语，请修改' });
  }

  const result = db.prepare(`
    INSERT INTO foods (name, canteen_id, window_id, meal_types, tags, creator_id, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    canteenId,
    windowId,
    JSON.stringify(mealTypes || []),
    JSON.stringify(tags || []),
    req.userId,
    isPublic !== false ? 1 : 0,
  );

  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(result.lastInsertRowid) as any;
  return res.status(201).json(formatFood(food));
});

router.post('/:id/like', (req: AuthRequest, res: Response) => {
  const foodId = Number(req.params.id);
  const userId = req.userId!;

  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(foodId) as any;
  if (!food) return res.status(404).json({ error: '食物不存在' });

  const existing = db.prepare('SELECT * FROM likes WHERE user_id = ? AND food_id = ?').get(userId, foodId);

  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND food_id = ?').run(userId, foodId);
    db.prepare('UPDATE foods SET likes_count = likes_count - 1 WHERE id = ?').run(foodId);
    return res.json({ liked: false, likesCount: food.likes_count - 1 });
  } else {
    db.prepare('INSERT INTO likes (user_id, food_id) VALUES (?, ?)').run(userId, foodId);
    db.prepare('UPDATE foods SET likes_count = likes_count + 1 WHERE id = ?').run(foodId);
    return res.json({ liked: true, likesCount: food.likes_count + 1 });
  }
});

export default router;

function formatFood(f: any) {
  return {
    id: f.id,
    name: f.name,
    canteenId: f.canteen_id,
    canteenName: f.canteen_name,
    windowId: f.window_id,
    windowName: f.window_name,
    mealTypes: safeJsonParse(f.meal_types),
    tags: safeJsonParse(f.tags),
    creatorId: f.creator_id,
    creatorName: f.creator_name || '',
    isPublic: f.is_public === 1,
    likesCount: f.likes_count,
    status: f.status,
    isLiked: f.is_liked === 1,
    createdAt: f.created_at,
  };
}

function safeJsonParse(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}
