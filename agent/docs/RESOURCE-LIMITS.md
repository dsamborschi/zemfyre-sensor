# K8s-Style Resource Limits for Containers

## Overview

The agent now supports **Kubernetes-style resource limits and requests** for containers, allowing you to control CPU and memory usage similar to K8s `resources` configuration.

## Features

✅ **CPU Limits** - Maximum CPU allocation per container  
✅ **Memory Limits** - Maximum memory allocation per container  
✅ **CPU Requests** - Minimum CPU guarantee (soft limit)  
✅ **Memory Requests** - Minimum memory reservation (soft limit)  
✅ **K8s-Compatible Format** - Same syntax as Kubernetes YAML  
✅ **Automatic Conversion** - Converts K8s format to Docker API format

## Configuration Format

Add `resources` to your service configuration:

```json
{
  "appId": 1001,
  "appName": "monitoring",
  "services": [
    {
      "serviceId": 1,
      "serviceName": "grafana",
      "imageName": "grafana/grafana:latest",
      "config": {
        "image": "grafana/grafana:latest",
        "ports": ["3000:3000"],
        "resources": {
          "limits": {
            "cpu": "1",
            "memory": "512Mi"
          },
          "requests": {
            "cpu": "0.5",
            "memory": "256Mi"
          }
        }
      }
    }
  ]
}
```

## CPU Format

### Supported Formats

| Format | Description | Example | Docker NanoCpus |
|--------|-------------|---------|-----------------|
| Decimal | Number of CPUs | `"1"` = 1 CPU | 1000000000 |
| Decimal | Fractional CPU | `"0.5"` = 50% of 1 CPU | 500000000 |
| Millicores | K8s millicores | `"500m"` = 500 millicores | 500000000 |
| Millicores | Full CPU | `"1000m"` = 1 CPU | 1000000000 |

### Examples

```json
{
  "resources": {
    "limits": {
      "cpu": "2"       // 2 full CPUs
    }
  }
}
```

```json
{
  "resources": {
    "limits": {
      "cpu": "0.5"     // Half a CPU (50%)
    }
  }
}
```

```json
{
  "resources": {
    "limits": {
      "cpu": "500m"    // 500 millicores = 0.5 CPU
    }
  }
}
```

### CPU Requests vs Limits

- **Limits** (`NanoCpus`): Hard cap - container cannot use more CPU than this
- **Requests** (`CpuShares`): Relative weight - when CPU is contested, containers with higher shares get more
  - 1024 shares = 1 CPU (default)
  - 512 shares = 0.5 CPU
  - 2048 shares = 2 CPUs

## Memory Format

### Supported Formats

| Format | Description | Example | Bytes |
|--------|-------------|---------|-------|
| Binary (K8s) | Kibibytes | `"256Ki"` | 262,144 |
| Binary (K8s) | Mebibytes | `"512Mi"` | 536,870,912 |
| Binary (K8s) | Gibibytes | `"2Gi"` | 2,147,483,648 |
| Decimal | Kilobytes | `"500K"` | 500,000 |
| Decimal | Megabytes | `"512M"` | 512,000,000 |
| Decimal | Gigabytes | `"1G"` | 1,000,000,000 |
| Raw | Bytes | `"536870912"` | 536,870,912 |

### Examples

```json
{
  "resources": {
    "limits": {
      "memory": "1Gi"    // 1 GiB (K8s standard)
    }
  }
}
```

```json
{
  "resources": {
    "limits": {
      "memory": "512M"   // 512 MB (decimal)
    }
  }
}
```

```json
{
  "resources": {
    "limits": {
      "memory": "256Mi"  // 256 MiB (binary)
    }
  }
}
```

### Memory Requests vs Limits

- **Limits** (`Memory`): Hard cap - container is killed (OOMKilled) if it exceeds this
- **Requests** (`MemoryReservation`): Soft limit - container can exceed but Docker reclaims memory when system is low

## Complete Example

```json
{
  "appId": 1001,
  "appName": "iot-stack",
  "services": [
    {
      "serviceId": 1,
      "serviceName": "mosquitto",
      "imageName": "eclipse-mosquitto:2",
      "config": {
        "image": "eclipse-mosquitto:2",
        "ports": ["1883:1883"],
        "resources": {
          "limits": {
            "cpu": "0.5",
            "memory": "256Mi"
          },
          "requests": {
            "cpu": "0.25",
            "memory": "128Mi"
          }
        }
      }
    },
    {
      "serviceId": 2,
      "serviceName": "nodered",
      "imageName": "nodered/node-red:latest",
      "config": {
        "image": "nodered/node-red:latest",
        "ports": ["1880:1880"],
        "resources": {
          "limits": {
            "cpu": "1",
            "memory": "512Mi"
          },
          "requests": {
            "cpu": "0.5",
            "memory": "256Mi"
          }
        }
      }
    },
    {
      "serviceId": 3,
      "serviceName": "grafana",
      "imageName": "grafana/grafana:latest",
      "config": {
        "image": "grafana/grafana:latest",
        "ports": ["3000:3000"],
        "resources": {
          "limits": {
            "cpu": "2",
            "memory": "1Gi"
          },
          "requests": {
            "cpu": "1",
            "memory": "512Mi"
          }
        }
      }
    }
  ]
}
```

## Docker Mapping

### How It Works Internally

The agent converts K8s-style resource definitions to Docker API format:

```typescript
// K8s format (what you write)
{
  "resources": {
    "limits": {
      "cpu": "0.5",
      "memory": "512Mi"
    },
    "requests": {
      "cpu": "0.25",
      "memory": "256Mi"
    }
  }
}

// Docker API format (what gets applied)
{
  "HostConfig": {
    "NanoCpus": 500000000,        // limits.cpu -> NanoCpus
    "Memory": 536870912,           // limits.memory -> Memory
    "CpuShares": 256,              // requests.cpu -> CpuShares (0.25 * 1024)
    "MemoryReservation": 268435456 // requests.memory -> MemoryReservation
  }
}
```

### Docker Resource Fields

| K8s Field | Docker Field | Type | Description |
|-----------|--------------|------|-------------|
| `limits.cpu` | `NanoCpus` | int64 | Hard CPU limit in nanocpus (1 CPU = 1e9 nanocpus) |
| `limits.memory` | `Memory` | int64 | Hard memory limit in bytes (container killed if exceeded) |
| `requests.cpu` | `CpuShares` | int | Relative CPU weight (1024 = 1 CPU, affects scheduling) |
| `requests.memory` | `MemoryReservation` | int64 | Soft memory limit (can exceed but reclaimed under pressure) |

## Behavior

### What Happens When Limits Are Exceeded?

**CPU Limit Exceeded**:
- Container is **throttled** (not killed)
- CPU usage is capped at the limit
- Performance degrades but container keeps running

**Memory Limit Exceeded**:
- Container is **killed** (OOMKilled)
- Container restarts based on restart policy
- Error tracked as `StartFailure` with message: `"OOMKilled"`

### What Happens With No Limits?

If `resources` is not specified:
- Container can use **unlimited CPU** (up to host capacity)
- Container can use **unlimited memory** (up to host capacity)
- Default Docker behavior (no restrictions)

## Logs

When resource limits are applied, you'll see logs like:

```
[1/3] startContainer (grafana)...
    Starting container: grafana
    Setting CPU limit: 1 (1000000000 nanocpus)
    Setting memory limit: 512Mi (536870912 bytes)
    Setting CPU request: 0.5 (512 shares)
    Setting memory request: 256Mi (268435456 bytes)
    Container started: a1b2c3d4e5f6
  ✅ Done
```

## Best Practices

### 1. **Start Conservative**
```json
{
  "resources": {
    "limits": {
      "cpu": "0.5",
      "memory": "512Mi"
    }
  }
}
```

### 2. **Monitor First, Limit Later**
- Deploy without limits initially
- Monitor actual usage with `docker stats`
- Set limits 20-30% above observed peaks

### 3. **Use Requests for QoS**
```json
{
  "resources": {
    "limits": {
      "cpu": "1",
      "memory": "1Gi"
    },
    "requests": {
      "cpu": "0.5",
      "memory": "512Mi"
    }
  }
}
```

### 4. **Critical Services Get More**
```json
{
  "serviceName": "mosquitto",
  "resources": {
    "limits": {
      "cpu": "2",        // Critical MQTT broker
      "memory": "1Gi"
    }
  }
}
```

### 5. **Development vs Production**

**Development** (generous limits for debugging):
```json
{
  "resources": {
    "limits": {
      "cpu": "2",
      "memory": "2Gi"
    }
  }
}
```

**Production** (tight limits for stability):
```json
{
  "resources": {
    "limits": {
      "cpu": "0.5",
      "memory": "512Mi"
    },
    "requests": {
      "cpu": "0.25",
      "memory": "256Mi"
    }
  }
}
```

## Monitoring Resource Usage

### View Current Usage

```bash
# All containers
docker stats

# Specific container
docker stats grafana_container_1

# One-time snapshot
docker stats --no-stream
```

### Inspect Container Limits

```bash
# Check applied limits
docker inspect <container-id> | jq '.HostConfig | {NanoCpus, Memory, CpuShares, MemoryReservation}'
```

### Example Output

```json
{
  "NanoCpus": 1000000000,
  "Memory": 536870912,
  "CpuShares": 512,
  "MemoryReservation": 268435456
}
```

## Troubleshooting

### Container Keeps Getting Killed (OOMKilled)

**Symptom**: Container status shows `OOMKilled` or exits with code 137

**Solution**: Increase memory limit
```json
{
  "resources": {
    "limits": {
      "memory": "1Gi"  // Increase from 512Mi
    }
  }
}
```

### Container Is Slow/Unresponsive

**Symptom**: High CPU throttling, slow response times

**Solution**: Increase CPU limit
```json
{
  "resources": {
    "limits": {
      "cpu": "1"  // Increase from 0.5
    }
  }
}
```

### Limits Not Applied

**Check**:
1. Configuration saved to database?
   ```bash
   sqlite3 /data/agent.db "SELECT state FROM stateSnapshot WHERE type='target';" | jq '.apps[].services[].config.resources'
   ```

2. Container recreated after config change?
   - Limits only apply on container creation
   - Restart agent or update target state

3. Docker version supports limits?
   ```bash
   docker version  # Need 1.13+
   ```

## Comparison: K8s vs Docker

| Feature | Kubernetes | Docker (This Agent) | Notes |
|---------|-----------|---------------------|-------|
| CPU Limits | ✅ `limits.cpu` | ✅ `NanoCpus` | Same behavior |
| Memory Limits | ✅ `limits.memory` | ✅ `Memory` | Same behavior |
| CPU Requests | ✅ `requests.cpu` | ✅ `CpuShares` | Similar (relative weight) |
| Memory Requests | ✅ `requests.memory` | ✅ `MemoryReservation` | Similar (soft limit) |
| QoS Classes | ✅ Guaranteed/Burstable/BestEffort | ❌ | Docker doesn't have QoS classes |
| Node Selector | ✅ | ❌ | N/A for single-node |
| Resource Quotas | ✅ Namespace-level | ❌ | Could implement at app-level |

## Future Enhancements

### Planned Features

1. **OOM Score Adjustment**
   ```json
   {
     "resources": {
       "oomScoreAdj": -500  // Protect from OOM killer
     }
   }
   ```

2. **CPU Pinning**
   ```json
   {
     "resources": {
       "cpusetCpus": "0,1"  // Pin to cores 0 and 1
     }
   }
   ```

3. **Disk I/O Limits**
   ```json
   {
     "resources": {
       "limits": {
         "storage": "10Gi"
       }
     }
   }
   ```

4. **Namespace-Level Quotas**
   ```json
   {
     "appId": 1001,
     "resourceQuota": {
       "cpu": "4",
       "memory": "8Gi"
     }
   }
   ```

## API Examples

### Set Resources via Cloud API

```bash
# Update target state with resource limits
curl -X POST http://api:3002/api/devices/<device-id>/target-state \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1001": {
        "appId": 1001,
        "appName": "monitoring",
        "services": [
          {
            "serviceId": 1,
            "serviceName": "grafana",
            "imageName": "grafana/grafana:latest",
            "config": {
              "image": "grafana/grafana:latest",
              "ports": ["3000:3000"],
              "resources": {
                "limits": {
                  "cpu": "1",
                  "memory": "512Mi"
                },
                "requests": {
                  "cpu": "0.5",
                  "memory": "256Mi"
                }
              }
            }
          }
        ]
      }
    }
  }'
```

### Query Current Resources

```bash
# Get current state with resource usage
curl http://api:3002/api/devices/<device-id>/current-state | \
  jq '.apps[].services[] | {name: .serviceName, resources: .config.resources}'
```

## References

- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Docker Resource Constraints](https://docs.docker.com/config/containers/resource_constraints/)
- [Docker Engine API - HostConfig](https://docs.docker.com/engine/api/v1.41/#operation/ContainerCreate)

## Summary

✅ **K8s-compatible syntax** - Use the same resource format as Kubernetes  
✅ **CPU and memory limits** - Protect your system from runaway containers  
✅ **Requests for QoS** - Guarantee minimum resources  
✅ **Automatic conversion** - K8s format → Docker API format  
✅ **Production-ready** - Same error handling as image pulls  

Set resource limits to ensure stable, predictable container behavior on your IoT devices!
