# OpenVPN Architecture Implementation Plan for Iotistic

## 🎯 Goal: Replicate Balena's VPN System

Create a secure, scalable VPN infrastructure for cloud-to-device connectivity similar to Balena's architecture.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Cloud API     │    │   VPN Gateway    │    │   Device Fleet  │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │   Billing   │ │    │ │  OpenVPN     │ │    │ │   Device A  │ │
│ │   Service   │ │    │ │  Server      │ │    │ │             │ │
│ └─────────────┘ │    │ │              │ │    │ │ ┌─────────┐ │ │
│                 │    │ │ Port 1194    │ │    │ │ │ OpenVPN │ │ │
│ ┌─────────────┐ │    │ │              │ │◄───┼─┤ │ Client  │ │ │
│ │ Customer    │◄┼────┼─┤ Device       │ │    │ │ └─────────┘ │ │
│ │ Dashboard   │ │    │ │ Registry     │ │    │ │             │ │
│ └─────────────┘ │    │ │              │ │    │ │ Agent API   │ │
│                 │    │ └──────────────┘ │    │ │ :48484      │ │
└─────────────────┘    └──────────────────┘    │ └─────────────┘ │
                                                │                 │
                                                │ ┌─────────────┐ │
                                                │ │   Device B  │ │
                                                │ │             │ │
                                                │ │ ┌─────────┐ │ │
                                                │ │ │ OpenVPN │ │ │
                                                │ │ │ Client  │ │ │
                                                │ │ └─────────┘ │ │
                                                │ │             │ │
                                                │ │ Agent API   │ │
                                                │ │ :48484      │ │
                                                │ └─────────────┘ │
                                                └─────────────────┘
```

## 🔧 Implementation Components

### 1. **VPN Server Infrastructure** (Cloud)

#### A. OpenVPN Server Container
```dockerfile
# vpn-server/Dockerfile
FROM alpine:latest

RUN apk add --no-cache openvpn iptables openssl easy-rsa

COPY server.conf /etc/openvpn/
COPY ca.crt /etc/openvpn/
COPY server.crt /etc/openvpn/
COPY server.key /etc/openvpn/
COPY dh.pem /etc/openvpn/

EXPOSE 1194/udp
CMD ["openvpn", "--config", "/etc/openvpn/server.conf"]
```

#### B. VPN Server Configuration
```conf
# vpn-server/server.conf
port 1194
proto udp
dev tun
topology subnet

# Certificate and key files
ca ca.crt
cert server.crt
key server.key
dh dh.pem

# Network configuration
server 10.8.0.0 255.255.255.0
ifconfig-pool-persist /var/log/openvpn/ipp.txt

# Client-to-client communication
client-to-client

# Enable compression
comp-lzo

# Keepalive settings
keepalive 10 120

# User and group
user nobody
group nogroup

# Persist keys
persist-key
persist-tun

# Logging
status /var/log/openvpn/openvpn-status.log
log-append /var/log/openvpn/openvpn.log
verb 3

# Client configuration directory
client-config-dir /etc/openvpn/ccd

# Push routes to clients
push "route 10.8.0.0 255.255.255.0"

# Certificate revocation list
crl-verify /etc/openvpn/crl.pem

# Custom script for client connect/disconnect
script-security 2
client-connect /etc/openvpn/scripts/client-connect.sh
client-disconnect /etc/openvpn/scripts/client-disconnect.sh
```

#### C. Device Registry Service
```typescript
// vpn-server/src/device-registry.ts
export interface VPNDevice {
  deviceId: string;
  customerId: string;
  vpnIP: string;
  commonName: string;
  connected: boolean;
  lastSeen: Date;
  certificateSerial: string;
}

export class DeviceRegistry {
  private devices = new Map<string, VPNDevice>();
  
  async registerDevice(device: VPNDevice): Promise<void> {
    this.devices.set(device.deviceId, device);
    await this.persistToDatabase(device);
  }
  
  async getDeviceByIP(vpnIP: string): Promise<VPNDevice | null> {
    return Array.from(this.devices.values())
      .find(d => d.vpnIP === vpnIP) || null;
  }
  
  async getDevicesByCustomer(customerId: string): Promise<VPNDevice[]> {
    return Array.from(this.devices.values())
      .filter(d => d.customerId === customerId);
  }
  
  async updateDeviceStatus(deviceId: string, connected: boolean): Promise<void> {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connected = connected;
      device.lastSeen = new Date();
      await this.persistToDatabase(device);
    }
  }
  
  private async persistToDatabase(device: VPNDevice): Promise<void> {
    // Store in PostgreSQL/Redis for persistence
  }
}
```

### 2. **Certificate Management** (Cloud)

#### A. PKI Certificate Authority
```typescript
// vpn-server/src/certificate-manager.ts
import * as forge from 'node-forge';

export class CertificateManager {
  private caCert: forge.pki.Certificate;
  private caKey: forge.pki.rsa.PrivateKey;
  
  constructor(caCertPem: string, caKeyPem: string) {
    this.caCert = forge.pki.certificateFromPem(caCertPem);
    this.caKey = forge.pki.privateKeyFromPem(caKeyPem);
  }
  
  async generateDeviceCertificate(deviceId: string, customerId: string): Promise<{
    cert: string;
    key: string;
    commonName: string;
  }> {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    
    const commonName = `device-${deviceId}`;
    
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerial();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [
      { name: 'commonName', value: commonName },
      { name: 'organizationName', value: `Customer-${customerId}` },
      { name: 'organizationalUnitName', value: 'IoT-Device' }
    ];
    
    cert.setSubject(attrs);
    cert.setIssuer(this.caCert.subject.attributes);
    cert.sign(this.caKey);
    
    return {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
      commonName
    };
  }
  
  async revokeCertificate(serialNumber: string): Promise<void> {
    // Add to Certificate Revocation List (CRL)
  }
  
  private generateSerial(): string {
    return Math.floor(Math.random() * 1000000).toString();
  }
}
```

### 3. **Device-Side VPN Client**

#### A. OpenVPN Client Container
```dockerfile
# Add to existing agent/Dockerfile
RUN apk add --no-cache openvpn

COPY vpn-client.conf /etc/openvpn/client/
COPY start-vpn.sh /usr/local/bin/
```

#### B. VPN Client Manager
```typescript
// agent/src/features/vpn/vpn-manager.ts
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VPNConfig {
  serverHost: string;
  serverPort: number;
  deviceCert: string;
  deviceKey: string;
  caCert: string;
  enabled: boolean;
}

export class VPNManager {
  private process?: ChildProcess;
  private config: VPNConfig;
  private isConnecting: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: VPNConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.config.enabled) {
      console.log('VPN disabled in configuration');
      return;
    }

    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;

    try {
      await this.writeConfigFiles();
      await this.startVPN();
      this.scheduleHealthCheck();
    } catch (error) {
      console.error('Failed to start VPN:', error);
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = undefined;
    }
  }

  isConnected(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  async getVPNIP(): Promise<string | null> {
    try {
      const output = await this.exec('ip addr show tun0');
      const match = output.match(/inet (10\.8\.0\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private async writeConfigFiles(): Promise<void> {
    const configDir = '/etc/openvpn/client';
    await fs.mkdir(configDir, { recursive: true });

    // Write certificates
    await fs.writeFile(path.join(configDir, 'ca.crt'), this.config.caCert);
    await fs.writeFile(path.join(configDir, 'client.crt'), this.config.deviceCert);
    await fs.writeFile(path.join(configDir, 'client.key'), this.config.deviceKey);

    // Write client configuration
    const clientConfig = `
client
dev tun
proto udp
remote ${this.config.serverHost} ${this.config.serverPort}
resolv-retry infinite
nobind
persist-key
persist-tun
ca ca.crt
cert client.crt
key client.key
comp-lzo
verb 3

# Auto-reconnect
ping 10
ping-restart 60
ping-timer-rem
persist-remote-ip

# Logging
log /var/log/openvpn-client.log
status /var/log/openvpn-status.log 10
`;

    await fs.writeFile(path.join(configDir, 'client.conf'), clientConfig);
  }

  private async startVPN(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('openvpn', [
        '--config', '/etc/openvpn/client/client.conf',
        '--cd', '/etc/openvpn/client'
      ]);

      this.process.stdout?.on('data', (data) => {
        console.log('VPN:', data.toString().trim());
      });

      this.process.stderr?.on('data', (data) => {
        console.error('VPN Error:', data.toString().trim());
      });

      this.process.on('close', (code) => {
        console.log(`VPN process exited with code ${code}`);
        this.process = undefined;
        
        if (this.config.enabled) {
          this.scheduleReconnect();
        }
      });

      this.process.on('error', (error) => {
        console.error('VPN process error:', error);
        reject(error);
      });

      // Wait for connection to establish
      setTimeout(() => {
        if (this.isConnected()) {
          resolve();
        } else {
          reject(new Error('VPN connection timeout'));
        }
      }, 30000);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = 30000; // 30 seconds
    console.log(`Scheduling VPN reconnect in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private scheduleHealthCheck(): void {
    setInterval(async () => {
      if (this.isConnected()) {
        const vpnIP = await this.getVPNIP();
        if (!vpnIP) {
          console.warn('VPN interface lost, reconnecting...');
          await this.disconnect();
          await this.connect();
        }
      }
    }, 60000); // Check every minute
  }

  private async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('sh', ['-c', command]);
      let output = '';
      
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
  }
}
```

### 4. **Integration with Existing Systems**

#### A. Update Device Agent
```typescript
// agent/src/agent.ts - Add VPN initialization
import { VPNManager } from './features/vpn/vpn-manager';

export default class DeviceAgent {
  private vpnManager?: VPNManager;

  private async initializeVPN(): Promise<void> {
    const vpnConfig = {
      serverHost: process.env.VPN_SERVER_HOST || 'vpn.iotistic.ca',
      serverPort: parseInt(process.env.VPN_SERVER_PORT || '1194'),
      deviceCert: process.env.DEVICE_CERT || '',
      deviceKey: process.env.DEVICE_KEY || '',
      caCert: process.env.VPN_CA_CERT || '',
      enabled: process.env.ENABLE_VPN === 'true'
    };

    if (!vpnConfig.enabled) {
      console.log('VPN disabled');
      return;
    }

    this.vpnManager = new VPNManager(vpnConfig);
    await this.vpnManager.connect();
    console.log('VPN connection established');
  }
}
```

#### B. Certificate Provisioning via Billing Service
```typescript
// billing/src/services/vpn-provisioning.ts
import { CertificateManager } from '../vpn/certificate-manager';
import { DeviceRegistry } from '../vpn/device-registry';

export class VPNProvisioningService {
  constructor(
    private certManager: CertificateManager,
    private deviceRegistry: DeviceRegistry
  ) {}

  async provisionDevice(customerId: string, deviceId: string): Promise<{
    deviceCert: string;
    deviceKey: string;
    caCert: string;
    serverHost: string;
    serverPort: number;
  }> {
    // Generate device certificate
    const { cert, key, commonName } = await this.certManager.generateDeviceCertificate(
      deviceId, 
      customerId
    );

    // Register device in VPN registry
    await this.deviceRegistry.registerDevice({
      deviceId,
      customerId,
      vpnIP: '', // Will be assigned by OpenVPN server
      commonName,
      connected: false,
      lastSeen: new Date(),
      certificateSerial: this.extractSerial(cert)
    });

    return {
      deviceCert: cert,
      deviceKey: key,
      caCert: await this.getCACertificate(),
      serverHost: process.env.VPN_SERVER_HOST || 'vpn.iotistic.ca',
      serverPort: parseInt(process.env.VPN_SERVER_PORT || '1194')
    };
  }

  private extractSerial(cert: string): string {
    // Extract serial number from certificate
    return '';
  }

  private async getCACertificate(): Promise<string> {
    // Return CA certificate
    return '';
  }
}
```

### 5. **Cloud API Integration**

#### A. Device Access via VPN
```typescript
// billing/src/services/device-tunnel.ts
export class DeviceTunnelService {
  constructor(private deviceRegistry: DeviceRegistry) {}

  async accessDevice(customerId: string, deviceId: string, path: string): Promise<any> {
    // Find device VPN IP
    const devices = await this.deviceRegistry.getDevicesByCustomer(customerId);
    const device = devices.find(d => d.deviceId === deviceId);
    
    if (!device || !device.connected) {
      throw new Error('Device not connected to VPN');
    }

    // Make request through VPN tunnel
    const url = `http://${device.vpnIP}:48484${path}`;
    const response = await fetch(url);
    
    return response.json();
  }

  async getDeviceStatus(customerId: string, deviceId: string): Promise<any> {
    return this.accessDevice(customerId, deviceId, '/v2/device');
  }

  async restartDevice(customerId: string, deviceId: string): Promise<any> {
    return this.accessDevice(customerId, deviceId, '/v1/restart');
  }
}
```

## 🚀 Deployment Strategy

### Phase 1: VPN Server Setup
1. Deploy OpenVPN server container
2. Set up Certificate Authority (CA)
3. Create device registry service
4. Implement certificate management API

### Phase 2: Device Integration
1. Add VPN client to agent container
2. Implement certificate provisioning in billing service
3. Update device provisioning flow
4. Test VPN connectivity

### Phase 3: Cloud Integration
1. Update customer dashboard for device access
2. Implement device tunneling service
3. Add VPN status monitoring
4. Create device management APIs

### Phase 4: Production Hardening
1. Add certificate revocation
2. Implement network isolation
3. Add monitoring and alerting
4. Scale VPN infrastructure

## 🔒 Security Considerations

1. **Certificate-Based Authentication**: Each device gets unique certificates
2. **Network Isolation**: Customers isolated via VPN subnets
3. **Certificate Revocation**: Ability to revoke compromised certificates
4. **Firewall Rules**: Restrict access to device APIs
5. **Audit Logging**: Log all VPN connections and device access

## 📊 Monitoring & Metrics

1. **VPN Connection Status**: Track device connectivity
2. **Certificate Expiration**: Monitor certificate validity
3. **Network Performance**: Measure VPN latency/throughput
4. **Device Health**: Monitor device status via VPN
5. **Usage Analytics**: Track API calls per customer/device

## 💰 Cost Comparison

| Component | Balena (Estimated) | Self-Hosted | Savings |
|-----------|-------------------|-------------|---------|
| VPN Infrastructure | $500/month | $50/month | 90% |
| Certificate Management | Included | $10/month | - |
| Device Registry | Included | $20/month | - |
| **Total** | **$500/month** | **$80/month** | **84%** |

*For 100 devices. Savings increase with scale.*

## ✅ Benefits of This Approach

1. **Full Control**: Own your VPN infrastructure
2. **Cost Effective**: Significantly cheaper than SaaS solutions
3. **Scalable**: Handles thousands of devices
4. **Secure**: Certificate-based authentication
5. **Integrated**: Works with your existing billing/customer system
6. **Flexible**: Customize for your specific needs

This implementation gives you Balena-level VPN functionality while maintaining full control and reducing costs significantly!