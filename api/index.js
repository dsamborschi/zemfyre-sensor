import fetch from "node-fetch";
import express from "express";
import Docker from "dockerode";
import cors from "cors";
import { exec, execFile } from "child_process";

const app = express();
const port = process.env.PORT || 3001;
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const grafanaUrl = process.env.GRAFANA_URL || "http://grafana:3000";
const apiToken = process.env.GRAFANA_API_TOKEN;

app.use(cors());
app.use(express.json()); // Needed for POST/PUT bodies

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

// List all dashboards
app.get("/grafana/dashboards", async (req, res) => {

  if (!apiToken) return res.status(500).json({ error: "GRAFANA_API_TOKEN not set" });

  try {
    const response = await fetch(`${grafanaUrl}/api/search?type=dash-db`, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all alert rules
app.get("/grafana/alert-rules", async (req, res) => {

  if (!apiToken) return res.status(500).json({ error: "GRAFANA_API_TOKEN not set" });

  try {
    const response = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules`, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/grafana/update-alert-threshold", async (req, res) => {
  const { rule_uid, new_threshold } = req.body;

  try {
    // 1. Get current rule definition
    const ruleResp = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!ruleResp.ok) {
      return res.status(500).json({ error: `Failed to fetch rule: ${await ruleResp.text()}` });
    }

    const rule = await ruleResp.json();

    // 2. Find threshold data with refId === "C"
    const thresholdData = rule.data.find(d => d.refId === "C");

    if (!thresholdData) {
      return res.status(400).json({ error: "Threshold data with refId 'C' not found." });
    }

    const evaluator = thresholdData.model.conditions?.[0]?.evaluator;

    if (!evaluator || !Array.isArray(evaluator.params)) {
      return res.status(400).json({ error: "Evaluator structure not found or malformed." });
    }

    // 3. Update threshold value
    evaluator.params[0] = Number(new_threshold);

    // 4. PUT updated rule back to Grafana
    const updateResp = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "X-Disable-Provenance": "true" // optional, disables history tracking
      },
      body: JSON.stringify(rule)
    });

    const responseText = await updateResp.text();

    if (!updateResp.ok) {
      return res.status(updateResp.status).json({ error: `Update failed: ${responseText}` });
    }

    res.json({ message: "Threshold updated successfully", status: updateResp.status });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Get dashboard variables
app.get("/grafana/dashboards/:uid/variables", async (req, res) => {
  const grafanaUrl = process.env.GRAFANA_URL || "http://grafana:3000";
  const apiToken = process.env.GRAFANA_API_TOKEN;

  try {
    const response = await fetch(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data = await response.json();
    const variables = data.dashboard.templating?.list || [];
    res.json(variables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update dashboard variable default value
app.post("/grafana/dashboards/:uid/variables/:varName", async (req, res) => {
  const grafanaUrl = process.env.GRAFANA_URL || "http://grafana:3000";
  const apiToken = process.env.GRAFANA_API_TOKEN;
  const { value } = req.body;

  if (!value) return res.status(400).json({ error: "New value is required in body" });

  try {
    // Get existing dashboard
    const getRes = await fetch(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });

    const dashboardData = await getRes.json();
    const dashboard = dashboardData.dashboard;
    const variable = dashboard.templating.list.find(v => v.name === req.params.varName);

    if (!variable) return res.status(404).json({ error: "Variable not found" });

    variable.current = { text: value, value: value };
    variable.options = [{ text: value, value: value, selected: true }];

    // Send updated dashboard
    const payload = {
      dashboard,
      message: `Updated variable ${req.params.varName}`,
      overwrite: true
    };

    const putRes = await fetch(`${grafanaUrl}/api/dashboards/db`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!putRes.ok) return res.status(putRes.status).json({ error: "Failed to update dashboard" });

    res.json({ message: `Variable ${req.params.varName} updated to ${value}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sync-time", (req, res) => {
  const { timestamp } = req.body;
  if (!timestamp) {
    return res.status(400).json({ error: "timestamp is required" });
  }
  
  // Skip time sync on Windows hosts
  if (process.platform === 'win32') {
    console.log(`[${new Date().toISOString()}] Time sync skipped on Windows host`);
    return res.json({ 
      message: "Time sync not supported on Windows host", 
      skipped: true,
      platform: process.platform,
      currentTime: new Date().toISOString()
    });
  }
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return res.status(400).json({ error: "Invalid timestamp" });
  }
  
  // Validate time is reasonable (not more than 10 years in past/future)
  const now = Date.now();
  const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
  if (Math.abs(date.getTime() - now) > tenYears) {
    return res.status(400).json({ 
      error: "Timestamp too far from current time", 
      provided: date.toISOString(),
      current: new Date().toISOString()
    });
  }
  
  const oldTime = new Date();
  const timeDiff = Math.abs(date.getTime() - oldTime.getTime());
  const unixSeconds = Math.floor(date.getTime() / 1000);
  
  execFile("date", ["-s", `@${unixSeconds}`], (error) => {
    if (error) {
      console.error("Time sync error:", error);
      // Check if it's a permission error
      if (error.message.includes("Operation not permitted") || error.message.includes("Permission denied")) {
        return res.status(403).json({ 
          error: "Permission denied - time sync requires elevated privileges",
          details: "Run the container with appropriate privileges or CAP_SYS_TIME capability",
          skipped: true
        });
      }
      return res.status(500).json({ error: error.message });
    }
    console.log(`[${new Date().toISOString()}] System time synced: ${oldTime.toISOString()} → ${date.toISOString()} (diff: ${timeDiff}ms)`);
    res.json({ 
      message: "System time synchronized", 
      time: date.toISOString(),
      previousTime: oldTime.toISOString(),
      differenceMs: timeDiff
    });
  });
});

// Get current system time
app.get("/system-time", (req, res) => {
  res.json({ time: new Date().toISOString(), platform: process.platform });
});

app.post("/notify", (req, res) => {
  const title = req.body.title || "ZEMFYRE ALERT";
  const message = req.body.message || "Critical alert from ZEMFYRE!";

  // Run notify-send with critical urgency and no timeout
  const notifyCommand = `notify-send -u critical -t 0 "${title}" "${message}"`;

  exec(notifyCommand, (error, stdout, stderr) => {
    if (error) {
      console.error("notify-send error:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ message: "Critical notification sent", title, body: message });
  });
});
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
