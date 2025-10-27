"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleLogger = void 0;
/**
 * Console Logger implementation
 */
class ConsoleLogger {
    constructor(level = 'info', enableConsole = true) {
        this.level = level;
        this.enableConsole = enableConsole;
    }
    shouldLog(messageLevel) {
        if (!this.enableConsole)
            return false;
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[messageLevel] >= levels[this.level];
    }
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message), ...args);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message), ...args);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message), ...args);
        }
    }
    setLevel(level) {
        this.level = level;
    }
    setConsoleEnabled(enabled) {
        this.enableConsole = enabled;
    }
}
exports.ConsoleLogger = ConsoleLogger;
//# sourceMappingURL=logger.js.map