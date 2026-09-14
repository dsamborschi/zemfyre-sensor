// Zemfyre sensor backend — influx, node-red, grafana Container Apps
// mosquitto is deployed separately in azure/mosquitto.bicep as an Azure
// Container Instance — Container Apps' external TCP ingress requires a
// custom VNet + Standard Load Balancer (~$18-20/mo extra), which ACI avoids
// by getting a public IP directly.
// Run azure/infra.bicep first. All images are pulled from public Docker Hub
// repos, so no registry auth is needed here.

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name used as a prefix for all resources (must match infra.bicep)')
param namePrefix string = 'zemfyre'

@description('Container Apps Environment resource ID, from infra.bicep output environmentId')
param environmentId string

@description('Container Apps Environment default domain, from infra.bicep output environmentDefaultDomain — used to build grafana\'s public URL so cookies/redirects work correctly behind the platform\'s TLS-terminating proxy')
param environmentDefaultDomain string

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

@description('Custom domain for grafana (empty string to skip). Must already have a managed certificate issued — see azure/README.md for the one-time DNS + hostname bind steps; this only re-declares the existing binding so redeploys don\'t drop it')
param grafanaCustomDomain string = ''

@description('Resource ID of the existing managed certificate for grafanaCustomDomain (required if grafanaCustomDomain is set)')
param grafanaCustomDomainCertificateId string = ''

var grafanaCustomDomains = empty(grafanaCustomDomain) ? [] : [
  {
    name: grafanaCustomDomain
    certificateId: grafanaCustomDomainCertificateId
    bindingType: 'SniEnabled'
  }
]

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
          // No persistent volume: InfluxDB's SQLite-backed metadata store
          // ("database is locked" on every startup) is incompatible with
          // Azure Files (SMB). Data is lost on every restart until this is
          // revisited (see azure/README.md).
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
          // No persistent volume: /data (flows, settings, and the 554
          // npm packages the Dockerfile installs at build time) comes
          // straight from the image. Mounting Azure Files here would shadow
          // node_modules with an empty directory (that's what broke custom
          // node types like influxdb/dashboard/modbus earlier), and syncing
          // node_modules to storage on every image change isn't worth it.
          // Flows are now git-as-source-of-truth: edit nodered/data/flows.json
          // in the repo and let CI rebuild+redeploy to change them. Editor
          // edits made directly against the live instance will not survive
          // a restart.
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
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
        customDomains: grafanaCustomDomains
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
            { name: 'GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH', value: '/etc/grafana/dashboards/ZUS80LP_compact.json' }
            { name: 'GF_DASHBOARDS_MIN_REFRESH_INTERVAL', value: '1s' }
            { name: 'INFLUXDB_TOKEN', secretRef: 'influx-token' }
            // Container Apps' "internal" ingress still terminates TLS and
            // proxies through the platform's HTTPS endpoint — it does not
            // expose the container's raw listening port (8086) for direct
            // network access from other apps in the environment. Must use
            // https://<app>.internal.<domain> with no port, not http://<app>:8086.
            { name: 'INFLUXDB_URL', value: 'https://${namePrefix}-influx.internal.${environmentDefaultDomain}' }
            // The image's baked-in grafana.ini hardcodes a local-LAN domain/http
            // and cookie_samesite=none with cookie_secure=false — browsers
            // silently drop SameSite=None cookies that aren't also Secure,
            // which breaks login (redirects back to the login page forever).
            // Override root_url/domain (string only, used for links/cookies)
            // and force secure cookies. Do NOT set GF_SERVER_PROTOCOL=https —
            // Container Apps terminates TLS at the edge and forwards plain
            // HTTP internally, so Grafana's actual listener must stay http.
            { name: 'GF_SERVER_DOMAIN', value: '${namePrefix}-grafana.${environmentDefaultDomain}' }
            { name: 'GF_SERVER_ROOT_URL', value: 'https://${namePrefix}-grafana.${environmentDefaultDomain}/' }
            { name: 'GF_SECURITY_COOKIE_SECURE', value: 'true' }
          ]
          // No persistent volume: Grafana's SQLite database is incompatible
          // with Azure Files (SMB) — "database is locked" on every startup,
          // even with WAL disabled. Dashboards/datasources are already
          // provisioned from files baked into the image, so the only loss
          // on restart is anything created ad hoc through the UI (extra
          // dashboards, users, alert edits). Revisit if that matters later
          // (see azure/README.md).
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

output noderedFqdn string = nodered.properties.configuration.ingress.fqdn
output grafanaFqdn string = grafana.properties.configuration.ingress.fqdn
