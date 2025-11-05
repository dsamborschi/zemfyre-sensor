/**
 * VPN Server Core Implementation
 * Manages OpenVPN server process and client connections
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  VPNServerOptions, 
  VPNConnection, 
  Logger 
} from './types';
import { CertificateManager } from './certificate-manager';

export interface VPNServerEvents {
  clientConnected: (client: VPNConnection) => void;
  clientDisconnected: (client: VPNConnection) => void;
  clientAuthenticated: (deviceId: string, clientInfo: any) => void;
  serverStarted: () => void;
  serverStopped: () => void;
  error: (error: Error) => void;
}

interface VPNServerStatus {
  running: boolean;
  startedAt: Date | undefined;
  connectedClients: number;
  totalConnections: number;
  lastError: string | undefined;
}

interface VPNServerMetrics {
  uptime: number;
  totalConnections: number;
  activeConnections: number;
  totalBytesTransferred: number;
  connectionsPerHour: number;
  averageSessionDuration: number;
  authenticatedDevices: number;
}

export class VPNServer extends EventEmitter {
  private config: VPNServerOptions;
  private logger: Logger;
  private certificateManager: CertificateManager;
  private process?: ChildProcess;
  private status: VPNServerStatus;
  private metrics: VPNServerMetrics;
  private connectedClients: Map<string, VPNConnection> = new Map();
  private isShuttingDown = false;

  constructor(config: VPNServerOptions, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.certificateManager = new CertificateManager(config.pki, logger);
    
    this.status = {
      running: false,
      startedAt: undefined,
      connectedClients: 0,
      totalConnections: 0,
      lastError: undefined
    } as VPNServerStatus;

    this.metrics = {
      uptime: 0,
      totalConnections: 0,
      activeConnections: 0,
      totalBytesTransferred: 0,
      connectionsPerHour: 0,
      averageSessionDuration: 0,
      authenticatedDevices: 0
    };
  }

  /**
   * Initialize VPN server
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing VPN server');

    try {
      // Initialize certificate manager
      await this.certificateManager.initialize();

      // Generate server configuration
      await this.generateServerConfig();

      this.logger.info('VPN server initialization complete');
    } catch (error) {
      this.logger.error('Failed to initialize VPN server', { error });
      throw error;
    }
  }

  /**
   * Start VPN server process
   */
  async start(): Promise<void> {
    if (this.status.running) {
      this.logger.warn('VPN server is already running');
      return;
    }

    this.logger.info('Starting VPN server');

    try {
      await this.startOpenVPNProcess();
      
      this.status.running = true;
      this.status.startedAt = new Date();
      this.status.lastError = undefined;
      
      this.emit('serverStarted');
      this.logger.info('VPN server started successfully');
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start VPN server', { error });
      throw error;
    }
  }

  /**
   * Stop VPN server process
   */
  async stop(): Promise<void> {
    if (!this.status.running) {
      this.logger.warn('VPN server is not running');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Stopping VPN server');

    try {
      if (this.process) {
        // Gracefully terminate OpenVPN process
        this.process.kill('SIGTERM');
        
        // Wait for process to exit
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (this.process) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 10000); // 10 second timeout

          if (this.process) {
            this.process.on('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
      }

      this.status.running = false;
      this.status.startedAt = undefined;
      this.connectedClients.clear();
      this.metrics.activeConnections = 0;
      
      this.emit('serverStopped');
      this.logger.info('VPN server stopped');
    } catch (error) {
      this.logger.error('Error stopping VPN server', { error });
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Get current server status
   */
  getStatus(): VPNServerStatus {
    return { ...this.status };
  }

  /**
   * Get server metrics
   */
  getMetrics(): VPNServerMetrics {
    // Update uptime if server is running
    if (this.status.running && this.status.startedAt) {
      this.metrics.uptime = Math.floor((Date.now() - this.status.startedAt.getTime()) / 1000);
    }

    return { ...this.metrics };
  }

  /**
   * Get connected clients
   */
  getConnectedClients(): VPNConnection[] {
    return Array.from(this.connectedClients.values());
  }

  /**
   * Provision certificate for device
   */
  async provisionDevice(deviceId: string, customerId: string): Promise<any> {
    this.logger.info('Provisioning device certificate', { deviceId, customerId });
    
    try {
      const certificate = await this.certificateManager.generateDeviceCertificate({
        deviceId,
        customerId
      });
      
      this.logger.info('Device certificate provisioned successfully', { deviceId });
      return certificate;
    } catch (error) {
      this.logger.error('Failed to provision device certificate', { deviceId, error });
      throw error;
    }
  }

  /**
   * Revoke device certificate
   */
  async revokeDevice(deviceId: string): Promise<void> {
    this.logger.info('Revoking device certificate', { deviceId });
    
    try {
      await this.certificateManager.revokeCertificate({
        deviceId
      });
      
      // Disconnect client if currently connected
      const client = this.connectedClients.get(deviceId);
      if (client) {
        this.disconnectClient(deviceId);
      }
      
      this.logger.info('Device certificate revoked successfully', { deviceId });
    } catch (error) {
      this.logger.error('Failed to revoke device certificate', { deviceId, error });
      throw error;
    }
  }

  /**
   * Start OpenVPN process
   */
  private async startOpenVPNProcess(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config', 'server.conf');
    
    this.process = spawn('openvpn', [configPath], {
      stdio: 'pipe',
      env: process.env
    });

    // Handle process events
    this.process.on('error', (error) => {
      this.logger.error('OpenVPN process error', { error });
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      this.logger.info('OpenVPN process exited', { code, signal });
      
      if (!this.isShuttingDown) {
        this.status.running = false;
        this.emit('error', new Error(`OpenVPN process exited unexpectedly: ${code}`));
      }
    });

    // Handle stdout for connection events
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.parseOpenVPNOutput(output);
      });
    }

    // Handle stderr for errors
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        const error = data.toString();
        this.logger.error('OpenVPN stderr', { error });
      });
    }

    // Wait for server to start listening
    await this.waitForServerStart();
  }

  /**
   * Wait for OpenVPN server to start
   */
  private async waitForServerStart(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('OpenVPN server start timeout'));
      }, 30000); // 30 second timeout

      const checkStart = () => {
        // Check if server is listening (simplified)
        // In production, you'd check the actual port
        setTimeout(() => {
          clearTimeout(timeout);
          resolve();
        }, 2000);
      };

      checkStart();
    });
  }

  /**
   * Parse OpenVPN log output for events
   */
  private parseOpenVPNOutput(output: string): void {
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('CLIENT_CONNECT')) {
        this.handleClientConnect(line);
      } else if (line.includes('CLIENT_DISCONNECT')) {
        this.handleClientDisconnect(line);
      } else if (line.includes('TLS: Username/Password authentication')) {
        this.handleClientAuthentication(line);
      }
    }
  }

  /**
   * Handle client connection
   */
  private handleClientConnect(logLine: string): void {
    try {
      // Parse connection info from log line
      // Format: CLIENT_CONNECT,deviceId,realIP,vpnIP
      const parts = logLine.split(',');
      if (parts.length >= 4) {
        const deviceId = parts[1];
        const realIP = parts[2];
        const vpnIP = parts[3];
        
        const client: VPNConnection = {
          id: `${deviceId}-${Date.now()}`,
          deviceId,
          customerId: '', // Would need to be resolved from device registry
          realIP,
          vpnIP,
          connectedAt: new Date(),
          lastActivity: new Date(),
          bytesReceived: 0,
          bytesSent: 0,
          status: 'connected'
        };
        
        this.connectedClients.set(deviceId, client);
        this.metrics.activeConnections = this.connectedClients.size;
        this.metrics.totalConnections++;
        this.status.connectedClients = this.connectedClients.size;
        
        this.emit('clientConnected', client);
        this.logger.info('Client connected', { deviceId, realIP, vpnIP });
      }
    } catch (error) {
      this.logger.error('Error parsing client connect event', { error, logLine });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnect(logLine: string): void {
    try {
      // Parse disconnection info from log line
      const parts = logLine.split(',');
      if (parts.length >= 2) {
        const deviceId = parts[1];
        
        const client = this.connectedClients.get(deviceId);
        if (client) {
          this.connectedClients.delete(deviceId);
          this.metrics.activeConnections = this.connectedClients.size;
          this.status.connectedClients = this.connectedClients.size;
          
          this.emit('clientDisconnected', client);
          this.logger.info('Client disconnected', { deviceId });
        }
      }
    } catch (error) {
      this.logger.error('Error parsing client disconnect event', { error, logLine });
    }
  }

  /**
   * Handle client authentication
   */
  private handleClientAuthentication(logLine: string): void {
    try {
      // Parse authentication info from log line
      const deviceIdMatch = logLine.match(/device[_-]([a-zA-Z0-9-]+)/);
      if (deviceIdMatch) {
        const deviceId = deviceIdMatch[1];
        this.metrics.authenticatedDevices++;
        
        this.emit('clientAuthenticated', deviceId, { logLine });
        this.logger.info('Client authenticated', { deviceId });
      }
    } catch (error) {
      this.logger.error('Error parsing client authentication event', { error, logLine });
    }
  }

  /**
   * Disconnect a specific client
   */
  private disconnectClient(deviceId: string): void {
    const client = this.connectedClients.get(deviceId);
    if (client) {
      // Send disconnect command to OpenVPN management interface
      // This would require management interface to be enabled
      this.logger.info('Disconnecting client', { deviceId });
      
      this.connectedClients.delete(deviceId);
      this.metrics.activeConnections = this.connectedClients.size;
      this.status.connectedClients = this.connectedClients.size;
      
      this.emit('clientDisconnected', client);
    }
  }

  /**
   * Generate OpenVPN server configuration
   */
  private async generateServerConfig(): Promise<void> {
    const configPath = path.join(process.cwd(), 'config', 'server.conf');
    
    // Read template configuration
    const templatePath = path.join(__dirname, '../config/server.conf');
    let config = await fs.readFile(templatePath, 'utf8');
    
    // Replace placeholders with actual values
    config = config.replace(/{{PORT}}/g, this.config.vpn.port.toString());
    config = config.replace(/{{PROTOCOL}}/g, this.config.vpn.protocol);
    config = config.replace(/{{CONFIG_DIR}}/g, process.cwd() + '/config');
    config = config.replace(/{{PKI_DIR}}/g, this.config.pki.caCertPath.replace('/ca.crt', ''));
    config = config.replace(/{{LOG_LEVEL}}/g, this.config.logging.level);
    
    // Write configuration file
    await fs.writeFile(configPath, config, 'utf8');
    
    this.logger.info('Generated OpenVPN server configuration', { configPath });
  }
}