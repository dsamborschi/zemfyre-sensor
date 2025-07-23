import fetch from "node-fetch";
import express from "express";
import Docker from "dockerode";
import cors from "cors";
import { exec } from "child_process";

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

// POST: Update threshold in alert rule
app.post("/grafana/update-alert-threshold", async (req, res) => {
  const { rule_uid, new_threshold } = req.body;

  try {
    // 1. Get current rule
    const ruleResp = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
      headers: { "Authorization": `Bearer ${apiToken}`}
    });
    const rule = await ruleResp.json();

    // 2. Find the data item with refId === 'C' (where threshold is stored)
    const thresholdData = rule.data.find(item => item.refId === "C");

    if (!thresholdData) {
      return res.status(400).json({ error: "Threshold data with refId 'C' not found." });
    }

    // 3. Update the threshold param (params[0]) inside the evaluator object
    if (
      thresholdData.model &&
      thresholdData.model.conditions &&
      thresholdData.model.conditions[0] &&
      thresholdData.model.conditions[0].evaluator &&
      Array.isArray(thresholdData.model.conditions[0].evaluator.params)
    ) {
      thresholdData.model.conditions[0].evaluator.params[0] = Number(new_threshold);
    } else {
      return res.status(400).json({ error: "Alert rule structure unexpected, cannot find evaluator params." });
    }

    // 4. PUT updated rule back to Grafana
    const updateResp = await fetch(
      `${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`,
      {
        method: "PUT",
        headers: { "Authorization": `Bearer ${apiToken}`,"X-Disable-Provenance": "disabled" },
        body: JSON.stringify(rule)
      }
    );

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
