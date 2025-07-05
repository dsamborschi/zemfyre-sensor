import express from "express";
import Docker from "dockerode";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

app.use(cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Zemfyre API is running!" });
});

app.get("/containers", async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    // Map to a simpler structure
    const result = containers.map(c => ({
      id: c.Id,
      names: c.Names,
      image: c.Image,
      state: c.State,
      status: c.Status
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/containers/:id/restart", async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    res.json({ message: `Container ${req.params.id} restarted.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
