// Zemfyre sensor backend — shared infrastructure
// Deployed first. Creates storage and the Container Apps Environment that
// azure/apps.bicep targets. No registry needed — every image comes from
// public Docker Hub repos (iotistic/zemfyre-nodered, iotistic/zemfyre-grafana,
// the existing project's own CI output; and the stock influxdb/mosquitto images).

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name used as a prefix for all resources')
param namePrefix string = 'zemfyre'

var storageAccountName = toLower(replace('${namePrefix}st${uniqueString(resourceGroup().id)}', '-', ''))
var envName = '${namePrefix}-env'
var logAnalyticsName = '${namePrefix}-logs'

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource fileServices 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

// Holds both /mosquitto/config (seeded once with mosquitto.conf) and
// /mosquitto/data (broker-managed persistence db)
resource shareMosquitto 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileServices
  name: 'mosquitto'
  properties: { shareQuota: 5 }
}

resource shareInflux 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileServices
  name: 'influx-data'
  properties: { shareQuota: 20 }
}

resource shareGrafana 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileServices
  name: 'grafana-data'
  properties: { shareQuota: 5 }
}

// Holds Node-RED's whole /data dir (flows.json, settings.js, custom nodes,
// node_modules) — must be seeded once from ./nodered/data + ./nodered/nodes
// before first use, see azure/README.md
resource shareNodeRed 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileServices
  name: 'nodered-data'
  properties: { shareQuota: 5 }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource envStorageMosquitto 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'mosquitto'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: shareMosquitto.name
      accessMode: 'ReadWrite'
    }
  }
}

resource envStorageInflux 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'influx-data'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: shareInflux.name
      accessMode: 'ReadWrite'
    }
  }
}

resource envStorageGrafana 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'grafana-data'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: shareGrafana.name
      accessMode: 'ReadWrite'
    }
  }
}

resource envStorageNodeRed 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'nodered-data'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: shareNodeRed.name
      accessMode: 'ReadWrite'
    }
  }
}

output environmentId string = containerAppsEnv.id
output environmentName string = containerAppsEnv.name
output environmentDefaultDomain string = containerAppsEnv.properties.defaultDomain
output storageAccountName string = storage.name
output environmentStaticIp string = containerAppsEnv.properties.staticIp
