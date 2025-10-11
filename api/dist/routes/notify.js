"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
exports.router = express_1.default.Router();
exports.router.post('/notify', (req, res) => {
    const title = req.body.title || 'ZEMFYRE ALERT';
    const message = req.body.message || 'Critical alert from ZEMFYRE!';
    const notifyCommand = `notify-send -u critical -t 0 "${title}" "${message}"`;
    (0, child_process_1.exec)(notifyCommand, (error, stdout, stderr) => {
        if (error) {
            console.error('notify-send error:', error);
            return res.status(500).json({ error: error.message });
        }
        res.json({ message: 'Critical notification sent', title, body: message });
    });
});
exports.default = exports.router;
//# sourceMappingURL=notify.js.map