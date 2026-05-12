import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.post('/draw', (req: AuthRequest, res: Response) => {
  const { mealType, source = 'all', excludeTags } = req.body;
  const userId = req.userId!;

  if (!mealType || !['breakfast', 'lunch', 'dinner'].includes(mealType)) {
    return res.status(400).json({ error: '请指定餐次: breakfast/lunch/dinner' });
  }

  const noRepeatDays = db.prepare('SELECT no_repeat_days FROM users WHERE id = ?').get(userId) as any;
  const days = noRepeatDays?.no_repeat_days || 3;

  const params: any[] = [];
  let sql = `SELECT f.*, c.name as canteen_name, w.name as window_name FROM foods f JOIN canteens c ON f.canteen_id = c.id JOIN windows w ON f.window_id = w.id WHERE f.status = 'active' AND f.meal_types LIKE ? `;
  params.push(`%"${mealType}"%`);

  if (source === 'liked') {
    sql += ' AND EXISTS (SELECT 1 FROM likes WHERE food_id = f.id AND user_id = ?)';
    params.push(userId);
  } else if (source === 'mine') {
    sql += ' AND f.creator_id = ?';
    params.push(userId);
  } else {
    sql += ' AND f.is_public = 1';
  }

  if (excludeTags && excludeTags.length > 0) {
    for (const tag of excludeTags) {
      sql += ' AND f.tags NOT LIKE ?';
      params.push(`%"${tag}"%`);
    }
  }

  const recentFoodIds = db.prepare(
    `SELECT food_id FROM draw_history WHERE user_id = ? AND draw_date >= date('now', 'localtime', ?) GROUP BY food_id`
  ).all(userId, `-${days} days`) as any[];

  if (recentFoodIds.length > 0) {
    const placeholders = recentFoodIds.map(() => '?').join(',');
    sql += ` AND f.id NOT IN (${placeholders})`;
    params.push(...recentFoodIds.map((r: any) => r.food_id));
  }

  const foods = db.prepare(sql).all(...params) as any[];

  if (foods.length === 0) {
    return res.json({ food: null, message: '没有符合条件的食物，试试扩大范围' });
  }

  const food = foods[Math.floor(Math.random() * foods.length)];

  db.prepare('INSERT INTO draw_history (user_id, food_id, meal_type) VALUES (?, ?, ?)').run(userId, food.id, mealType);

  return res.json({
    food: {
      id: food.id,
      name: food.name,
      canteenName: food.canteen_name,
      windowName: food.window_name,
      mealTypes: safeParse(food.meal_types),
      tags: safeParse(food.tags),
      likesCount: food.likes_count,
    },
  });
});

router.post('/batch', (req: AuthRequest, res: Response) => {
  const { sources } = req.body;
  const userId = req.userId!;
  const meals = ['breakfast', 'lunch', 'dinner'];
  const results: any = {};

  const noRepeatDays = db.prepare('SELECT no_repeat_days FROM users WHERE id = ?').get(userId) as any;
  const days = noRepeatDays?.no_repeat_days || 3;
  const recentFoodIds = db.prepare(
    `SELECT food_id FROM draw_history WHERE user_id = ? AND draw_date >= date('now', 'localtime', ?) GROUP BY food_id`
  ).all(userId, `-${days} days`) as any[];
  const recentIds = recentFoodIds.map((r: any) => r.food_id);

  const usedIds: number[] = [];

  for (const meal of meals) {
    const source = sources?.[meal] || 'all';
    const params: any[] = [];

    let sql = `SELECT f.*, c.name as canteen_name, w.name as window_name FROM foods f JOIN canteens c ON f.canteen_id = c.id JOIN windows w ON f.window_id = w.id WHERE f.status = 'active' AND f.meal_types LIKE ? `;
    params.push(`%"${meal}"%`);

    if (source === 'liked') {
      sql += ' AND EXISTS (SELECT 1 FROM likes WHERE food_id = f.id AND user_id = ?)';
      params.push(userId);
    } else if (source === 'mine') {
      sql += ' AND f.creator_id = ?';
      params.push(userId);
    } else {
      sql += ' AND f.is_public = 1';
    }

    const excludeIds = [...recentIds, ...usedIds].filter(Boolean);
    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      sql += ` AND f.id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    const foods = db.prepare(sql).all(...params) as any[];

    if (foods.length > 0) {
      const food = foods[Math.floor(Math.random() * foods.length)];
      db.prepare('INSERT INTO draw_history (user_id, food_id, meal_type) VALUES (?, ?, ?)').run(userId, food.id, meal);
      usedIds.push(food.id);
      results[meal] = {
        id: food.id,
        name: food.name,
        canteenName: food.canteen_name,
        windowName: food.window_name,
        mealTypes: safeParse(food.meal_types),
        tags: safeParse(food.tags),
        likesCount: food.likes_count,
      };
    } else {
      results[meal] = null;
    }
  }

  return res.json(results);
});

export default router;

function safeParse(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}
