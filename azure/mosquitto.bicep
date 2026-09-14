// mosquitto — MQTT broker, deployed as an Azure Container Instance.
// Container Apps' external TCP ingress requires a custom VNet + Standard
// Load Balancer (~$18-20/mo extra); ACI gets a public IP directly on the
// container group with no VNet needed, avoiding that cost.
// Run azure/infra.bicep first — this reuses the storage account it creates.

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Short name used as a prefix for all resources (must match infra.bicep)')
param namePrefix string = 'zemfyre'

@description('Storage account name, from infra.bicep output storageAccountName')
param storageAccountName string

@description('DNS label for the broker\'s public hostname: <dnsLabel>.<region>.azurecontainer.io')
param dnsLabel string = '${namePrefix}-mqtt-${uniqueString(resourceGroup().id)}'

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource mosquitto 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: '${namePrefix}-mosquitto'
  location: location
  properties: {
    osType: 'Linux'
    restartPolicy: 'Always'
    ipAddress: {
      type: 'Public'
      dnsNameLabel: dnsLabel
      ports: [
        { protocol: 'TCP', port: 1883 }
        { protocol: 'TCP', port: 9001 }
      ]
    }
    containers: [
      {
        name: 'mosquitto'
        properties: {
          image: 'docker.io/library/eclipse-mosquitto:latest'
          ports: [
            { protocol: 'TCP', port: 1883 }
            { protocol: 'TCP', port: 9001 }
          ]
          resources: {
            requests: {
              cpu: 1
              memoryInGB: 1
            }
          }
          volumeMounts: [
            {
              name: 'mosquitto'
              mountPath: '/mosquitto'
            }
          ]
        }
      }
    ]
    volumes: [
      {
        name: 'mosquitto'
        azureFile: {
          shareName: 'mosquitto'
          storageAccountName: storage.name
          storageAccountKey: storage.listKeys().keys[0].value
        }
      }
    ]
  }
}

output fqdn string = mosquitto.properties.ipAddress.fqdn
output ip string = mosquitto.properties.ipAddress.ip
