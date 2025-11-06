# ✅ VPN Testing Setup Complete

Your VPN testing environment for **Windows Agent + Docker Desktop** is ready!

## 📦 What Was Created

### Docker Compose Configuration
- **File**: `vpn-server/docker-compose.test-vpn.yml`
- **Services**: PostgreSQL, Redis, Mosquitto, API, VPN Server
- **Network**: 172.25.0.0/24 with static IPs
- **VPN Subnet**: 10.8.0.0/16

### PowerShell Scripts (in `vpn-server/scripts/` folder)
1. **`start-vpn-test.ps1`** - Starts all Docker services
2. **`provision-vpn-test-device.ps1`** - Creates device and VPN config
3. **`test-vpn-connectivity.ps1`** - Verifies VPN connection

### VPN Server Configuration
- **File**: `vpn-server/config/server-test.conf`
- **Port**: 1194/UDP (exposed to Windows)
- **Routes**: Pushes 172.25.0.0/24 to clients

### Documentation
- **`vpn-server/VPN-LOCAL-TEST-GUIDE.md`** - Complete testing guide (350+ lines)
- **`vpn-server/scripts/README.md`** - Quick reference for scripts

## 🚀 Quick Start (3 Commands)

```powershell
# 1. Start Docker environment
.\vpn-server\scripts\start-vpn-test.ps1

# 2. Create test device and get VPN config
.\vpn-server\scripts\provision-vpn-test-device.ps1

# 3. Import config in OpenVPN GUI and connect
# File: C:\Users\<username>\openvpn-config\iotistic-<uuid>.ovpn
```

## 🔍 Testing Flow

```
Step 1: Start Docker Services
   ↓
Step 2: Provision Device (get VPN credentials)
   ↓
Step 3: Connect to VPN (OpenVPN GUI)
   ↓
Step 4: Test Connectivity (ping services)
   ↓
Step 5: Run Agent (with service IPs)
   ↓
Step 6: Verify (check logs, database)
```

## 📋 Key Service IPs (After VPN Connection)

| Service | IP Address | Port | Usage |
|---------|-----------|------|-------|
| VPN Gateway | 10.8.0.1 | - | Your VPN tunnel endpoint |
| PostgreSQL | 172.25.0.10 | 5432 | Database |
| Redis | 172.25.0.11 | 6379 | Cache |
| **Mosquitto** | **172.25.0.12** | **1883** | **MQTT Broker** |
| **API** | **172.25.0.13** | **3002** | **API Server** |
| VPN Server | 172.25.0.20 | 1194 | VPN server container |

## 🎯 Agent Configuration (After VPN Connection)

```powershell
# Set these environment variables for your agent
$env:MQTT_BROKER = "mqtt://172.25.0.12:1883"
$env:CLOUD_API_ENDPOINT = "http://172.25.0.13:3002"
$env:DEVICE_UUID = "your-device-uuid"
$env:MQTT_USERNAME = "device-your-device-uuid"
$env:MQTT_PASSWORD = "from-provisioning-response"

cd agent
npm start
```

## ✅ How It Works

### Without VPN (Original)
```
Windows Agent
   ↓ localhost:1883
Docker Desktop (Port Forwarding)
   ↓
Mosquitto Container
```

### With VPN (New)
```
Windows Agent
   ↓ VPN Tunnel (localhost:1194)
VPN Server Container (10.8.0.1)
   ↓ iptables NAT
Docker Network (172.25.0.0/24)
   ↓ Direct IP routing
Mosquitto Container (172.25.0.12:1883)
```

**Benefits**:
- ✅ Simulates production multi-tenant architecture
- ✅ Each device gets unique VPN IP (10.8.0.x)
- ✅ Secure encrypted tunnel (even locally)
- ✅ Services accessed via internal IPs (not exposed ports)
- ✅ Same pattern as Kubernetes deployment

## 🧪 Testing Checklist

- [ ] Docker Desktop running and healthy
- [ ] Run `.\vpn-server\scripts\start-vpn-test.ps1` (all services up)
- [ ] Run `.\vpn-server\scripts\provision-vpn-test-device.ps1` (device created)
- [ ] OpenVPN client installed
- [ ] Import .ovpn file and connect
- [ ] Run `.\vpn-server\scripts\test-vpn-connectivity.ps1` (all tests pass)
- [ ] Configure agent with service IPs
- [ ] Run agent and verify connectivity
- [ ] Check database: device shows `vpn_ip_address = 10.8.0.x`

## 📚 Documentation Links

- **Quick Reference**: `scripts/README.md` (in this folder)
- **Detailed Guide**: `VPN-LOCAL-TEST-GUIDE.md` (in this folder)
- **VPN Server Docs**: `README.md` (in this folder)
- **Agent Docs**: `../agent/README.md`

## 🎉 What's Different from K8s Setup?

| Aspect | Local (Docker Desktop) | Production (K8s) |
|--------|------------------------|------------------|
| VPN Server | Single container | Per-customer pod |
| Network | Docker bridge | K8s network |
| Service IPs | 172.25.0.x | 10.96.0.x (ClusterIP) |
| VPN URL | localhost:1194 | vpn-{customer}.{domain}:1194 |
| Agent | Windows native | Containerized |
| Testing | Single device | Multi-tenant |

**Key Point**: The VPN routing pattern is **identical**. Once agent connects to VPN, it uses internal IPs to reach services - just like production!

## 🔧 Troubleshooting Commands

```powershell
# Check Docker services
docker ps
docker logs iotistic-vpn-test -f

# Check VPN connection
ipconfig | Select-String "OpenVPN"
route print | Select-String "172.25.0.0"

# Test connectivity
ping 10.8.0.1  # VPN gateway
ping 172.25.0.12  # MQTT
.\scripts\test-vpn-connectivity.ps1

# Check database
docker exec iotistic-postgres-test psql -U postgres -d iotistic -c "SELECT * FROM devices;"

# Check MQTT messages
docker exec iotistic-mosquitto-test mosquitto_sub -t '#' -v
```

## 🚦 Next Steps

1. **Test locally**: Follow quick start above
2. **Verify agent works**: Check logs and database
3. **Test edge cases**: Disconnect/reconnect VPN
4. **Monitor traffic**: Use Wireshark on UDP 1194
5. **Move to cloud**: Deploy to K8s cluster with same pattern

## 📞 Support

If you encounter issues:

1. **Check scripts output**: All scripts provide detailed error messages
2. **Check Docker logs**: `docker logs <container-name>`
3. **Check VPN logs**: OpenVPN GUI → View Logs
4. **Run connectivity test**: `.\vpn-server\scripts\test-vpn-connectivity.ps1`
5. **Read troubleshooting**: `VPN-LOCAL-TEST-GUIDE.md` has 10+ common issues

---

**Ready to test!** 🎊

Start with: `.\vpn-server\scripts\start-vpn-test.ps1`
