import fetch from "node-fetch";
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

// Proxy endpoint for Grafana dashboards
app.get("/grafana/dashboards", async (req, res) => {
  const grafanaUrl = process.env.GRAFANA_URL || "http://grafana:3000";
  const apiToken = process.env.GRAFANA_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: "GRAFANA_API_TOKEN not set in backend" });
  }
  try {
    const response = await fetch(`${grafanaUrl}/api/search?type=dash-db`, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: `Grafana API error: ${response.statusText}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
