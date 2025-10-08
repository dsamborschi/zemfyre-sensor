import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SSHTunnelConfig {
  cloudHost: string;
  cloudPort: number;
  localPort: number;
  sshUser: string;
  sshKeyPath: string;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

export class SSHTunnelManager {
  private process?: ChildProcess;
  private config: SSHTunnelConfig;
  private isConnecting: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: SSHTunnelConfig) {
    this.config = {
      autoReconnect: true,
      reconnectDelay: 5000,
      ...config,
    };
  }

  /**
   * Establish SSH reverse tunnel to cloud server
   * Creates tunnel: cloud:localPort -> device:localPort
   */
  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('⏳ SSH tunnel connection already in progress...');
      return;
    }

    if (this.process) {
      console.log('✅ SSH tunnel already connected');
      return;
    }

    // Validate SSH key exists
    if (!fs.existsSync(this.config.sshKeyPath)) {
      throw new Error(`SSH key not found: ${this.config.sshKeyPath}`);
    }

    // Check SSH key permissions (should be 600)
    const stats = fs.statSync(this.config.sshKeyPath);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);
    if (mode !== '600') {
      console.warn(`⚠️  SSH key has permissions ${mode}, should be 600`);
      fs.chmodSync(this.config.sshKeyPath, 0o600);
      console.log('✅ Fixed SSH key permissions to 600');
    }

    this.isConnecting = true;

    const args = [
      '-R', `${this.config.localPort}:localhost:${this.config.localPort}`,
      '-i', this.config.sshKeyPath,
      '-p', this.config.cloudPort.toString(),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-N', // Don't execute remote command
      '-T', // Disable TTY
      `${this.config.sshUser}@${this.config.cloudHost}`,
    ];

    console.log('🔌 Establishing SSH reverse tunnel...');
    console.log(`   Cloud: ${this.config.cloudHost}:${this.config.cloudPort}`);
    console.log(`   Tunnel: cloud:${this.config.localPort} -> device:${this.config.localPort}`);

    this.process = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.on('spawn', () => {
      console.log('✅ SSH tunnel process started');
      this.isConnecting = false;
    });

    this.process.on('error', (error: Error) => {
      console.error('❌ SSH tunnel spawn error:', error.message);
      this.isConnecting = false;
      this.process = undefined;
      this.scheduleReconnect();
    });

    this.process.on('close', (code: number | null, signal: string | null) => {
      console.log(`⚠️  SSH tunnel closed (code: ${code}, signal: ${signal})`);
      this.isConnecting = false;
      this.process = undefined;
      this.scheduleReconnect();
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log('SSH tunnel stdout:', data.toString().trim());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      // SSH uses stderr for normal messages too
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
        console.error('SSH tunnel stderr:', message);
      } else {
        console.log('SSH tunnel info:', message);
      }
    });

    // Give it a moment to establish
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!this.process || this.process.killed) {
      throw new Error('SSH tunnel failed to establish');
    }

    console.log('✅ SSH reverse tunnel established successfully');
  }

  /**
   * Disconnect SSH tunnel
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting SSH tunnel...');

    // Clear any pending reconnection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
      
      // Force kill after 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }
    }

    this.process = undefined;
    console.log('✅ SSH tunnel disconnected');
  }

  /**
   * Check if tunnel is connected
   */
  isConnected(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  /**
   * Get tunnel status information
   */
  getStatus(): {
    connected: boolean;
    connecting: boolean;
    config: Omit<SSHTunnelConfig, 'sshKeyPath'>;
  } {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      config: {
        cloudHost: this.config.cloudHost,
        cloudPort: this.config.cloudPort,
        localPort: this.config.localPort,
        sshUser: this.config.sshUser,
        autoReconnect: this.config.autoReconnect,
        reconnectDelay: this.config.reconnectDelay,
      },
    };
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect) {
      console.log('⚠️  Auto-reconnect disabled, not reconnecting');
      return;
    }

    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    const delay = this.config.reconnectDelay || 5000;
    console.log(`⏳ Scheduling SSH tunnel reconnection in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      console.log('🔄 Attempting to reconnect SSH tunnel...');
      this.connect().catch(error => {
        console.error('❌ Reconnection failed:', error.message);
      });
    }, delay);
  }

  /**
   * Perform health check on tunnel
   * Returns true if tunnel is connected and SSH process is running
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    // Check if SSH process is still alive
    try {
      // Send signal 0 to check if process exists
      if (this.process?.pid) {
        process.kill(this.process.pid, 0);
        return true;
      }
    } catch (error) {
      console.error('SSH tunnel health check failed:', error);
      return false;
    }

    return false;
  }
}
