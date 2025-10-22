// Documentation content database
// This maps document IDs to their content

export const documentContent = {
  // ==================== GETTING STARTED ====================
  'overview': {
    title: 'Platform Overview',
    description: 'Introduction to the Enterprise IoT Platform with Digital Twin Technology',
    tags: ['Overview', 'Introduction', 'Digital Twin'],
    githubPath: 'README.md',
    sections: [
      {
        type: 'heading',
        content: 'What is this Platform?',
      },
      {
        type: 'text',
        content: 'An enterprise-grade IoT platform that combines edge computing, digital twin technology, and real-time data analytics. Built on Docker, MQTT, InfluxDB, Grafana, Node-RED, and TensorFlow.',
      },
      {
        type: 'alert',
        severity: 'info',
        content: 'Digital Twins are virtual replicas of physical assets that sync in real-time with their physical counterparts, enabling remote monitoring, simulation, and optimization.',
      },
      {
        type: 'heading',
        content: 'Key Features',
      },
      {
        type: 'list',
        items: [
          'Digital Twin Technology - Virtual replicas of physical assets with real-time synchronization',
          'Edge Computing - Docker-based stack runs on Raspberry Pi and x86_64',
          'Device Management - Secure provisioning, OTA updates, job engine',
          'Data Analytics - InfluxDB + Grafana + TensorFlow for ML-powered insights',
          'Security - API keys, MQTT TLS, encryption, audit logging',
          'Multi-Architecture - Runs on Pi1-5, ARM64, x86_64',
        ],
      },
      {
        type: 'heading',
        content: 'Architecture',
      },
      {
        type: 'text',
        content: 'The platform consists of multiple Docker services orchestrated together:',
      },
      {
        type: 'table',
        headers: ['Service', 'Purpose', 'Technology'],
        rows: [
          ['Application Manager', 'Container orchestration', 'TypeScript, Docker API'],
          ['MQTT Broker', 'Message routing', 'Mosquitto'],
          ['InfluxDB', 'Time-series data', 'InfluxDB 2.x'],
          ['Grafana', 'Visualization', 'Grafana 10.x'],
          ['Node-RED', 'Automation flows', 'Node-RED'],
          ['ML Service', 'Machine learning', 'TensorFlow, Python'],
          ['Admin Panel', 'Web UI', 'React, Material-UI'],
          ['API', 'REST API', 'Node.js, Express'],
        ],
      },
    ],
    nextSteps: [
      { label: 'Quick Start Guide →', url: '#quick-start' },
      { label: 'Installation Guide →', url: '#installation' },
    ],
  },

  'quick-start': {
    title: 'Quick Start Guide',
    description: 'Get up and running in 15 minutes',
    tags: ['Quick Start', 'Tutorial', 'Installation'],
    githubPath: 'bin/install.sh',
    sections: [
      {
        type: 'heading',
        content: 'Prerequisites',
      },
      {
        type: 'list',
        items: [
          'Raspberry Pi 3+ or x86_64 computer',
          'Fresh installation of Raspberry Pi OS (Bullseye or Bookworm) or Ubuntu',
          'Internet connection',
          'SSH access (if deploying remotely)',
        ],
      },
      {
        type: 'heading',
        content: 'One-Line Installation',
      },
      {
        type: 'text',
        content: 'Run this command on your device:',
      },
      {
        type: 'code',
        content: 'curl -sSL https://raw.githubusercontent.com/dsamborschi/Iotistic-sensor/master/bin/install.sh | bash',
      },
      {
        type: 'alert',
        severity: 'success',
        content: 'The installer will detect your architecture automatically and deploy the appropriate containers.',
      },
      {
        type: 'heading',
        content: 'What Gets Installed',
      },
      {
        type: 'list',
        items: [
          'Docker and Docker Compose',
          'All platform services (MQTT, InfluxDB, Grafana, etc.)',
          'Application Manager for container orchestration',
          'Nginx reverse proxy with optional SSL',
          'Automated service startup and health checks',
        ],
      },
      {
        type: 'heading',
        content: 'Access the Platform',
      },
      {
        type: 'text',
        content: 'After installation completes (approximately 10-15 minutes):',
      },
      {
        type: 'table',
        headers: ['Service', 'URL', 'Default Credentials'],
        rows: [
          ['Admin Panel', 'http://device-ip:51850', 'N/A'],
          ['Grafana', 'http://device-ip:3000', 'admin / admin'],
          ['Node-RED', 'http://device-ip:1880', 'N/A'],
          ['Application Manager API', 'http://device-ip:3002', 'API Key required'],
        ],
      },
    ],
    nextSteps: [
      { label: 'Add Your First Device →', url: '#first-device' },
      { label: 'Create Your First Twin →', url: '#first-twin' },
    ],
  },

  'installation': {
    title: 'Installation Guide',
    description: 'Detailed installation instructions for all deployment methods',
    tags: ['Installation', 'Deployment', 'Setup'],
    githubPath: 'bin/install.sh',
    sections: [
      {
        type: 'heading',
        content: 'Installation Methods',
      },
      {
        type: 'text',
        content: 'There are three ways to install the platform:',
      },
      {
        type: 'list',
        items: [
          'Method 1: One-line installer (recommended for single devices)',
          'Method 2: Ansible deployment (recommended for multiple devices)',
          'Method 3: Manual Docker Compose (for development)',
        ],
      },
      {
        type: 'heading',
        content: 'Method 1: One-Line Installer',
      },
      {
        type: 'code',
        content: 'curl -sSL https://raw.githubusercontent.com/dsamborschi/Iotistic-sensor/master/bin/install.sh | bash',
      },
      {
        type: 'heading',
        content: 'Method 2: Ansible Deployment',
      },
      {
        type: 'text',
        content: 'For deploying to multiple devices:',
      },
      {
        type: 'code',
        content: `# On your control machine
git clone https://github.com/dsamborschi/Iotistic-sensor.git
cd Iotistic-sensor/ansible

# Edit hosts.ini with your device IPs
nano hosts.ini

# Run deployment
./run.sh`,
      },
      {
        type: 'heading',
        content: 'Method 3: Manual Docker Compose',
      },
      {
        type: 'code',
        content: `# Clone repository
git clone https://github.com/dsamborschi/Iotistic-sensor.git
cd Iotistic-sensor

# Set device type
export DEVICE_TYPE=pi4  # or pi3, x86

# Generate docker-compose.yml
export DOCKER_TAG=latest
envsubst < docker-compose.yml.tmpl > docker-compose.yml

# Start services
docker-compose up -d`,
      },
    ],
    nextSteps: [
      { label: 'Ansible Documentation →', url: '#ansible' },
      { label: 'Docker Compose Guide →', url: '#docker-compose' },
    ],
  },

  // ==================== DIGITAL TWIN ====================
  'digital-twin-overview': {
    title: 'Digital Twin Overview',
    description: 'Understanding Digital Twins in the IoT Platform',
    tags: ['Digital Twin', 'Device Shadow', 'Virtual Replica'],
    githubPath: 'docs/digital-twin/',
    sections: [
      {
        type: 'heading',
        content: 'What are Digital Twins?',
      },
      {
        type: 'text',
        content: 'Digital Twins are virtual replicas of physical assets (devices, buildings, equipment) that mirror their real-world counterparts in real-time. They combine sensor data, metadata, and state information to create a complete digital representation.',
      },
      {
        type: 'alert',
        severity: 'info',
        content: 'In this platform, Digital Twins are implemented using Device Shadows - a JSON document that stores and synchronizes the state of physical devices.',
      },
      {
        type: 'heading',
        content: 'Device Shadow Structure',
      },
      {
        type: 'text',
        content: 'Each digital twin has a shadow with three main sections:',
      },
      {
        type: 'code',
        content: `{
  "state": {
    "reported": {
      // Current state from device
      "temperature": 22.5,
      "humidity": 45,
      "online": true
    },
    "desired": {
      // Target state from cloud
      "updateInterval": 30000,
      "enabled": true
    }
  },
  "metadata": {
    "reported": {
      "temperature": { "timestamp": 1698765432 }
    }
  },
  "version": 42,
  "timestamp": 1698765432
}`,
      },
      {
        type: 'heading',
        content: 'Use Cases',
      },
      {
        type: 'list',
        items: [
          'Building Management - Monitor HVAC, lighting, occupancy across floors',
          'Energy Optimization - Track consumption, predict usage, optimize schedules',
          'Predictive Maintenance - ML models detect anomalies before failures',
          'Remote Simulation - Test configuration changes before deploying',
          'Historical Playback - Review past states for forensics and optimization',
        ],
      },
    ],
    nextSteps: [
      { label: 'Device Shadows API →', url: '#shadow-api' },
      { label: 'Create Your First Twin →', url: '#first-twin' },
    ],
  },

  'device-shadows': {
    title: 'Device Shadows',
    description: 'AWS IoT-style device shadows for state synchronization',
    tags: ['Device Shadow', 'State Management', 'MQTT'],
    githubPath: 'docs/shadow/',
    sections: [
      {
        type: 'heading',
        content: 'Shadow System Architecture',
      },
      {
        type: 'text',
        content: 'The Device Shadow system provides bidirectional state synchronization between devices and the cloud using MQTT topics.',
      },
      {
        type: 'heading',
        content: 'MQTT Topics',
      },
      {
        type: 'table',
        headers: ['Topic', 'Direction', 'Purpose'],
        rows: [
          ['$aws/things/{deviceId}/shadow/update', 'Device → Cloud', 'Device reports state'],
          ['$aws/things/{deviceId}/shadow/update/delta', 'Cloud → Device', 'Desired state changes'],
          ['$aws/things/{deviceId}/shadow/update/accepted', 'Cloud → Device', 'Update confirmation'],
          ['$aws/things/{deviceId}/shadow/update/rejected', 'Cloud → Device', 'Update rejection'],
          ['$aws/things/{deviceId}/shadow/get', 'Device → Cloud', 'Request current shadow'],
          ['$aws/things/{deviceId}/shadow/get/accepted', 'Cloud → Device', 'Shadow response'],
        ],
      },
      {
        type: 'heading',
        content: 'Example: Device Reporting State',
      },
      {
        type: 'code',
        content: `// Device publishes to: $aws/things/device123/shadow/update
{
  "state": {
    "reported": {
      "temperature": 22.5,
      "humidity": 45,
      "timestamp": 1698765432
    }
  }
}`,
      },
      {
        type: 'heading',
        content: 'Example: Cloud Sending Desired State',
      },
      {
        type: 'code',
        content: `// Cloud publishes to: $aws/things/device123/shadow/update/delta
{
  "state": {
    "updateInterval": 30000,
    "enabled": true
  },
  "version": 43
}`,
      },
    ],
    nextSteps: [
      { label: 'Shadow API Reference →', url: '#shadow-api' },
      { label: 'MQTT Topics Guide →', url: '#shadow-mqtt' },
    ],
  },

  // ==================== DEVICE MANAGEMENT ====================
  'provisioning': {
    title: 'Device Provisioning',
    description: 'Secure device registration and API key generation',
    tags: ['Provisioning', 'API Keys', 'Security'],
    githubPath: 'docs/provisioning/',
    sections: [
      {
        type: 'heading',
        content: 'Provisioning Flow',
      },
      {
        type: 'text',
        content: 'Device provisioning creates a new device identity with unique API key for authentication.',
      },
      {
        type: 'heading',
        content: 'Step 1: Register Device',
      },
      {
        type: 'code',
        content: `POST /api/v1/provision
Content-Type: application/json

{
  "deviceName": "device-floor-3-room-301",
  "metadata": {
    "location": "Building A, Floor 3, Room 301",
    "type": "environmental-sensor"
  }
}`,
      },
      {
        type: 'heading',
        content: 'Step 2: Receive API Key',
      },
      {
        type: 'code',
        content: `{
  "deviceId": "dev_abc123",
  "deviceName": "device-floor-3-room-301",
  "apiKey": "sk_live_abc123...xyz789",
  "mqttCredentials": {
    "username": "dev_abc123",
    "password": "mqtt_secret_..."
  }
}`,
      },
      {
        type: 'alert',
        severity: 'warning',
        content: 'Store the API key securely! It cannot be retrieved again after initial provisioning.',
      },
      {
        type: 'heading',
        content: 'Step 3: Configure Device',
      },
      {
        type: 'text',
        content: 'Use the API key to authenticate all API requests and MQTT connections:',
      },
      {
        type: 'code',
        content: `# API requests
curl -H "X-API-Key: sk_live_abc123...xyz789" \\
  http://api-host:3001/api/v1/device

# MQTT connection
mosquitto_pub -h mqtt-host -p 1883 \\
  -u dev_abc123 -P mqtt_secret_... \\
  -t sensor/data -m '{"temp": 22.5}'`,
      },
    ],
    nextSteps: [
      { label: 'API Key Management →', url: '#api-keys' },
      { label: 'Device Shadow Setup →', url: '#device-shadows' },
    ],
  },

  // ==================== EDGE COMPUTING ====================
  'docker-stack': {
    title: 'Docker Stack Overview',
    description: 'Understanding the multi-service Docker architecture',
    tags: ['Docker', 'Architecture', 'Services'],
    githubPath: 'docker-compose.yml.tmpl',
    sections: [
      {
        type: 'heading',
        content: 'Service Architecture',
      },
      {
        type: 'text',
        content: 'The platform runs 8 main Docker services orchestrated via Docker Compose:',
      },
      {
        type: 'table',
        headers: ['Service', 'Port', 'Purpose'],
        rows: [
          ['application-manager', '3002', 'Container orchestration'],
          ['mosquitto', '1883, 9001', 'MQTT broker'],
          ['influxdb', '8086', 'Time-series database'],
          ['grafana', '3000', 'Visualization'],
          ['nodered', '1880', 'Automation flows'],
          ['ml-service', '-', 'Machine learning'],
          ['admin', '51850', 'Web admin panel'],
          ['api', '3001', 'REST API'],
        ],
      },
      {
        type: 'heading',
        content: 'Service Communication',
      },
      {
        type: 'text',
        content: 'Services communicate over the Iotistic-net Docker bridge network using container names:',
      },
      {
        type: 'code',
        content: `# Services reference each other by name
mqtt://mosquitto:1883
http://influxdb:8086
http://grafana:3000`,
      },
      {
        type: 'heading',
        content: 'Volumes',
      },
      {
        type: 'text',
        content: 'Persistent data is stored in Docker volumes:',
      },
      {
        type: 'list',
        items: [
          'application-manager-data - Device state, job history',
          'mosquitto-data - MQTT persistence',
          'influxdb-data - Time-series data',
          'grafana-data - Dashboards and config',
          'nodered-data - Flows and credentials',
        ],
      },
    ],
    nextSteps: [
      { label: 'MQTT Broker Setup →', url: '#mqtt-broker' },
      { label: 'InfluxDB Configuration →', url: '#influxdb' },
    ],
  },

  // Placeholder for other docs (to be expanded)
  'first-device': {
    title: 'Add Your First Device',
    description: 'Step-by-step guide to adding and configuring your first IoT device',
    tags: ['Tutorial', 'Device', 'Getting Started'],
    sections: [
      {
        type: 'alert',
        severity: 'info',
        content: 'This documentation page is being prepared. Please refer to the GitHub repository for the latest information.',
      },
    ],
  },

  'first-twin': {
    title: 'Create Your First Digital Twin',
    description: 'Tutorial: Creating a digital twin for a building or device',
    tags: ['Tutorial', 'Digital Twin', 'Getting Started'],
    sections: [
      {
        type: 'alert',
        severity: 'info',
        content: 'This documentation page is being prepared. Please refer to the GitHub repository for the latest information.',
      },
    ],
  },
};

// Export document keys for search/filtering
export const documentKeys = Object.keys(documentContent);
