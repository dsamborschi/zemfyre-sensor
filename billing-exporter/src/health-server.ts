import express, { Request, Response } from 'express';
import { logger } from './logger';

export class HealthServer {
  private app: express.Application;
  private port: number;
  private isReady: boolean = false;
  private lastCollectionTime: Date | null = null;
  private lastCollectionError: Error | null = null;

  constructor(port: number = 8080) {
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Liveness probe - is the service running?
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    });

    // Readiness probe - is the service ready to collect metrics?
    this.app.get('/ready', (req: Request, res: Response) => {
      if (this.isReady) {
        res.status(200).json({
          status: 'ready',
          last_collection: this.lastCollectionTime?.toISOString() || null,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          error: this.lastCollectionError?.message || 'Service not initialized',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Metrics endpoint - basic info
    this.app.get('/metrics', (req: Request, res: Response) => {
      res.status(200).json({
        service: 'billing-exporter',
        version: process.env.npm_package_version || '1.0.0',
        customer_id: process.env.CUSTOMER_ID,
        instance_id: process.env.INSTANCE_ID,
        namespace: process.env.NAMESPACE,
        last_collection: this.lastCollectionTime?.toISOString() || null,
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });
  }

  setReady(ready: boolean) {
    this.isReady = ready;
  }

  setLastCollectionTime(time: Date) {
    this.lastCollectionTime = time;
    this.lastCollectionError = null;
  }

  setLastCollectionError(error: Error) {
    this.lastCollectionError = error;
  }

  start() {
    this.app.listen(this.port, () => {
      logger.info(`🏥 Health check server listening on port ${this.port}`);
    });
  }
}
