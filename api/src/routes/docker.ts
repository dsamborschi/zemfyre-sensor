/**
 * Docker Container Management Routes
 * Direct Docker container operations
 */

import express from 'express';
import Docker from 'dockerode';

export const router = express.Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// List all containers
router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const result = containers.map(c => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      state: c.State,
      status: c.Status
    }));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Restart container
router.post('/containers/:id/restart', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ message: `Container ${req.params.id} restarted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
