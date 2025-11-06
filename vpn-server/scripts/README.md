# VPN Testing Scripts

Scripts for testing VPN connectivity between Windows Agent and Docker services.

## Quick Start

```powershell
# From repository root (C:\Users\Dan\zemfyre-sensor)

# 1. Start Docker services with VPN
.\vpn-server\scripts\start-vpn-test.ps1

# 2. Provision a test device and get VPN config
.\vpn-server\scripts\provision-vpn-test-device.ps1

# 3. Connect to VPN using OpenVPN GUI
# Import the .ovpn file from: C:\Users\<username>\openvpn-config\

# 4. Test VPN connectivity
.\vpn-server\scripts\test-vpn-connectivity.ps1

# NOTE: Docker Compose file is at: .\vpn-server\docker-compose.test-vpn.yml

# 5. Run your agent
cd agent
npm start
```

## Scripts

### `start-vpn-test.ps1`
Starts the complete Docker testing environment:
- PostgreSQL (172.25.0.10:5432)
- Redis (172.25.0.11:6379)
- Mosquitto MQTT (172.25.0.12:1883)
- API Server (172.25.0.13:3002)
- VPN Server (172.25.0.20:1194)

**Usage:**
```powershell
# From repository root
.\vpn-server\scripts\start-vpn-test.ps1
```

**What it does:**
1. Starts all Docker containers
2. Runs database migrations
3. Checks service health
4. Displays service IP addresses
5. Shows next steps

### `provision-vpn-test-device.ps1`
Provisions a test device and generates VPN configuration.

**Usage:**
```powershell
# From repository root
# Default (random device UUID)
.\vpn-server\scripts\provision-vpn-test-device.ps1

# Custom device UUID
.\vpn-server\scripts\provision-vpn-test-device.ps1 -DeviceUuid "my-test-device-001"

# Custom API URL
.\vpn-server\scripts\provision-vpn-test-device.ps1 -ApiUrl "http://localhost:4002"

# Custom output directory
.\vpn-server\scripts\provision-vpn-test-device.ps1 -OutputDir "C:\vpn-configs"
```

**What it does:**
1. Creates a provisioning key
2. Registers the device
3. Retrieves VPN credentials
4. Saves .ovpn configuration file
5. Saves credentials to text file

**Output files:**
- `C:\Users\<username>\openvpn-config\iotistic-<uuid>.ovpn` - OpenVPN config
- `C:\Users\<username>\openvpn-config\iotistic-<uuid>-credentials.txt` - Credentials

### `test-vpn-connectivity.ps1`
Tests VPN connection and service reachability.

**Usage:**
```powershell
# From repository root
.\vpn-server\scripts\test-vpn-connectivity.ps1
```

**What it tests:**
1. VPN interface exists and has 10.8.0.x IP
2. Routes to Docker network (172.25.0.0/24)
3. VPN gateway reachable (10.8.0.1)
4. VPN server container reachable (172.25.0.20)
5. All Docker services reachable (ping test)
6. MQTT and API ports accessible
7. API HTTP endpoint responding

**Expected output:**
```
✅ VPN interface found: Ethernet 2
✅ IP is in VPN range (10.8.0.0/16)
✅ Route to Docker network exists
✅ VPN gateway is reachable
✅ All Docker services are reachable
✅ VPN connection is WORKING!
```

## Complete Testing Workflow

### Prerequisites
- Docker Desktop installed and running
- OpenVPN client installed ([download](https://openvpn.net/community-downloads/))
- Node.js and npm installed (for agent)

### Step-by-Step

#### 1. Start Docker Environment
```powershell
cd C:\Users\Dan\zemfyre-sensor
.\vpn-server\scripts\start-vpn-test.ps1
```

Wait for all services to be healthy (~30 seconds).

#### 2. Verify Services Running
```powershell
docker ps
# Should show 5 containers:
# - iotistic-postgres-test
# - iotistic-redis-test
# - iotistic-mosquitto-test
# - iotistic-api-test
# - iotistic-vpn-test
```

#### 3. Provision Test Device
```powershell
.\scripts\provision-vpn-test-device.ps1 -DeviceUuid "windows-agent-001"
```

**Expected output:**
```
✅ Provisioning key created
✅ Device registered successfully
✅ VPN is enabled
   Config saved: C:\Users\Dan\openvpn-config\iotistic-windows-agent-001.ovpn
```

#### 4. Connect to VPN

**Option A: OpenVPN GUI (Recommended)**
1. Right-click OpenVPN GUI in system tray
2. Click "Import" → "Import file..."
3. Select `C:\Users\Dan\openvpn-config\iotistic-windows-agent-001.ovpn`
4. Right-click the profile → "Connect"

**Option B: Command Line**
```powershell
cd "C:\Program Files\OpenVPN\bin"
.\openvpn.exe --config "C:\Users\Dan\openvpn-config\iotistic-windows-agent-001.ovpn"
```

**Expected output:**
```
Initialization Sequence Completed
Peer Connection Initiated with [AF_INET]127.0.0.1:1194
ifconfig 10.8.0.5 255.255.0.0
```

#### 5. Verify VPN Connection
```powershell
# Check VPN interface
ipconfig | Select-String -Pattern "OpenVPN"

# Should show:
# Ethernet adapter Ethernet 2:
#    IPv4 Address. . . . . . . . . . . : 10.8.0.5

# Run connectivity test
.\scripts\test-vpn-connectivity.ps1
```

#### 6. Test Service Access
```powershell
# Ping services
ping 172.25.0.12  # MQTT
ping 172.25.0.13  # API

# Test MQTT (if mosquitto_pub installed)
mosquitto_pub -h 172.25.0.12 -p 1883 -u admin -P iotistic42! -t test -m "hello via vpn"

# Test API
curl http://172.25.0.13:3002/health
```

#### 7. Configure and Run Agent
```powershell
cd C:\Users\Dan\zemfyre-sensor\agent

# Set environment variables (from provisioning response)
$env:DEVICE_UUID = "windows-agent-001"
$env:MQTT_BROKER = "mqtt://172.25.0.12:1883"
$env:MQTT_USERNAME = "device-windows-agent-001"
$env:MQTT_PASSWORD = "<from-provisioning>"
$env:CLOUD_API_ENDPOINT = "http://172.25.0.13:3002"

# Start agent
npm start
```

**Expected agent logs:**
```
🌐 Agent starting...
✅ VPN Connected: 10.8.0.5
🔌 Connecting to MQTT: mqtt://172.25.0.12:1883
✅ MQTT Connected
📡 Connecting to API: http://172.25.0.13:3002
✅ API Connected
🚀 Agent ready
```

#### 8. Verify Agent Connection
```powershell
# Check device in database
docker exec iotistic-postgres-test psql -U postgres -d iotistic -c `
  "SELECT uuid, is_online, vpn_ip_address, last_seen_at FROM devices WHERE uuid = 'windows-agent-001';"

# Expected:
#         uuid         | is_online | vpn_ip_address |      last_seen_at
# ---------------------+-----------+----------------+------------------------
#  windows-agent-001   | t         | 10.8.0.5       | 2025-11-05 10:30:00

# Check VPN server logs
docker logs iotistic-vpn-test | Select-String -Pattern "windows-agent-001"
# Should show: "device-windows-agent-001 connected from 172.17.0.1"

# Check MQTT messages
docker exec iotistic-mosquitto-test mosquitto_sub -t '#' -v
```

## Troubleshooting

### Issue: VPN Server Not Starting
```powershell
# Check logs
docker logs iotistic-vpn-test

# Common causes:
# - Port 1194 already in use
# - NET_ADMIN capability not available
# - TUN/TAP kernel module not loaded

# Solution: Check Docker Desktop settings
# - Use WSL2 backend (not Hyper-V)
# - Enable "Expose daemon on tcp://localhost:2375"
```

### Issue: VPN Connects But Can't Reach Services
```powershell
# Check routes
route print | Select-String -Pattern "172.25.0.0"

# Should show:
# Network Destination    Netmask         Gateway       Interface
# 172.25.0.0             255.255.255.0   10.8.0.1      10.8.0.5

# If missing, VPN server is not pushing routes
# Check VPN server config:
docker exec iotistic-vpn-test cat /etc/openvpn/config/server-test.conf | Select-String -Pattern "push"
```

### Issue: Agent Can't Connect to MQTT
```powershell
# Test MQTT directly
mosquitto_pub -h 172.25.0.12 -p 1883 -u admin -P iotistic42! -t test -m "test"

# If this works but agent fails:
# - Check agent MQTT credentials
# - Check agent MQTT broker URL (use IP, not hostname)
# - Check agent logs for connection errors

# If this fails:
# - VPN routing issue
# - MQTT container not running
# - Firewall blocking traffic
```

### Issue: "No route to host" Errors
```powershell
# Check iptables NAT rules in VPN container
docker exec iotistic-vpn-test iptables -t nat -L -n -v

# Should show MASQUERADE rule:
# Chain POSTROUTING (policy ACCEPT)
# target     prot opt source               destination
# MASQUERADE all  --  10.8.0.0/16          0.0.0.0/0

# If missing, add manually:
docker exec iotistic-vpn-test iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o eth0 -j MASQUERADE
docker exec iotistic-vpn-test iptables -A FORWARD -i tun0 -o eth0 -j ACCEPT
```

### Issue: Database Migration Fails
```powershell
# Run migration manually
docker exec iotistic-api-test npm run migrate

# Or run SQL directly
docker exec iotistic-postgres-test psql -U postgres -d iotistic -f /path/to/migration.sql
```

## Cleanup

```powershell
# Stop all containers
docker-compose -f docker-compose.test-vpn.yml down

# Remove volumes (CAUTION: deletes all data)
docker-compose -f docker-compose.test-vpn.yml down -v

# Disconnect VPN
# - OpenVPN GUI: Right-click profile → "Disconnect"

# Remove VPN config files
Remove-Item -Path "$env:USERPROFILE\openvpn-config\iotistic-*" -Force
```

## Network Diagram

```
Windows Host
├─ Ethernet/Wi-Fi: 192.168.1.x (your network)
├─ Docker Bridge: 172.17.0.1
└─ OpenVPN TAP: 10.8.0.5 (VPN client IP)
   │
   └─ VPN Tunnel to localhost:1194
      │
      ▼
   Docker Desktop (WSL2)
   └─ Network: iotistic-test-net (172.25.0.0/24)
      ├─ Gateway: 172.25.0.1
      ├─ VPN Server: 172.25.0.20 (gateway 10.8.0.1)
      ├─ PostgreSQL: 172.25.0.10:5432
      ├─ Redis: 172.25.0.11:6379
      ├─ Mosquitto: 172.25.0.12:1883
      └─ API: 172.25.0.13:3002
```

## Service URLs

| Service | From Windows (Direct) | From Windows (via VPN) |
|---------|----------------------|------------------------|
| PostgreSQL | `localhost:5432` | `172.25.0.10:5432` |
| Redis | `localhost:6379` | `172.25.0.11:6379` |
| MQTT | `localhost:1883` | `172.25.0.12:1883` |
| API | `localhost:3002` | `172.25.0.13:3002` |
| VPN Server | `localhost:1194` | N/A (already connected) |

## Next Steps

After successful testing:
1. Test with remote VPN server (cloud deployment)
2. Test with multiple devices simultaneously
3. Add VPN connection monitoring to agent
4. Implement auto-reconnect logic
5. Add VPN metrics to agent heartbeat
6. Test failover scenarios (VPN disconnect/reconnect)

## See Also

- [VPN-LOCAL-TEST-GUIDE.md](../VPN-LOCAL-TEST-GUIDE.md) - Detailed setup guide
- [vpn-server/README.md](../vpn-server/README.md) - VPN server documentation
- [agent/README.md](../agent/README.md) - Agent documentation
