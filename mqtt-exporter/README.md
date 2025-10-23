# MQTT Prometheus Exporter

Custom Node.js exporter for Mosquitto MQTT broker metrics.

## Features

- ✅ **Native MQTT Authentication**: Uses standard MQTT username/password
- ✅ **$SYS Topic Metrics**: Exports Mosquitto broker statistics
- ✅ **Sensor Topic Metrics**: Tracks sensor data from `sensor/#` topics
- ✅ **Connection Monitoring**: Tracks broker connection status
- ✅ **Message Counting**: Counts messages and bytes per topic

## Metrics Exported

### MQTT Connection Metrics
- `mqtt_broker_connected` - Connection status (1 = connected, 0 = disconnected)
- `mqtt_messages_received_total` - Total messages received (labeled by topic)
- `mqtt_bytes_received_total` - Total bytes received

### Mosquitto Broker Metrics ($SYS topics)
- `mosquitto_broker_uptime_seconds` - Broker uptime
- `mosquitto_broker_clients_connected` - Currently connected clients
- `mosquitto_broker_clients_maximum` - Maximum concurrent clients
- `mosquitto_broker_clients_total` - Total clients ever connected
- `mosquitto_broker_messages_sent` - Messages sent by broker
- `mosquitto_broker_messages_received` - Messages received by broker
- `mosquitto_broker_subscriptions` - Active subscriptions
- `mosquitto_broker_bytes_sent` - Bytes sent by broker
- `mosquitto_broker_bytes_received` - Bytes received by broker

### Sensor Data Metrics
- `mqtt_topic_value` - Numeric values from sensor topics (labeled by topic)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MQTT_BROKER` | `mqtt://localhost:1883` | MQTT broker URL |
| `MQTT_USERNAME` | _(empty)_ | MQTT username for authentication |
| `MQTT_PASSWORD` | _(empty)_ | MQTT password for authentication |
| `METRICS_PORT` | `9234` | HTTP port for Prometheus metrics |

## Local Development

```powershell
# Install dependencies
npm install

# Configure environment
$env:MQTT_BROKER = "mqtt://localhost:1883"
$env:MQTT_USERNAME = "admin"
$env:MQTT_PASSWORD = "your-password"

# Run exporter
npm start

# Test metrics endpoint
curl http://localhost:9234/metrics
```

## Docker Build

```powershell
# Build image
docker build -t iotistic/mqtt-exporter:latest .

# Run container
docker run -d \
  -p 9234:9234 \
  -e MQTT_BROKER=mqtt://mosquitto:1883 \
  -e MQTT_USERNAME=admin \
  -e MQTT_PASSWORD=password \
  --name mqtt-exporter \
  iotistic/mqtt-exporter:latest
```

## Kubernetes Deployment

**Prerequisites**: 
- Mosquitto must have `sys_interval` configured to publish $SYS metrics
- Admin credentials must be available in Kubernetes secrets

### Update Mosquitto Config

First, ensure Mosquitto publishes $SYS metrics every 10 seconds:

```yaml
# In mosquitto ConfigMap
sys_interval 10
```

### Deploy Exporter

```powershell
# Apply Kubernetes manifests
kubectl apply -f k8s/mqtt-exporter.yaml -n customer-b4c867f4

# Verify deployment
kubectl get pods -n customer-b4c867f4 -l app.kubernetes.io/component=mqtt-exporter
kubectl logs -n customer-b4c867f4 -l app.kubernetes.io/component=mqtt-exporter

# Test metrics endpoint
kubectl port-forward -n customer-b4c867f4 svc/mqtt-exporter 9234:9234
curl http://localhost:9234/metrics
```

### ServiceMonitor Integration

The exporter includes a ServiceMonitor for automatic Prometheus scraping:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mqtt-exporter
  labels:
    prometheus: dedicated
spec:
  selector:
    matchLabels:
      app.kubernetes.io/component: mqtt-exporter
  endpoints:
  - port: metrics
    interval: 30s
```

## Grafana Dashboard

After deployment, view MQTT metrics in Grafana:

1. **Port-forward Grafana**: 
   ```powershell
   kubectl port-forward -n customer-b4c867f4 svc/cb4c867f4-customer-instance-grafana 3009:80
   ```

2. **Login**: http://localhost:3009 (admin/admin)

3. **Explore Metrics**: Go to Explore → Select "Prometheus" datasource → Query:
   - `mqtt_broker_connected` - Connection status
   - `mosquitto_broker_clients_connected` - Active clients
   - `rate(mosquitto_broker_messages_received[5m])` - Message rate
   - `mqtt_topic_value{topic="sensor/temperature"}` - Temperature readings

## Troubleshooting

### No $SYS Metrics

If $SYS metrics aren't appearing:

1. **Check Mosquitto config** has `sys_interval`:
   ```powershell
   kubectl get configmap -n customer-b4c867f4 cb4c867f4-customer-instance-mosquitto-config -o yaml
   ```

2. **Restart Mosquitto** to apply config:
   ```powershell
   kubectl delete pod -n customer-b4c867f4 -l app.kubernetes.io/component=mqtt
   ```

3. **Verify $SYS topics** are published:
   ```powershell
   kubectl exec -it -n customer-b4c867f4 deployment/cb4c867f4-customer-instance-mosquitto -- \
     mosquitto_sub -h localhost -u admin -P password -t '$SYS/#' -C 5
   ```

### Authentication Failed

If exporter can't connect to Mosquitto:

1. **Check credentials** in Kubernetes secret:
   ```powershell
   kubectl get secret -n customer-b4c867f4 cb4c867f4-customer-instance-mosquitto-secret -o yaml
   ```

2. **Verify ACL** allows admin to subscribe to $SYS/#:
   ```powershell
   kubectl exec -it -n customer-b4c867f4 deployment/cb4c867f4-customer-instance-postgres -- \
     psql -U postgres -d iotistic -c "SELECT * FROM mqtt_acls WHERE username='admin';"
   ```

3. **Check exporter logs**:
   ```powershell
   kubectl logs -n customer-b4c867f4 -l app.kubernetes.io/component=mqtt-exporter
   ```

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Mosquitto     │         │  MQTT Exporter   │
│  MQTT Broker    │◄────────┤  (Node.js)       │
│                 │  MQTT   │                  │
│  Port: 1883     │ Auth    │  Port: 9234      │
└─────────────────┘         └──────────────────┘
                                     │
                                     │ HTTP
                                     │ /metrics
                                     ▼
                            ┌──────────────────┐
                            │   Prometheus     │
                            │   (Scraper)      │
                            └──────────────────┘
                                     │
                                     │ PromQL
                                     ▼
                            ┌──────────────────┐
                            │    Grafana       │
                            │  (Dashboard)     │
                            └──────────────────┘
```

## Why Custom Exporter?

After testing `sapcc/mosquitto-exporter`, we built this custom solution because:

1. **Authentication Issues**: The sapcc exporter doesn't properly send credentials in MQTT CONNECT packets
2. **Flexibility**: Full control over which topics to monitor and how to parse them
3. **Simplicity**: Direct MQTT client library usage with standard auth
4. **Debugging**: Easy to add logging and troubleshoot connection issues
5. **Customization**: Can easily add new metrics or change topic subscriptions

## License

MIT
