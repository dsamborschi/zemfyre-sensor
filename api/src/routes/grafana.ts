/**
 * Grafana Management Routes
 * Control dashboards, alerts, and variables
 */

import express from 'express';
import fetch from 'node-fetch';

export const router = express.Router();

const grafanaUrl = process.env.GRAFANA_URL || 'http://grafana:3000';
const apiToken = process.env.GRAFANA_API_TOKEN;

// List all dashboards
router.get('/grafana/dashboards', async (req, res) => {
  if (!apiToken) return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });

  try {
    const response = await fetch(`${grafanaUrl}/api/search?type=dash-db`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List all alert rules
router.get('/grafana/alert-rules', async (req, res) => {
  if (!apiToken) return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });

  try {
    const response = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update alert threshold
router.post('/grafana/update-alert-threshold', async (req, res) => {
  if (!apiToken) return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });

  const { rule_uid, new_threshold } = req.body;

  try {
    const ruleResp = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
    });

    if (!ruleResp.ok) {
      return res.status(500).json({ error: `Failed to fetch rule: ${await ruleResp.text()}` });
    }

    const rule: any = await ruleResp.json();
    const thresholdData = rule.data.find((d: any) => d.refId === 'C');

    if (!thresholdData) {
      return res.status(400).json({ error: "Threshold data with refId 'C' not found." });
    }

    const evaluator = thresholdData.model.conditions?.[0]?.evaluator;
    if (!evaluator || !Array.isArray(evaluator.params)) {
      return res.status(400).json({ error: 'Evaluator structure not found or malformed.' });
    }

    evaluator.params[0] = Number(new_threshold);

    const updateResp = await fetch(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'X-Disable-Provenance': 'true'
      },
      body: JSON.stringify(rule)
    });

    const responseText = await updateResp.text();
    if (!updateResp.ok) {
      return res.status(updateResp.status).json({ error: `Update failed: ${responseText}` });
    }

    res.json({ message: 'Threshold updated successfully', status: updateResp.status });
  } catch (err: any) {
    res.status(500).json({ error: err.toString() });
  }
});

// Get dashboard variables
router.get('/grafana/dashboards/:uid/variables', async (req, res) => {
  if (!apiToken) return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });

  try {
    const response = await fetch(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: response.statusText });
    const data: any = await response.json();
    const variables = data.dashboard.templating?.list || [];
    res.json(variables);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update dashboard variable
router.post('/grafana/dashboards/:uid/variables/:varName', async (req, res) => {
  if (!apiToken) return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });

  const { value } = req.body;
  if (!value) return res.status(400).json({ error: 'New value is required in body' });

  try {
    const getRes = await fetch(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });

    const dashboardData: any = await getRes.json();
    const dashboard = dashboardData.dashboard;
    const variable = dashboard.templating.list.find((v: any) => v.name === req.params.varName);

    if (!variable) return res.status(404).json({ error: 'Variable not found' });

    variable.current = { text: value, value: value };
    variable.options = [{ text: value, value: value, selected: true }];

    const payload = {
      dashboard,
      message: `Updated variable ${req.params.varName}`,
      overwrite: true
    };

    const putRes = await fetch(`${grafanaUrl}/api/dashboards/db`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!putRes.ok) return res.status(putRes.status).json({ error: 'Failed to update dashboard' });

    res.json({ message: `Variable ${req.params.varName} updated to ${value}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
