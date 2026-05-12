import { Router, Response } from 'express';
import axios from 'axios';
import db from '../db';
import { generateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: '缺少登录凭证' });
    }

    const appId = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

    let openid: string;

    if (appId && appId !== 'your_wechat_appid') {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: { appid: appId, secret, js_code: code, grant_type: 'authorization_code' },
      });
      if (wxRes.data.errcode) {
        return res.status(400).json({ error: '微信登录失败: ' + (wxRes.data.errmsg || '未知错误') });
      }
      openid = wxRes.data.openid;
    } else {
      openid = 'dev_' + code;
    }

    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as any;
    if (!user) {
      const result = db.prepare('INSERT INTO users (openid) VALUES (?)').run(openid);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
    }

    const token = generateToken(user.id);

    return res.json({
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        noRepeatDays: user.no_repeat_days,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: '登录失败' });
  }
});

router.put('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { nickname, avatarUrl } = req.body;
    db.prepare('UPDATE users SET nickname = ?, avatar_url = ? WHERE id = ?').run(nickname || '', avatarUrl || '', userId);
    return res.json({ success: true });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: '更新失败' });
  }
});

export default router;
