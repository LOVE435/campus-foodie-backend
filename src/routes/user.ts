import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/profile', (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT id, nickname, avatar_url, no_repeat_days, created_at FROM users WHERE id = ?').get(req.userId) as any;
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM foods WHERE status = 'active' AND is_public = 1) as totalFoods,
      (SELECT COUNT(DISTINCT canteen_id) FROM foods WHERE status = 'active') as totalCanteens,
      (SELECT COUNT(DISTINCT window_id) FROM foods WHERE status = 'active') as totalWindows,
      (SELECT COUNT(*) FROM likes WHERE user_id = ?) as myLikes,
      (SELECT COUNT(*) FROM draw_history WHERE user_id = ?) as myDraws,
      (SELECT COUNT(*) FROM foods WHERE creator_id = ?) as myFoods
  `).get(req.userId, req.userId, req.userId) as any;

  return res.json({
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      noRepeatDays: user.no_repeat_days,
      createdAt: user.created_at,
    },
    stats,
  });
});

router.get('/favorites', (req: AuthRequest, res: Response) => {
  const { page = '1', pageSize = '20' } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);

  const foods = db.prepare(`
    SELECT f.*, c.name as canteen_name, w.name as window_name, l.created_at as liked_at
    FROM likes l
    JOIN foods f ON f.id = l.food_id
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    WHERE l.user_id = ? AND f.status = 'active'
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, Number(pageSize), offset);

  const list = (foods as any[]).map(f => ({
    id: f.id,
    name: f.name,
    canteenName: f.canteen_name,
    windowName: f.window_name,
    mealTypes: safeParse(f.meal_types),
    tags: safeParse(f.tags),
    likesCount: f.likes_count,
    isLiked: true,
    likedAt: f.liked_at,
  }));

  return res.json({ list });
});

router.get('/history', (req: AuthRequest, res: Response) => {
  const { date } = req.query;
  let sql = `
    SELECT h.*, f.name as food_name, f.likes_count,
           c.name as canteen_name, w.name as window_name
    FROM draw_history h
    JOIN foods f ON f.id = h.food_id
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    WHERE h.user_id = ?
  `;
  const params: any[] = [req.userId];

  if (date) {
    sql += ' AND h.draw_date = ?';
    params.push(date);
  }

  sql += ' ORDER BY h.draw_date DESC, h.id DESC LIMIT 90';

  const records = db.prepare(sql).all(...params) as any[];

  const list = records.map(r => ({
    id: r.id,
    foodId: r.food_id,
    foodName: r.food_name,
    canteenName: r.canteen_name,
    windowName: r.window_name,
    mealType: r.meal_type,
    likesCount: r.likes_count,
    drawDate: r.draw_date,
  }));

  const calendar: Record<string, any> = {};
  for (const item of list) {
    if (!calendar[item.drawDate]) {
      calendar[item.drawDate] = { breakfast: null, lunch: null, dinner: null };
    }
    calendar[item.drawDate][item.mealType] = item;
  }

  return res.json({ list, calendar });
});

router.get('/contributions', (req: AuthRequest, res: Response) => {
  const foods = db.prepare(`
    SELECT f.*, c.name as canteen_name, w.name as window_name
    FROM foods f
    JOIN canteens c ON f.canteen_id = c.id
    JOIN windows w ON f.window_id = w.id
    WHERE f.creator_id = ?
    ORDER BY f.likes_count DESC, f.id DESC
  `).all(req.userId);

  const list = (foods as any[]).map(f => ({
    id: f.id,
    name: f.name,
    canteenName: f.canteen_name,
    windowName: f.window_name,
    mealTypes: safeParse(f.meal_types),
    tags: safeParse(f.tags),
    likesCount: f.likes_count,
    isPublic: f.is_public === 1,
    status: f.status,
    createdAt: f.created_at,
  }));

  return res.json({ list });
});

router.put('/settings', (req: AuthRequest, res: Response) => {
  const { noRepeatDays } = req.body;
  if (noRepeatDays && (noRepeatDays < 0 || noRepeatDays > 14)) {
    return res.status(400).json({ error: '不重复天数范围0-14天' });
  }
  db.prepare('UPDATE users SET no_repeat_days = ? WHERE id = ?').run(noRepeatDays, req.userId);
  return res.json({ success: true });
});

export default router;

function safeParse(str: string): string[] {
  try { return JSON.parse(str); } catch { return []; }
}
