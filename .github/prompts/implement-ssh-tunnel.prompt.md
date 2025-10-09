---
mode: agent
---

# Implement SSH Reverse Tunnel for Remote Device Access

## Context
Raspberry Pi devices are often behind NAT/firewalls. SSH reverse tunnels enable remote access to the Device API (port 48484) from a cloud server without port forwarding.

## Requirements

### Device Side
1. Generate ED25519 SSH key pair
2. Copy public key to cloud server
3. Establish reverse tunnel: `ssh -R 48484:localhost:48484 user@cloud-server`
4. Auto-reconnect on failure
5. Health checks to verify tunnel is alive

### Cloud Server Side
1. SSH server configuration: `GatewayPorts yes`, `ClientAliveInterval 60`
2. Create dedicated tunnel user with restricted access
3. Accept public key from devices

## Implementation Components

### 1. SSH Tunnel Manager (`agent/src/remote-access/ssh-tunnel.ts`)
```typescript
export class SSHTunnelManager {
  async connect(): Promise<void>
  async disconnect(): Promise<void>
  async healthCheck(): Promise<boolean>
  async validateKeyPermissions(): Promise<void>
}
```

### 2. Integration in Supervisor (`agent/src/supervisor.ts`)
- Initialize tunnel manager on startup
- Configure from environment variables
- Graceful shutdown cleanup

### 3. Setup Script (`bin/install.sh::setup_remote_access()`)
- Interactive prompts for cloud host and SSH user
- Generate SSH keys (ED25519, 600 permissions)
- Copy keys to cloud server using ssh-copy-id
- Test connection
- Update .env file with configuration

### 4. Environment Variables
```bash
ENABLE_REMOTE_ACCESS=true
CLOUD_HOST=cloud.example.com
SSH_TUNNEL_USER=tunnel
SSH_KEY_PATH=/app/data/ssh/id_rsa
SSH_AUTO_RECONNECT=true
SSH_RECONNECT_DELAY=5000
```

## Task

Implement or verify SSH reverse tunnel functionality:
1. Create SSHTunnelManager class with auto-reconnect
2. Integrate into device agent supervisor
3. Add setup_remote_access() to install.sh
4. Update docker-compose to pass environment variables
5. Create documentation for cloud server setup
6. Test connection from cloud server to device

## Key Files
- `agent/src/remote-access/ssh-tunnel.ts`
- `agent/src/supervisor.ts`
- `bin/install.sh` (setup_remote_access function)
- `docker-compose.yml.tmpl` (environment variables)
- `docs/SSH-TUNNEL-IMPLEMENTATION.md` (if exists)

## Success Criteria
- Device successfully establishes reverse tunnel to cloud server
- Tunnel auto-reconnects on failure
- Health checks detect failed tunnels
- Cloud server can access Device API: `curl http://localhost:48484/v2/device`
- SSH key permissions validated (600)
- Installation script integrates tunnel setup
