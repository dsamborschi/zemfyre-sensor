# Zemfyre Sensor - IoT Temperature Monitoring System

A comprehensive IoT solution for temperature monitoring using MAX31855 thermocouple sensors with Raspberry Pi, featuring real-time data visualization, machine learning capabilities, and kiosk mode display.

## 🌟 Features

- **Temperature Monitoring**: Real-time temperature sensing using MAX31855 thermocouple sensors
- **IoT Stack**: Complete containerized solution with Docker Compose
- **Data Visualization**: Grafana dashboards for real-time monitoring and historical analysis
- **Data Storage**: InfluxDB time-series database for sensor data
- **MQTT Communication**: Eclipse Mosquitto broker for sensor data streaming
- **Automation**: Node-RED for IoT workflows and data processing
- **Machine Learning**: Custom Node-RED ML nodes for predictive analytics
- **Kiosk Mode**: Full-screen dashboard display for dedicated monitoring stations
- **Web Admin**: Management interface for system configuration
- **Multi-Platform**: Supports Raspberry Pi (1-5), x86_64, and ARM architectures

## 📋 Table of Contents

- [Architecture](#architecture)
- [Hardware Requirements](#hardware-requirements)
- [Software Requirements](#software-requirements)
- [Quick Start](#quick-start)
- [Installation Methods](#installation-methods)
- [Service Configuration](#service-configuration)
- [Usage](#usage)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🏗️ Architecture

The system consists of several containerized services:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MAX31855      │    │   Raspberry Pi  │    │   Web Client    │
│  Thermocouple   │───▶│   GPIO Reader   │───▶│   Dashboard     │
│   Sensor        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Container Stack                      │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│    Mosquitto    │    Node-RED     │    InfluxDB     │   Grafana   │
│  MQTT Broker    │  Flow Engine    │  Time Series    │ Visualization│
│   Port: 1883    │  Port: 1880     │   Port: 8086    │ Port: 3000  │
└─────────────────┴─────────────────┴─────────────────┴─────────────┤
│                         Nginx Reverse Proxy                     │
│                           Port: 80                              │
└─────────────────────────────────────────────────────────────────┘
```

### Service Overview

| Service | Purpose | Default Port | Container Name |
|---------|---------|--------------|----------------|
| **Nginx** | Reverse proxy & web server | 80 | nginx |
| **Mosquitto** | MQTT message broker | 1883/9001 | mosquitto |
| **Node-RED** | IoT flow programming | 1880 | nodered |
| **InfluxDB** | Time-series database | 8086 | influxdb |
| **Grafana** | Data visualization | 3000 | grafana |
| **MAX31855** | Temperature sensor reader | - | max31855 |
| **Admin Panel** | System management | 51850 | admin |

## 🔧 Hardware Requirements

### Minimum Requirements
- **Raspberry Pi 2 or newer** (Pi 1 supported but not recommended)
- **8GB+ SD Card** (16GB+ recommended)
- **Stable power supply** (5V 2.5A minimum for Pi 3+)
- **Network connectivity** (Ethernet or WiFi)

### Sensor Hardware
- **MAX31855 Thermocouple Amplifier**
- **K-Type Thermocouple** (or compatible)
- **GPIO connections**:
  - CS Pin: GPIO 27
  - Clock Pin: GPIO 22
  - Data Pin: GPIO 17

### Alternative Platforms
- **x86_64 Linux** systems (Ubuntu, Debian)
- **ARM64** single-board computers

## 💻 Software Requirements

### Target System (Raspberry Pi)
- **Debian/Raspbian** 11+ (Bullseye or newer)
- **Python 3.9+**
- **Docker & Docker Compose** (installed automatically)
- **GPIO access** (for sensor communication)

### Development/Control System
- **Python 3.7+**
- **Ansible** (for automated deployment)
- **Git**
- **SSH access** to target system

## 🚀 Quick Start

### Option 1: Automated Installation (Recommended)

For a completely automated setup on a fresh Raspberry Pi:

```bash
# Download and run the installer
curl -fsSL https://raw.githubusercontent.com/dsamborschi/zemfyre-sensor/master/bin/install.sh | bash
```

This will:
- ✅ Install all dependencies
- ✅ Configure the system
- ✅ Deploy all services
- ✅ Set up kiosk mode (optional)
- ✅ Configure networking (optional)

### Option 2: Manual Installation

1. **Clone the repository**:
```bash
git clone https://github.com/dsamborschi/zemfyre-sensor.git
cd zemfyre-sensor
```

2. **Run the installer**:
```bash
chmod +x bin/install.sh
./bin/install.sh
```

3. **Follow the interactive prompts** to configure your installation

## 📦 Installation Methods

### Method 1: Direct Installation
Perfect for single Raspberry Pi setups:

```bash
# SSH into your Raspberry Pi
ssh pi@<raspberry-pi-ip>

# Download and run installer
curl -fsSL https://raw.githubusercontent.com/dsamborschi/zemfyre-sensor/master/bin/install.sh | bash
```

### Method 2: Ansible Deployment
Ideal for multiple devices or remote deployment:

1. **Configure inventory**:
```bash
# Edit hosts.ini with your Pi's details
echo "pi@192.168.1.100 ansible_ssh_pass=yourpassword" > hosts.ini
```

2. **Run deployment**:
```bash
cd ansible
ansible-playbook -i ../hosts.ini deploy.yml
```

### Method 3: Development Setup
For development and testing:

```bash
# Clone repository
git clone https://github.com/dsamborschi/zemfyre-sensor.git
cd zemfyre-sensor

# Start development stack
docker-compose -f docker-compose.dev.yml up -d
```

## ⚙️ Service Configuration

### Environment Variables

Create `.env` file to customize port mappings:

```bash
# External port mappings
MOSQUITTO_PORT_EXT=51883
MOSQUITTO_WS_PORT_EXT=59001
NODERED_PORT_EXT=51880
INFLUXDB_PORT_EXT=58086
GRAFANA_PORT_EXT=53000
ADMIN_PORT=51850

# InfluxDB Configuration
INFLUXDB_INIT_ORG=Zemfyre
INFLUXDB_INIT_BUCKET=ZUS80LP

# Network Configuration
NTP_SERVER_IP=192.168.1.100
KIOSK_IP=192.168.1.30/24
```

### Sensor Configuration

Edit `max31855/max31855_reader.py` for sensor settings:

```python
# GPIO Pin Configuration
cs_pin = 27      # Chip Select
clock_pin = 22   # Clock
data_pin = 17    # Data

# MQTT Settings
MQTT_BROKER = "mosquitto"
MQTT_TOPIC = "sensor/temperature"

# Temperature Units
units = "c"      # 'c' for Celsius, 'f' for Fahrenheit, 'k' for Kelvin
```

## 📊 Usage

### Accessing Services

After installation, access your services at:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | `http://<pi-ip>/dashboard/kiosk` | Full-screen monitoring dashboard |
| **Grafana** | `http://<pi-ip>:3000` | Data visualization (admin/admin) |
| **Node-RED** | `http://<pi-ip>:1880` | Flow programming interface |
| **InfluxDB** | `http://<pi-ip>:8086` | Database management |
| **Admin Panel** | `http://<pi-ip>:51850` | System management |

### Default Credentials

- **Grafana**: `admin` / `admin` (change on first login)
- **InfluxDB**: Setup wizard on first access

### MQTT Topics

- **Temperature Data**: `sensor/temperature`
- **System Status**: `system/status`
- **Alerts**: `alerts/temperature`

### Temperature Monitoring

The system automatically:
1. **Reads** temperature from MAX31855 sensor every second
2. **Publishes** data to MQTT broker
3. **Stores** historical data in InfluxDB
4. **Visualizes** real-time and historical data in Grafana
5. **Triggers** alerts based on configured thresholds

## 🛠️ Development

### Project Structure

```
zemfyre-sensor/
├── admin/                  # Web admin interface
├── ansible/               # Deployment automation
│   ├── roles/
│   │   ├── system/        # System configuration
│   │   ├── network/       # Network setup
│   │   └── kiosk/         # Kiosk mode setup
│   └── deploy.yml         # Main playbook
├── api/                   # REST API service
├── bin/                   # Installation scripts
├── grafana/               # Grafana configuration
├── influx/                # InfluxDB setup
├── max31855/              # Temperature sensor code
├── mosquitto/             # MQTT broker config
├── nginx/                 # Reverse proxy config
├── nodered/               # Node-RED flows and nodes
└── portainer/             # Container management
```

### Adding Custom Sensors

1. **Create sensor directory**:
```bash
mkdir sensors/your-sensor
cd sensors/your-sensor
```

2. **Implement sensor reader**:
```python
# your_sensor_reader.py
import paho.mqtt.client as mqtt

# Your sensor code here
# Publish to MQTT: mqtt_client.publish("sensor/your-data", payload)
```

3. **Add to Docker Compose**:
```yaml
your-sensor:
  build: ./sensors/your-sensor
  volumes:
    - /dev:/dev
  privileged: true
  networks:
    - zemfyre-net
```

### Custom Node-RED Nodes

The system includes custom machine learning nodes:
- **Dataset Management**: Load, create, split datasets
- **Model Training**: Various ML algorithms
- **Prediction**: Real-time inference
- **Evaluation**: Model performance metrics

## 🔧 Troubleshooting

### Common Issues

**Service Won't Start**:
```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs <service-name>

# Restart services
docker-compose restart
```

**Sensor Not Reading**:
```bash
# Check GPIO permissions
sudo usermod -a -G gpio $USER

# Verify wiring connections
# CS: GPIO 27, Clock: GPIO 22, Data: GPIO 17

# Test sensor manually
python3 max31855/max31855_reader.py
```

**Network Issues**:
```bash
# Check container network
docker network ls
docker network inspect zemfyre-sensor_zemfyre-net

# Verify port mappings
docker-compose port grafana 3000
```

**High Memory Usage**:
```bash
# Monitor resource usage
docker stats

# Optimize memory limits in docker-compose.yml
# Restart with memory constraints
```

### Log Files

- **System logs**: `/var/log/syslog`
- **Docker logs**: `docker-compose logs`
- **Application logs**: `logs/` directory in each service
- **Sensor logs**: Check MAX31855 container output

### Performance Optimization

**For Raspberry Pi 3 and older**:
- Reduce Grafana refresh rates
- Limit InfluxDB retention policies
- Optimize Node-RED flows
- Use memory limits in docker-compose.yml

**For Resource-Constrained Systems**:
```yaml
# Add to docker-compose.yml services
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

## 🔄 Maintenance

### Regular Updates

```bash
# Update containers
cd /home/$USER/iotistic
./bin/upgrade_containers.sh

# System updates
sudo apt update && sudo apt upgrade
```

### Backup Data

```bash
# Backup InfluxDB data
docker exec influxdb influx backup /backup

# Backup Grafana dashboards
docker exec grafana grafana-cli admin export-dashboard

# Backup Node-RED flows
cp nodered/data/flows.json flows_backup_$(date +%Y%m%d).json
```

### Monitoring Health

```bash
# Check all services
docker-compose ps

# Monitor resource usage
docker stats

# Check disk space
df -h
```

## 🤝 Contributing

We welcome contributions! Please:

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

### Development Guidelines

- Follow Python PEP 8 style guide
- Add unit tests for new features
- Update documentation
- Ensure Docker builds work on all platforms

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/dsamborschi/zemfyre-sensor/issues)
- **Documentation**: [Wiki](https://github.com/dsamborschi/zemfyre-sensor/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/dsamborschi/zemfyre-sensor/discussions)

## 🏷️ Version

Current version: **Latest** (rolling release from master branch)

For stable releases, check: [Releases](https://github.com/dsamborschi/zemfyre-sensor/releases)

---

**Made with ❤️ for the IoT community**
