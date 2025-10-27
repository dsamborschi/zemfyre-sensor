import { SensorDataPoint, SocketOutput, Logger } from './types';
/**
 * Unix Socket Server that receives sensor data and serves it to connected clients
 */
export declare class SocketServer {
    private server?;
    private clients;
    private config;
    private logger;
    private started;
    constructor(config: SocketOutput, logger: Logger);
    /**
     * Start the Unix socket server
     */
    start(): Promise<void>;
    /**
     * Stop the Unix socket server
     */
    stop(): Promise<void>;
    /**
     * Send sensor data to all connected clients
     */
    sendData(dataPoints: SensorDataPoint[]): void;
    /**
     * Get number of connected clients
     */
    getClientCount(): number;
    /**
     * Check if server is running
     */
    isRunning(): boolean;
    /**
     * Handle new client connection
     */
    private handleClientConnection;
    /**
     * Remove client from the list
     */
    private removeClient;
    /**
     * Format sensor data based on configuration
     */
    private formatData;
    /**
     * Format data as JSON
     */
    private formatAsJson;
    /**
     * Format data as CSV
     */
    private formatAsCsv;
}
//# sourceMappingURL=socket-server.d.ts.map