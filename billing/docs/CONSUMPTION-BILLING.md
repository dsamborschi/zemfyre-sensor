# Consumption-Based Billing Architecture

## Overview

This document outlines how to implement **consumption-based billing** for Zemfyre IoT Platform, specifically tracking network traffic and data usage from customer deployments.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Customer Instance (Per Deployment)                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Traffic Monitor                                           │ │
│  │  - MQTT messages (count, bytes)                            │ │
│  │  - HTTP API calls (count, bytes)                           │ │
│  │  - InfluxDB writes (count, bytes)                          │ │
│  │  - External API calls (count, bytes)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Usage Aggregator (Hourly/Daily)                           │ │
│  │  - Collects metrics from all services                      │ │
│  │  - Aggregates by metric type                               │ │
│  │  - Batches for efficient reporting                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Usage Reporter Job (api/src/jobs/usage-reporter.ts)       │ │
│  │  - Reports to Global Billing API                           │ │
│  │  - Sends: devices, traffic, storage, API calls             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  Global Billing API                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Usage Metrics Collection                                  │ │
│  │  POST /api/usage/report                                    │ │
│  │  - Stores hourly/daily metrics                             │ │
│  │  - Calculates consumption costs                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Stripe Metered Billing                                    │ │
│  │  - Reports usage to Stripe                                 │ │
│  │  - Stripe handles invoicing                                │ │
│  │  - Automatic billing on subscription renewal               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Metrics to Track

### 1. **Device Metrics** (Already Implemented ✅)
- Active devices count
- Total devices count
- Device hours (device-count × hours active)

### 2. **Network Traffic** (NEW)
- **MQTT Messages**
  - Message count (publish/subscribe)
  - Payload size (bytes)
  - QoS level
- **HTTP API Calls**
  - Request count
  - Request/response size (bytes)
  - Endpoint categories (device API, admin API, public API)
- **WebSocket Connections**
  - Connection duration (hours)
  - Messages sent/received
  - Data transferred (bytes)

### 3. **Data Storage** (NEW)
- **InfluxDB Writes**
  - Data points written
  - Storage used (MB)
  - Query count and complexity
- **PostgreSQL Storage**
  - Database size (MB)
  - Row count
- **Object Storage** (if applicable)
  - Files stored
  - Storage size (GB)

### 4. **Compute Resources** (OPTIONAL)
- CPU hours
- Memory usage (GB-hours)
- Container uptime

---

## Implementation Plan

### Phase 1: Customer Instance - Traffic Monitoring

#### A. MQTT Traffic Monitor

Create a new service in customer instance to monitor MQTT broker:

**File: `api/src/services/traffic-monitor.ts`**

```typescript
import mqtt from 'mqtt';
import { EventEmitter } from 'events';

interface MQTTMetrics {
  messages_published: number;
  messages_received: number;
  bytes_sent: number;
  bytes_received: number;
  connections: number;
}

export class TrafficMonitor extends EventEmitter {
  private metrics: MQTTMetrics = {
    messages_published: 0,
    messages_received: 0,
    bytes_sent: 0,
    bytes_received: 0,
    connections: 0
  };

  // Monitor MQTT traffic via $SYS topics
  async startMQTTMonitoring() {
    const client = mqtt.connect('mqtt://mosquitto:1883');
    
    client.on('connect', () => {
      // Subscribe to Mosquitto system topics
      client.subscribe('$SYS/broker/messages/+');
      client.subscribe('$SYS/broker/bytes/+');
      client.subscribe('$SYS/broker/clients/connected');
    });

    client.on('message', (topic, payload) => {
      const value = parseInt(payload.toString(), 10);
      
      if (topic === '$SYS/broker/messages/sent') {
        this.metrics.messages_published += value;
      } else if (topic === '$SYS/broker/messages/received') {
        this.metrics.messages_received += value;
      } else if (topic === '$SYS/broker/bytes/sent') {
        this.metrics.bytes_sent += value;
      } else if (topic === '$SYS/broker/bytes/received') {
        this.metrics.bytes_received += value;
      } else if (topic === '$SYS/broker/clients/connected') {
        this.metrics.connections = value;
      }
    });
  }

  getMetrics(): MQTTMetrics {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      messages_published: 0,
      messages_received: 0,
      bytes_sent: 0,
      bytes_received: 0,
      connections: 0
    };
  }
}
```

#### B. HTTP API Traffic Monitor

**File: `api/src/middleware/traffic-tracking.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';

interface HTTPMetrics {
  request_count: number;
  bytes_sent: number;
  bytes_received: number;
  requests_by_endpoint: Record<string, number>;
}

class HTTPTrafficTracker {
  private metrics: HTTPMetrics = {
    request_count: 0,
    bytes_sent: 0,
    bytes_received: 0,
    requests_by_endpoint: {}
  };

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Track request size
      const requestSize = parseInt(req.headers['content-length'] || '0', 10);
      this.metrics.bytes_received += requestSize;
      
      // Intercept response
      const originalSend = res.send;
      res.send = function(data: any) {
        const responseSize = Buffer.byteLength(data);
        
        // Track response size
        HTTPTrafficTracker.getInstance().metrics.bytes_sent += responseSize;
        HTTPTrafficTracker.getInstance().metrics.request_count += 1;
        
        // Track by endpoint
        const endpoint = `${req.method} ${req.route?.path || req.path}`;
        HTTPTrafficTracker.getInstance().metrics.requests_by_endpoint[endpoint] = 
          (HTTPTrafficTracker.getInstance().metrics.requests_by_endpoint[endpoint] || 0) + 1;
        
        return originalSend.call(this, data);
      };
      
      next();
    };
  }

  getMetrics(): HTTPMetrics {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      request_count: 0,
      bytes_sent: 0,
      bytes_received: 0,
      requests_by_endpoint: {}
    };
  }

  private static instance: HTTPTrafficTracker;
  static getInstance() {
    if (!this.instance) {
      this.instance = new HTTPTrafficTracker();
    }
    return this.instance;
  }
}

export default HTTPTrafficTracker;
```

#### C. Storage Monitor

**File: `api/src/services/storage-monitor.ts`**

```typescript
import { Pool } from 'pg';
import axios from 'axios';

interface StorageMetrics {
  postgres_size_mb: number;
  postgres_row_count: number;
  influxdb_size_mb: number;
  influxdb_points: number;
}

export class StorageMonitor {
  async getMetrics(): Promise<StorageMetrics> {
    const [postgresMetrics, influxMetrics] = await Promise.all([
      this.getPostgresMetrics(),
      this.getInfluxDBMetrics()
    ]);

    return {
      ...postgresMetrics,
      ...influxMetrics
    };
  }

  private async getPostgresMetrics() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    try {
      // Get database size
      const sizeResult = await pool.query(`
        SELECT pg_database_size(current_database()) as size_bytes
      `);
      const sizeBytes = parseInt(sizeResult.rows[0].size_bytes, 10);
      const sizeMB = sizeBytes / (1024 * 1024);

      // Get row count (approximate)
      const rowResult = await pool.query(`
        SELECT SUM(n_live_tup) as total_rows
        FROM pg_stat_user_tables
      `);
      const rowCount = parseInt(rowResult.rows[0].total_rows || '0', 10);

      return {
        postgres_size_mb: Math.round(sizeMB * 100) / 100,
        postgres_row_count: rowCount
      };
    } finally {
      await pool.end();
    }
  }

  private async getInfluxDBMetrics() {
    try {
      // Query InfluxDB for database size and cardinality
      const response = await axios.get(
        'http://influxdb:8086/debug/vars'
      );

      const data = response.data;
      const sizeMB = (data.memstats?.HeapAlloc || 0) / (1024 * 1024);
      const points = data.database?.numSeries || 0;

      return {
        influxdb_size_mb: Math.round(sizeMB * 100) / 100,
        influxdb_points: points
      };
    } catch (error) {
      console.error('Failed to get InfluxDB metrics:', error);
      return {
        influxdb_size_mb: 0,
        influxdb_points: 0
      };
    }
  }
}
```

---

### Phase 2: Update Usage Reporter

**Update: `api/src/jobs/usage-reporter.ts`**

```typescript
import { DeviceModel } from '../db/models';
import { LicenseValidator } from '../services/license-validator';
import { BillingClient } from '../services/billing-client';
import { TrafficMonitor } from '../services/traffic-monitor';
import HTTPTrafficTracker from '../middleware/traffic-tracking';
import { StorageMonitor } from '../services/storage-monitor';

export async function usageReporterJob() {
  console.log('📊 Reporting usage to Global Billing API...');
  
  try {
    const license = LicenseValidator.getInstance();
    const licenseData = license.getLicense();
    
    if (licenseData.customerId === 'unlicensed') {
      console.log('⏭️  Skipping usage report (unlicensed mode)');
      return;
    }
    
    // Count devices
    const devices = await DeviceModel.list({ isActive: true });
    const deviceCount = devices.length;
    const totalDevices = (await DeviceModel.list()).length;
    
    // Get traffic metrics
    const trafficMonitor = TrafficMonitor.getInstance();
    const mqttMetrics = trafficMonitor.getMetrics();
    
    const httpTracker = HTTPTrafficTracker.getInstance();
    const httpMetrics = httpTracker.getMetrics();
    
    // Get storage metrics
    const storageMonitor = new StorageMonitor();
    const storageMetrics = await storageMonitor.getMetrics();
    
    // Send comprehensive usage report
    const billingClient = BillingClient.getInstance();
    if (billingClient.isConfigured()) {
      try {
        await billingClient.reportUsage({
          // Device metrics
          active_devices: deviceCount,
          total_devices: totalDevices,
          
          // MQTT traffic
          mqtt_messages_published: mqttMetrics.messages_published,
          mqtt_messages_received: mqttMetrics.messages_received,
          mqtt_bytes_sent: mqttMetrics.bytes_sent,
          mqtt_bytes_received: mqttMetrics.bytes_received,
          mqtt_connections: mqttMetrics.connections,
          
          // HTTP traffic
          http_requests: httpMetrics.request_count,
          http_bytes_sent: httpMetrics.bytes_sent,
          http_bytes_received: httpMetrics.bytes_received,
          
          // Storage
          postgres_size_mb: storageMetrics.postgres_size_mb,
          influxdb_size_mb: storageMetrics.influxdb_size_mb,
          influxdb_points: storageMetrics.influxdb_points
        });
        
        // Reset metrics after successful report
        trafficMonitor.resetMetrics();
        httpTracker.resetMetrics();
        
      } catch (error: any) {
        console.error('❌ Failed to report usage to billing API:', error.message);
      }
    } else {
      console.warn('⚠️  BILLING_API_URL not set, skipping usage report');
    }
    
    console.log(`📊 Usage reported successfully`);
    
  } catch (error) {
    console.error('❌ Usage reporter job failed:', error);
  }
}
```

---

### Phase 3: Billing API - Extended Usage Storage

**Update: `billing/migrations/002_add_traffic_metrics.sql`**

```sql
-- Add traffic and storage columns to usage_reports
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS mqtt_messages_published BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS mqtt_messages_received BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS mqtt_bytes_sent BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS mqtt_bytes_received BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS mqtt_connections INTEGER DEFAULT 0;

ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS http_requests BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS http_bytes_sent BIGINT DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS http_bytes_received BIGINT DEFAULT 0;

ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS postgres_size_mb DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS influxdb_size_mb DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE usage_reports ADD COLUMN IF NOT EXISTS influxdb_points BIGINT DEFAULT 0;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_usage_reports_customer_date ON usage_reports(customer_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_reports_mqtt_traffic ON usage_reports(mqtt_bytes_sent, mqtt_bytes_received);
CREATE INDEX IF NOT EXISTS idx_usage_reports_http_traffic ON usage_reports(http_bytes_sent, http_bytes_received);
```

---

### Phase 4: Stripe Metered Billing Integration

**File: `billing/src/services/metered-billing.ts`**

```typescript
import Stripe from 'stripe';
import { UsageModel } from '../db/models/usage.model';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

interface UsageMetrics {
  devices: number;
  mqtt_gb: number;
  http_gb: number;
  storage_gb: number;
  api_calls: number;
}

export class MeteredBillingService {
  /**
   * Report usage to Stripe for metered billing
   * Called daily or hourly
   */
  async reportToStripe(customerId: string, subscriptionId: string) {
    // Get latest usage report
    const usage = await UsageModel.getLatestByCustomer(customerId);
    if (!usage) return;

    // Calculate billable metrics
    const metrics = this.calculateBillableMetrics(usage);

    // Get Stripe subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Report each metered item
    for (const item of subscription.items.data) {
      const priceId = item.price.id;

      // Map price ID to metric
      let quantity = 0;
      if (priceId === process.env.STRIPE_PRICE_MQTT_TRAFFIC) {
        quantity = Math.ceil(metrics.mqtt_gb);
      } else if (priceId === process.env.STRIPE_PRICE_HTTP_TRAFFIC) {
        quantity = Math.ceil(metrics.http_gb);
      } else if (priceId === process.env.STRIPE_PRICE_STORAGE) {
        quantity = Math.ceil(metrics.storage_gb);
      } else if (priceId === process.env.STRIPE_PRICE_API_CALLS) {
        quantity = Math.ceil(metrics.api_calls / 1000); // Per 1000 calls
      }

      if (quantity > 0) {
        await stripe.subscriptionItems.createUsageRecord(
          item.id,
          {
            quantity,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'set' // Use 'increment' for additive usage
          }
        );
      }
    }

    console.log(`✅ Reported usage to Stripe for customer ${customerId}`);
  }

  private calculateBillableMetrics(usage: any): UsageMetrics {
    const mqttBytesTotal = (usage.mqtt_bytes_sent || 0) + (usage.mqtt_bytes_received || 0);
    const httpBytesTotal = (usage.http_bytes_sent || 0) + (usage.http_bytes_received || 0);
    const storageMB = (usage.postgres_size_mb || 0) + (usage.influxdb_size_mb || 0);

    return {
      devices: usage.active_devices || 0,
      mqtt_gb: mqttBytesTotal / (1024 * 1024 * 1024),
      http_gb: httpBytesTotal / (1024 * 1024 * 1024),
      storage_gb: storageMB / 1024,
      api_calls: usage.http_requests || 0
    };
  }

  /**
   * Get current billing period usage
   */
  async getBillingPeriodUsage(customerId: string) {
    const usage = await UsageModel.getByCustomerDateRange(
      customerId,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      new Date()
    );

    // Aggregate metrics
    const totals = usage.reduce((acc, record) => {
      acc.mqtt_bytes += (record.mqtt_bytes_sent || 0) + (record.mqtt_bytes_received || 0);
      acc.http_bytes += (record.http_bytes_sent || 0) + (record.http_bytes_received || 0);
      acc.storage_mb = Math.max(acc.storage_mb, (record.postgres_size_mb || 0) + (record.influxdb_size_mb || 0));
      acc.api_calls += record.http_requests || 0;
      return acc;
    }, {
      mqtt_bytes: 0,
      http_bytes: 0,
      storage_mb: 0,
      api_calls: 0
    });

    return this.calculateBillableMetrics(totals as any);
  }
}
```

---

## Pricing Model

### Tiered Consumption Pricing

**Base Subscription** (Fixed Monthly Fee):
- **Starter**: $29/mo → 10 devices, 10 GB traffic, 5 GB storage
- **Professional**: $99/mo → 50 devices, 100 GB traffic, 50 GB storage
- **Enterprise**: Custom → Unlimited

**Overage Pricing** (Pay-as-you-go):
- **MQTT Traffic**: $0.10 per GB over limit
- **HTTP Traffic**: $0.15 per GB over limit
- **Storage**: $0.20 per GB per month over limit
- **API Calls**: $0.50 per 1,000 calls over limit
- **Additional Devices**: $2 per device per month over limit

### Stripe Configuration

Create metered prices in Stripe:

```bash
# MQTT Traffic (per GB)
stripe prices create \
  --product prod_XXX \
  --currency usd \
  --unit-amount 10 \
  --billing-scheme tiered \
  --recurring[interval]=month \
  --recurring[usage_type]=metered

# HTTP Traffic (per GB)
stripe prices create \
  --product prod_YYY \
  --currency usd \
  --unit-amount 15 \
  --billing-scheme tiered \
  --recurring[interval]=month \
  --recurring[usage_type]=metered
```

---

## Customer Dashboard

Add usage visualization to customer admin panel:

```typescript
// admin/src/pages/Billing/UsageDetails.tsx

export function UsageDetails() {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch('/api/billing/usage/current-period')
      .then(res => res.json())
      .then(setUsage);
  }, []);

  return (
    <div className="usage-dashboard">
      <h2>Current Billing Period Usage</h2>
      
      <div className="usage-cards">
        <UsageCard
          title="Devices"
          current={usage?.active_devices}
          limit={usage?.plan_limits.max_devices}
          unit="devices"
          overagePrice="$2/device"
        />
        
        <UsageCard
          title="MQTT Traffic"
          current={usage?.mqtt_gb}
          limit={usage?.plan_limits.mqtt_gb}
          unit="GB"
          overagePrice="$0.10/GB"
        />
        
        <UsageCard
          title="HTTP Traffic"
          current={usage?.http_gb}
          limit={usage?.plan_limits.http_gb}
          unit="GB"
          overagePrice="$0.15/GB"
        />
        
        <UsageCard
          title="Storage"
          current={usage?.storage_gb}
          limit={usage?.plan_limits.storage_gb}
          unit="GB"
          overagePrice="$0.20/GB/mo"
        />
      </div>
      
      <UsageChart data={usage?.daily_breakdown} />
      
      <EstimatedInvoice usage={usage} />
    </div>
  );
}
```

---

## Implementation Checklist

### Customer Instance
- [ ] Create `TrafficMonitor` service for MQTT
- [ ] Create `HTTPTrafficTracker` middleware
- [ ] Create `StorageMonitor` service
- [ ] Update `usage-reporter.ts` to include all metrics
- [ ] Add traffic tracking middleware to Express app
- [ ] Schedule hourly/daily usage reports

### Billing API
- [ ] Add migration `002_add_traffic_metrics.sql`
- [ ] Update `UsageModel` to handle new fields
- [ ] Create `MeteredBillingService`
- [ ] Add endpoint `GET /api/usage/current-period/:customerId`
- [ ] Schedule job to report usage to Stripe
- [ ] Add usage aggregation queries

### Stripe Configuration
- [ ] Create metered products for each consumption metric
- [ ] Set up usage recording automation
- [ ] Configure invoice settings (monthly billing)
- [ ] Add overage notifications
- [ ] Test metered billing with test mode

### Customer Admin Panel
- [ ] Add "Usage" page showing current period metrics
- [ ] Add usage chart (daily breakdown)
- [ ] Show estimated invoice preview
- [ ] Add alerts for approaching limits
- [ ] Add export usage data functionality

---

## Benefits

✅ **Predictable Base Cost** - Fixed monthly subscription
✅ **Fair Pricing** - Pay only for what you use
✅ **Automatic Billing** - Stripe handles invoicing
✅ **Real-Time Tracking** - Customers see usage live
✅ **Scalable** - Grows with customer needs
✅ **Transparent** - Clear pricing, no surprises

---

## Next Steps

1. **Implement Phase 1** - Traffic monitoring in customer instance
2. **Test locally** - Verify metrics collection accuracy
3. **Implement Phase 2** - Update usage reporter
4. **Implement Phase 3** - Extend billing API database
5. **Implement Phase 4** - Stripe metered billing integration
6. **Add dashboard** - Customer-facing usage visualization
7. **Deploy & monitor** - Roll out gradually, monitor costs

---

## Questions?

- How frequently should usage be reported? (Hourly recommended)
- Should we add alerts for customers approaching limits?
- Do we need usage export for customer auditing?
- Should storage be billed by peak or average?
