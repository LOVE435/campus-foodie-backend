import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  const { type = 'total', canteen_id, meal_type, tag, page = '1', pageSize = '100' } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  const limit = Number(pageSize);

  let sql = `
    SELECT f.id, f.name, f.likes_count, f.meal_types, f.tags,
           c.name as canteen_name, w.name as window_name
    FROM foods f
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    WHERE f.status = 'active' AND f.is_public = 1
  `;

  if (canteen_id) {
    sql += ` AND f.canteen_id = ${Number(canteen_id)}`;
  }
  if (meal_type) {
    sql += ` AND f.meal_types LIKE '%"${meal_type}"%'`;
  }
  if (tag) {
    sql += ` AND f.tags LIKE '%"${tag}"%'`;
  }

  if (type === 'total') {
    sql += ' ORDER BY f.likes_count DESC, f.id DESC';
  } else {
    sql += ' ORDER BY f.likes_count DESC, f.id DESC';
  }

  sql += ` LIMIT ${limit} OFFSET ${offset}`;

  const foods = db.prepare(sql).all() as any[];
  const list = foods.map((f: any, index: number) => ({
    rank: offset + index + 1,
    id: f.id,
    name: f.name,
    canteenName: f.canteen_name,
    windowName: f.window_name,
    mealTypes: safeParse(f.meal_types),
    tags: safeParse(f.tags),
    likesCount: f.likes_count,
  }));

  return res.json({ list });
});

router.get('/canteens', (_req: AuthRequest, res: Response) => {
  const canteens = db.prepare(`
    SELECT c.*, COUNT(f.id) as food_count
    FROM canteens c
    LEFT JOIN foods f ON f.canteen_id = c.id AND f.status = 'active'
    GROUP BY c.id
    ORDER BY c.id
  `).all();
  return res.json({ list: canteens });
});

router.get('/windows', (req: AuthRequest, res: Response) => {
  const { canteen_id } = req.query;
  let sql = 'SELECT * FROM windows';
  if (canteen_id) {
    sql += ` WHERE canteen_id = ${Number(canteen_id)}`;
  }
  sql += ' ORDER BY id';
  const windows = db.prepare(sql).all();
  return res.json({ list: windows });
});

router.get('/tags', (_req: AuthRequest, res: Response) => {
  const tags = ['辣味', '清淡', '高蛋白', '甜食', '素食', '面食', '米饭', '汤类', '小吃', '西餐'];
  return res.json({ list: tags });
});

export default router;

function safeParse(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}
