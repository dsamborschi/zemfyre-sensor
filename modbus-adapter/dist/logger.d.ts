import { Logger } from './types';
/**
 * Console Logger implementation
 */
export declare class ConsoleLogger implements Logger {
    private level;
    private enableConsole;
    constructor(level?: string, enableConsole?: boolean);
    private shouldLog;
    private formatMessage;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    setLevel(level: string): void;
    setConsoleEnabled(enabled: boolean): void;
}
//# sourceMappingURL=logger.d.ts.map