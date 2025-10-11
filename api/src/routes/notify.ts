/**
 * System Notifications
 */

import express from 'express';
import { exec } from 'child_process';

export const router = express.Router();

router.post('/notify', (req, res) => {
  const title = req.body.title || 'ZEMFYRE ALERT';
  const message = req.body.message || 'Critical alert from ZEMFYRE!';

  const notifyCommand = `notify-send -u critical -t 0 "${title}" "${message}"`;

  exec(notifyCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('notify-send error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'Critical notification sent', title, body: message });
  });
});

export default router;
