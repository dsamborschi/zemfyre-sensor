"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dockerode_1 = __importDefault(require("dockerode"));
exports.router = express_1.default.Router();
const docker = new dockerode_1.default({ socketPath: '/var/run/docker.sock' });
exports.router.get('/containers', async (req, res) => {
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.router.post('/containers/:id/restart', async (req, res) => {
    try {
        const container = docker.getContainer(req.params.id);
        await container.restart();
        res.json({ message: `Container ${req.params.id} restarted.` });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = exports.router;
//# sourceMappingURL=docker.js.map