import { Router, Response } from 'express';
import db from '../db';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.post('/:foodId', (req: AuthRequest, res: Response) => {
  const foodId = Number(req.params.foodId);
  const userId = req.userId!;
  const { reason } = req.body;

  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(foodId) as any;
  if (!food) return res.status(404).json({ error: '食物不存在' });

  const alreadyReported = db.prepare('SELECT * FROM reports WHERE food_id = ? AND reporter_id = ? AND status = \'pending\'').get(foodId, userId);
  if (alreadyReported) return res.status(400).json({ error: '你已经举报过了，等待处理中' });

  db.prepare('INSERT INTO reports (food_id, reporter_id, reason) VALUES (?, ?, ?)').run(foodId, userId, reason || '');
  return res.json({ success: true, message: '举报已提交' });
});

export default router;
