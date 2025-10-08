# Remote Device Access via SSH Reverse Tunnel
**Alternative to VPN for simplified architecture**

## Overview

Instead of VPN, use SSH reverse tunnels to enable remote device access. Much simpler than OpenVPN!

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SSH TUNNEL APPROACH                       │
└─────────────────────────────────────────────────────────────┘

     Internet
        │
        ▼
┌────────────────────────┐
│   Cloud Server         │
│   - Port 3000 (API)    │
│   - Port 22 (SSH)      │◄───── SSH Server
│   - Port 48484 (tunnel)│
└────────┬───────────────┘
         │
         │ SSH Reverse Tunnel
         │ (device → cloud)
         │
         ▼
┌────────────────────────┐
│   Device               │
│   ┌──────────────────┐ │
│   │ Supervisor       │ │
│   │ - Device API     │◄── Port 48484
│   │   (localhost)    │ │
│   │ - SSH Client     │ │
│   └──────────────────┘ │
└────────────────────────┘
```

## How It Works

### Device → Cloud (Reverse Tunnel)

Device creates SSH tunnel that forwards its local Device API to cloud:

```bash
# On device, run:
ssh -R 48484:localhost:48484 tunnel@cloud-server -N -f

# Now cloud can access device's API at:
# http://localhost:48484/v2/device
```

## Implementation

### 1. Cloud Server Setup

```bash
# Install SSH server (if not already)
sudo apt-get install openssh-server

# Create tunnel user
sudo useradd -m -s /bin/bash tunnel
sudo passwd tunnel

# Configure SSH for tunneling
sudo nano /etc/ssh/sshd_config
```

Add to `sshd_config`:
```
# Allow reverse tunneling
GatewayPorts yes

# Keep connections alive
ClientAliveInterval 60
ClientAliveCountMax 3
```

```bash
# Restart SSH
sudo systemctl restart sshd
```

### 2. Device Setup

Create SSH tunnel manager:

```typescript
// src/remote-access/ssh-tunnel.ts
import { spawn } from 'child_process';

export class SSHTunnelManager {
  private process: any;
  private config: {
    cloudHost: string;
    cloudPort: number;
    localPort: number;
    sshUser: string;
    sshKey: string;
  };

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const args = [
      '-R', `${this.config.localPort}:localhost:${this.config.localPort}`,
      '-i', this.config.sshKey,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ServerAliveInterval=60',
      '-o', 'ServerAliveCountMax=3',
      '-N', // Don't execute remote command
      '-T', // Disable TTY
      `${this.config.sshUser}@${this.config.cloudHost}`,
    ];

    console.log('🔌 Establishing SSH tunnel...');
    this.process = spawn('ssh', args);

    this.process.on('close', (code: number) => {
      console.log(`⚠️  SSH tunnel closed with code ${code}`);
      // Auto-reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    });

    this.process.stderr.on('data', (data: Buffer) => {
      console.error('SSH tunnel error:', data.toString());
    });

    console.log('✅ SSH tunnel established');
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
    }
  }
}
```

### 3. Integrate into Supervisor

```typescript
// src/supervisor.ts
import { SSHTunnelManager } from './remote-access/ssh-tunnel';

export default class DeviceSupervisor {
  private sshTunnel?: SSHTunnelManager;
  
  private async initializeRemoteAccess(): Promise<void> {
    if (!process.env.ENABLE_REMOTE_ACCESS) {
      console.log('⚠️  Remote access disabled');
      return;
    }

    console.log('🔌 Initializing remote access...');
    
    this.sshTunnel = new SSHTunnelManager({
      cloudHost: process.env.CLOUD_HOST || 'cloud.example.com',
      cloudPort: 22,
      localPort: this.DEVICE_API_PORT, // 48484
      sshUser: process.env.SSH_TUNNEL_USER || 'tunnel',
      sshKey: process.env.SSH_KEY_PATH || '/data/ssh/id_rsa',
    });

    await this.sshTunnel.connect();
    console.log('✅ Remote access enabled');
  }
}
```

### 4. Environment Variables

```bash
# Device .env
ENABLE_REMOTE_ACCESS=true
CLOUD_HOST=your-cloud-server.com
SSH_TUNNEL_USER=tunnel
SSH_KEY_PATH=/data/ssh/id_rsa
```

## Usage

### Access Device Remotely

From cloud server:

```bash
# Device API is now accessible locally on cloud
curl http://localhost:48484/v2/device
curl http://localhost:48484/v2/applications/state

# Or use device UUID to track multiple devices
# Store mapping: uuid → port in cloud database
```

### Multiple Devices

Each device uses different port:

```typescript
// Cloud API tracks device tunnels
const deviceTunnels = new Map<string, number>();
// uuid → port mapping
// device-1 → 48484
// device-2 → 48485
// device-3 → 48486
```

Device connects:
```bash
# Device 1
ssh -R 48484:localhost:48484 tunnel@cloud -N

# Device 2  
ssh -R 48485:localhost:48484 tunnel@cloud -N

# Device 3
ssh -R 48486:localhost:48484 tunnel@cloud -N
```

## Security

### Generate SSH Keys on Device

```bash
# On device
ssh-keygen -t ed25519 -f /data/ssh/id_rsa -N ""

# Copy public key to cloud
ssh-copy-id -i /data/ssh/id_rsa.pub tunnel@cloud-server
```

### Restrict tunnel user

On cloud server:
```bash
# Edit /home/tunnel/.ssh/authorized_keys
command="echo 'Tunnel only'",no-pty,no-X11-forwarding ssh-ed25519 AAAA...
```

## Advantages vs VPN

| Feature | VPN (OpenVPN) | SSH Tunnel |
|---------|---------------|------------|
| Setup Complexity | High | Low |
| Dependencies | OpenVPN client/server | SSH (built-in) |
| Certificates | PKI required | SSH keys |
| Firewall | Special rules | SSH (port 22) |
| Routing | Full network | Port forwarding |
| Multi-device | Easy | Need port mapping |
| Security | ✅ Very secure | ✅ Very secure |

## Monitoring

Add tunnel health check:

```typescript
class SSHTunnelManager {
  async healthCheck(): Promise<boolean> {
    // Try to connect to local Device API through tunnel
    try {
      const response = await fetch('http://localhost:48484/v1/healthy');
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

## Alternative: Cloudflare Tunnel

Even simpler - use Cloudflare's free tunnel service:

```bash
# On device
cloudflared tunnel --url http://localhost:48484
# Returns: https://random-name.trycloudflare.com

# Now accessible from anywhere!
```

No SSH server needed on cloud side!

## Recommendation

For your simplified architecture:

1. **Start without remote access** - Just use HTTP polling ✅ (current)
2. **Add SSH tunnels** - If you need occasional remote access 👍
3. **Use Cloudflare Tunnel** - Easiest for dev/testing 🚀
4. **Avoid VPN** - Too complex for your use case ❌

Your current polling architecture is perfect for fleet management. Add remote access only if you really need it!
