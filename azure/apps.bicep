// Zemfyre sensor backend — the 4 Container Apps
// Run azure/infra.bicep first. All images are pulled from public Docker Hub
// repos, so no registry auth is needed here.

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name used as a prefix for all resources (must match infra.bicep)')
param namePrefix string = 'zemfyre'

@description('Container Apps Environment resource ID, from infra.bicep output environmentId')
param environmentId string

@description('Full mosquitto image reference')
param mosquittoImage string = 'docker.io/library/eclipse-mosquitto:latest'

@description('Full node-red image reference — built by .github/workflows/build-zemfyre-nodered.yml')
param nodeRedImage string = 'docker.io/iotistic/zemfyre-nodered:latest-x86'

@description('Full grafana image reference — built by .github/workflows/build-zemfyre-grafana.yml')
param grafanaImage string = 'docker.io/iotistic/zemfyre-grafana:latest-x86'

@description('Unique per-deploy value so Container Apps always creates a new revision, even when an image tag is reused (e.g. "latest-x86")')
param revisionSuffix string = uniqueString(utcNow())

@description('InfluxDB admin username')
param influxUsername string = 'admin'

@secure()
param influxPassword string

@secure()
@description('InfluxDB admin API token — shared with Node-RED and Grafana')
param influxToken string

@description('Grafana admin username')
param grafanaUsername string = 'admin'

@secure()
param grafanaPassword string

@description('Enable anonymous (public, read-only) access to Grafana dashboards')
param grafanaAnonymousEnabled string = 'false'

@description('Org role granted to anonymous Grafana users when enabled')
param grafanaAnonymousOrgRole string = 'Viewer'

// ---------------------------------------------------------------------------
// mosquitto — MQTT broker (TCP ingress, always on)
// ---------------------------------------------------------------------------
resource mosquitto 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-mosquitto'
  location: location
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        transport: 'tcp'
        exposedPort: 1883
        targetPort: 1883
        additionalPortMappings: [
          {
            external: true
            targetPort: 9001
            exposedPort: 9001
          }
        ]
      }
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'mosquitto'
          image: mosquittoImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              volumeName: 'mosquitto'
              mountPath: '/mosquitto'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'mosquitto'
          storageType: 'AzureFile'
          storageName: 'mosquitto'
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ---------------------------------------------------------------------------
// influxdb — time-series database (internal only, always on)
// ---------------------------------------------------------------------------
resource influx 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-influx'
  location: location
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: false
        transport: 'http'
        targetPort: 8086
      }
      secrets: [
        { name: 'influx-password', value: influxPassword }
        { name: 'influx-token', value: influxToken }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'influx'
          image: 'docker.io/library/influxdb:alpine'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DOCKER_INFLUXDB_INIT_MODE', value: 'setup' }
            { name: 'DOCKER_INFLUXDB_INIT_USERNAME', value: influxUsername }
            { name: 'DOCKER_INFLUXDB_INIT_PASSWORD', secretRef: 'influx-password' }
            { name: 'DOCKER_INFLUXDB_INIT_ORG', value: 'Zemfyre' }
            { name: 'DOCKER_INFLUXDB_INIT_BUCKET', value: 'ZUS80LP' }
            { name: 'DOCKER_INFLUXDB_INIT_ADMIN_TOKEN', secretRef: 'influx-token' }
            { name: 'INFLUXDB_LOG_LEVEL', value: 'debug' }
          ]
          volumeMounts: [
            {
              volumeName: 'influx-data'
              mountPath: '/var/lib/influxdb2'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'influx-data'
          storageType: 'AzureFile'
          storageName: 'influx-data'
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ---------------------------------------------------------------------------
// node-red — flow processor (HTTP ingress, always on: holds a live MQTT
// subscription so it cannot scale to zero)
// ---------------------------------------------------------------------------
resource nodered 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-nodered'
  location: location
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        transport: 'http'
        targetPort: 1880
      }
      secrets: [
        { name: 'influx-token', value: influxToken }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'nodered'
          image: nodeRedImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'INFLUXDB_TOKEN', secretRef: 'influx-token' }
          ]
          volumeMounts: [
            {
              volumeName: 'nodered-data'
              mountPath: '/data'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'nodered-data'
          storageType: 'AzureFile'
          storageName: 'nodered-data'
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    mosquitto
    influx
  ]
}

// ---------------------------------------------------------------------------
// grafana — dashboards (HTTP ingress, scale to zero)
// ---------------------------------------------------------------------------
resource grafana 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-grafana'
  location: location
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        transport: 'http'
        targetPort: 3000
      }
      secrets: [
        { name: 'grafana-password', value: grafanaPassword }
        { name: 'influx-token', value: influxToken }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'grafana'
          image: grafanaImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'GF_SECURITY_ADMIN_USER', value: grafanaUsername }
            { name: 'GF_SECURITY_ADMIN_PASSWORD', secretRef: 'grafana-password' }
            { name: 'GF_AUTH_ANONYMOUS_ENABLED', value: grafanaAnonymousEnabled }
            { name: 'GF_AUTH_ANONYMOUS_ORG_ROLE', value: grafanaAnonymousOrgRole }
            { name: 'GF_AUTH_DISABLE_LOGIN_FORM', value: 'false' }
            { name: 'GF_HTTP_ALLOW_ORIGIN', value: '*' }
            { name: 'GF_DASHBOARDS_MIN_REFRESH_INTERVAL', value: '1s' }
            { name: 'INFLUXDB_TOKEN', secretRef: 'influx-token' }
          ]
          volumeMounts: [
            {
              volumeName: 'grafana-data'
              mountPath: '/var/lib/grafana'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'grafana-data'
          storageType: 'AzureFile'
          storageName: 'grafana-data'
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    influx
  ]
}

output mosquittoFqdn string = mosquitto.properties.configuration.ingress.fqdn
output noderedFqdn string = nodered.properties.configuration.ingress.fqdn
output grafanaFqdn string = grafana.properties.configuration.ingress.fqdn
