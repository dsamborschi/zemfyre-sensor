# Docker Hub Polling Schedule - Quick Reference

## ⏰ Current Schedule

**Default**: **Every 60 minutes** (1 hour)

## 📊 What Happens Each Check

1. **Query**: Find all images with `watch_for_updates = true`
2. **Poll**: Fetch 100 most recent tags from Docker Hub for each image
3. **Compare**: Check which tags are new (not in database)
4. **Create**: Generate approval request for **most recent new tag only**

## 🎛️ Configuration Options

### Option 1: Environment Variable (Recommended)

```bash
# 30 minutes (more frequent)
IMAGE_MONITOR_INTERVAL_MINUTES=30 npm start

# 2 hours
IMAGE_MONITOR_INTERVAL_MINUTES=120 npm start

# 6 hours (less frequent, saves API calls)
IMAGE_MONITOR_INTERVAL_MINUTES=360 npm start

# Once per day
IMAGE_MONITOR_INTERVAL_MINUTES=1440 npm start
```

### Option 2: Docker Compose

```yaml
# docker-compose.yml
services:
  api:
    environment:
      - IMAGE_MONITOR_INTERVAL_MINUTES=120  # Check every 2 hours
```

### Option 3: Code Change

Edit `api/src/services/image-monitor.ts` line 248:

```typescript
// Change the default value
export const imageMonitor = new ImageMonitorService(120); // 2 hours
```

## 📈 Recommended Intervals

| Use Case | Interval | Reasoning |
|----------|----------|-----------|
| **Development/Testing** | 5-15 min | Fast feedback, see changes quickly |
| **Production (Active Images)** | 60 min | Default, good balance |
| **Production (Stable Images)** | 360 min (6 hrs) | Less frequent, saves API calls |
| **Archived/Legacy Images** | 1440 min (24 hrs) | Minimal overhead |

## 🚦 Rate Limiting Considerations

**Docker Hub API Limits** (Anonymous):
- 100 requests per 6 hours
- ~16 requests per hour

**Your Current Setup**:
- 10 monitored images
- 10 API calls per check cycle
- At 60-minute intervals = ~10 calls/hour ✅ Safe

**If you increase frequency**:
- 30-minute intervals = ~20 calls/hour ⚠️ Near limit
- 15-minute intervals = ~40 calls/hour ❌ Will hit limit

**Recommendation**: Keep at 60 minutes or higher unless you authenticate with Docker Hub.

## 📝 Currently Monitored Images

Based on recent logs, these 10 images are being checked:

1. `redis` - Official Redis
2. `postgres` - Official PostgreSQL
3. `nginx` - Official Nginx
4. `node` - Official Node.js
5. `python` - Official Python
6. `mysql` - Official MySQL
7. `mongo` - Official MongoDB
8. `influxdb` - Official InfluxDB
9. `grafana/grafana` - Grafana Labs
10. `portainer/portainer-ce` - Portainer Community Edition

## 🔍 Checking Current Status

```bash
# Get monitor status via API
curl http://localhost:4002/api/v1/images/monitor/status

# Response:
{
  "running": true,
  "checkIntervalMinutes": 60,
  "nextCheckIn": 3600000  // milliseconds until next check
}
```

## 🎯 Timeline Example

```
00:00 - API starts
00:00 - Image Monitor starts → First check (immediate)
        ↓ Finds 10 new tags (one per image)
01:00 - Second check (60 minutes later)
        ↓ Finds 0 new tags
02:00 - Third check
        ↓ Finds 1 new tag (nginx:1.25.4-alpine released)
03:00 - Fourth check
        ↓ Finds 0 new tags
...
```

## 💡 Pro Tips

1. **Start with default (60 min)** - Good balance between freshness and API limits
2. **Increase for stable images** - If images rarely update, check less often
3. **Decrease for critical images** - If you need latest security patches ASAP
4. **Monitor per-image** - Disable monitoring for images you don't need: 
   ```sql
   UPDATE images SET watch_for_updates = false WHERE image_name = 'nginx';
   ```
5. **Manual trigger available** - Don't need to wait for scheduled check:
   ```bash
   # Check specific image now
   POST /api/v1/images/:id/check
   
   # Check all images now
   POST /api/v1/images/monitor/trigger
   ```

## 🔧 Troubleshooting

**Q: How do I know if it's working?**
```bash
# Check API logs for:
[ImageMonitor] Starting monitor (check interval: 60 minutes)
[ImageMonitor] Checking for new image tags...
[ImageMonitor] Monitoring 10 images
[ImageMonitor] Check complete
```

**Q: Not finding new tags?**
- Check if tags exist in `image_tags` table (already approved)
- Verify `watch_for_updates = true` in `images` table
- Check Docker Hub has newer tags available

**Q: Want to force immediate check?**
```bash
curl -X POST http://localhost:4002/api/v1/images/monitor/trigger
```

## 📚 Related Documentation

- [IMAGE-MONITORING-SERVICE.md](IMAGE-MONITORING-SERVICE.md) - Complete service documentation
- [TAG-APPROVAL-WORKFLOW.md](TAG-APPROVAL-WORKFLOW.md) - Full approval workflow
- [API Routes](../api/src/routes/image-registry.ts) - Monitoring endpoints
