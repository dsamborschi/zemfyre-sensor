"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const node_fetch_1 = __importDefault(require("node-fetch"));
exports.router = express_1.default.Router();
const grafanaUrl = process.env.GRAFANA_URL || 'http://grafana:3000';
const apiToken = process.env.GRAFANA_API_TOKEN;
exports.router.get('/grafana/dashboards', async (req, res) => {
    if (!apiToken)
        return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });
    try {
        const response = await (0, node_fetch_1.default)(`${grafanaUrl}/api/search?type=dash-db`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (!response.ok)
            return res.status(response.status).json({ error: response.statusText });
        const data = await response.json();
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.router.get('/grafana/alert-rules', async (req, res) => {
    if (!apiToken)
        return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });
    try {
        const response = await (0, node_fetch_1.default)(`${grafanaUrl}/api/v1/provisioning/alert-rules`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (!response.ok)
            return res.status(response.status).json({ error: response.statusText });
        const data = await response.json();
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.router.post('/grafana/update-alert-threshold', async (req, res) => {
    if (!apiToken)
        return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });
    const { rule_uid, new_threshold } = req.body;
    try {
        const ruleResp = await (0, node_fetch_1.default)(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
        });
        if (!ruleResp.ok) {
            return res.status(500).json({ error: `Failed to fetch rule: ${await ruleResp.text()}` });
        }
        const rule = await ruleResp.json();
        const thresholdData = rule.data.find((d) => d.refId === 'C');
        if (!thresholdData) {
            return res.status(400).json({ error: "Threshold data with refId 'C' not found." });
        }
        const evaluator = thresholdData.model.conditions?.[0]?.evaluator;
        if (!evaluator || !Array.isArray(evaluator.params)) {
            return res.status(400).json({ error: 'Evaluator structure not found or malformed.' });
        }
        evaluator.params[0] = Number(new_threshold);
        const updateResp = await (0, node_fetch_1.default)(`${grafanaUrl}/api/v1/provisioning/alert-rules/${rule_uid}`, {
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
    }
    catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});
exports.router.get('/grafana/dashboards/:uid/variables', async (req, res) => {
    if (!apiToken)
        return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });
    try {
        const response = await (0, node_fetch_1.default)(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        if (!response.ok)
            return res.status(response.status).json({ error: response.statusText });
        const data = await response.json();
        const variables = data.dashboard.templating?.list || [];
        res.json(variables);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.router.post('/grafana/dashboards/:uid/variables/:varName', async (req, res) => {
    if (!apiToken)
        return res.status(500).json({ error: 'GRAFANA_API_TOKEN not set' });
    const { value } = req.body;
    if (!value)
        return res.status(400).json({ error: 'New value is required in body' });
    try {
        const getRes = await (0, node_fetch_1.default)(`${grafanaUrl}/api/dashboards/uid/${req.params.uid}`, {
            headers: { 'Authorization': `Bearer ${apiToken}` }
        });
        const dashboardData = await getRes.json();
        const dashboard = dashboardData.dashboard;
        const variable = dashboard.templating.list.find((v) => v.name === req.params.varName);
        if (!variable)
            return res.status(404).json({ error: 'Variable not found' });
        variable.current = { text: value, value: value };
        variable.options = [{ text: value, value: value, selected: true }];
        const payload = {
            dashboard,
            message: `Updated variable ${req.params.varName}`,
            overwrite: true
        };
        const putRes = await (0, node_fetch_1.default)(`${grafanaUrl}/api/dashboards/db`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!putRes.ok)
            return res.status(putRes.status).json({ error: 'Failed to update dashboard' });
        res.json({ message: `Variable ${req.params.varName} updated to ${value}` });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = exports.router;
//# sourceMappingURL=grafana.js.map