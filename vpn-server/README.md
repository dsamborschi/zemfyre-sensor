# VPN Server for Iotistic Platform

OpenVPN server infrastructure for secure cloud-to-device connectivity, similar to Balena's VPN architecture.

## 🏗️ Architecture Overview

This VPN server provides secure tunneling between the Iotistic cloud platform and IoT devices deployed in the field. Each device gets a unique certificate and VPN IP address for secure communication.

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
                                                └─────────────────┘
```

## 🔧 Components

### Core Services
- **OpenVPN Server**: Handles VPN connections and routing
- **Certificate Manager**: PKI certificate generation and management
- **Device Registry**: Tracks connected devices and their VPN IPs
- **Connection Monitor**: Monitors device connections and health

### Security Features
- **Certificate-based Authentication**: Each device gets unique certificates
- **Customer Isolation**: Network segmentation per customer namespace
- **Certificate Revocation**: Ability to revoke compromised certificates
- **Audit Logging**: Complete connection and access logging

## 📁 Directory Structure

```
vpn-server/
├── src/                    # TypeScript source code
│   ├── certificate-manager.ts
│   ├── device-registry.ts
│   ├── connection-monitor.ts
│   └── vpn-server.ts
├── config/                 # OpenVPN configuration files
│   ├── server.conf
│   └── client-template.conf
├── scripts/                # Setup and management scripts
│   ├── init-pki.sh
│   ├── generate-ca.sh
│   └── generate-client.sh
├── k8s/                    # Kubernetes deployment manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

## 🚀 Quick Start

### 1. Initialize PKI (Certificate Authority)
```bash
cd vpn-server
./scripts/init-pki.sh
```

### 2. Start VPN Server (Docker Compose)
```bash
docker-compose up -d
```

### 3. Generate Device Certificate
```bash
./scripts/generate-client.sh device-001 customer-abc123
```

### 4. Deploy to Kubernetes
```bash
kubectl apply -f k8s/
```

## 🔌 Integration with Iotistic Platform

### Billing Service Integration
The VPN server integrates with the existing billing service to:
- Generate device certificates during customer provisioning
- Track VPN usage and connectivity metrics
- Manage certificate lifecycle and revocation

### Device Agent Integration
IoT devices use the VPN to:
- Establish secure connection to cloud platform
- Receive target state updates
- Report device metrics and status
- Enable remote management and debugging

### Customer Dashboard Integration
Customers can:
- View connected devices and their VPN status
- Access device logs and metrics through VPN tunnel
- Manage device certificates and connectivity

## 📊 Monitoring

### Connection Status
- Real-time device connectivity tracking
- VPN IP address assignment monitoring
- Connection quality and latency metrics

### Certificate Management
- Certificate expiration alerts
- Certificate revocation tracking
- PKI health monitoring

### Usage Analytics
- Data transfer statistics per device/customer
- Connection duration and frequency
- API access patterns through VPN

## 🔒 Security

### Network Isolation
- Each customer gets isolated VPN subnet (10.8.x.0/24)
- Firewall rules prevent cross-customer access
- Device-to-device communication within same customer only

### Certificate Security
- 2048-bit RSA certificates with 1-year validity
- Certificate revocation list (CRL) support
- Automatic certificate rotation before expiration

### Audit Trail
- All VPN connections logged with timestamps
- Device authentication events tracked
- API access through VPN monitored and logged

## 🎯 Benefits

1. **Cost Effective**: Self-hosted alternative to Balena's VPN service
2. **Full Control**: Complete ownership of VPN infrastructure
3. **Scalable**: Handles thousands of devices efficiently
4. **Secure**: Enterprise-grade certificate-based authentication
5. **Integrated**: Native integration with Iotistic platform

## 📈 Scalability

- **Single Server**: Up to 1,000 concurrent connections
- **Load Balanced**: Multiple VPN servers for high availability
- **Horizontal Scaling**: Add servers as device count grows
- **Performance**: UDP-based protocol for optimal throughput

## 🔧 Configuration

### Environment Variables
```bash
VPN_SERVER_HOST=vpn.iotistic.ca
VPN_SERVER_PORT=1194
VPN_SUBNET=10.8.0.0/16
VPN_CA_CERT_PATH=/etc/openvpn/ca.crt
VPN_SERVER_CERT_PATH=/etc/openvpn/server.crt
VPN_SERVER_KEY_PATH=/etc/openvpn/server.key
DATABASE_URL=postgresql://user:pass@postgres:5432/vpn_registry
```

### OpenVPN Server Configuration
See `config/server.conf` for complete OpenVPN server configuration including:
- Network topology and IP allocation
- Security settings and cipher selection
- Client connection management
- Logging and monitoring configuration

## 🧪 Testing

### Local Development
```bash
# Start VPN server locally
docker-compose up -d

# Generate test client certificate
./scripts/generate-client.sh test-device test-customer

# Test client connection
openvpn --config client-configs/test-device.ovpn
```

### Kubernetes Testing
```bash
# Deploy to test namespace
kubectl apply -f k8s/ -n vpn-test

# Check VPN server status
kubectl logs -f deployment/vpn-server -n vpn-test

# Test device connection
kubectl port-forward service/vpn-server 1194:1194 -n vpn-test
```

## 📚 Documentation

- [VPN Architecture Plan](../docs/VPN-ARCHITECTURE-PLAN.md) - Complete implementation strategy
- [Certificate Management](./docs/CERTIFICATE-MANAGEMENT.md) - PKI setup and management
- [Device Integration](./docs/DEVICE-INTEGRATION.md) - Client-side VPN setup
- [Kubernetes Deployment](./docs/K8S-DEPLOYMENT.md) - Production deployment guide

## 🤝 Contributing

1. Follow existing TypeScript patterns from the main Iotistic codebase
2. Use the same logging and error handling conventions
3. Integrate with existing monitoring and metrics collection
4. Maintain compatibility with multi-tenant architecture

This VPN server provides enterprise-grade device connectivity while maintaining the cost-effectiveness and control that makes Iotistic a compelling alternative to hosted IoT platforms.