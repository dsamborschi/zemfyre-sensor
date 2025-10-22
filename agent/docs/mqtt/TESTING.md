# 🧪 Testing the MQTT Centralization

**Status**: Ready for Testing  
**Date**: October 20, 2025

---

## ✅ Pre-Flight Checklist

- [x] MqttManager created and compiled
- [x] MqttLogBackend refactored
- [x] MqttShadowAdapter refactored
- [x] Supervisor integration complete
- [x] TypeScript build passes
- [x] Documentation complete (92KB, 11 files)

**Everything is ready!** Now let's test it.

---

## 🚀 Step 1: Start the Development Environment

```bash
# Terminal 1: Start Docker services
cd c:\Users\dsamborschi\Iotistic-sensor
docker-compose -f docker-compose.dev.yml up -d

# Verify services are running
docker-compose ps
```

**Expected**: mosquitto, nodered, influxdb, grafana all running.

---

## 🔧 Step 2: Start the Agent with Debug Mode

```bash
# Terminal 2: Start agent with MQTT debug
cd agent
$env:MQTT_DEBUG="true"
npm run dev
```

**Look for these logs**:
```
🔌 Initializing MQTT Manager...
[MqttManager] Connecting to MQTT broker: mqtt://mosquitto:1883
[MqttManager] ✅ Connected to MQTT broker
✅ MQTT Manager connected: mqtt://mosquitto:1883
   Client ID: device_<uuid>
   All features will share this connection
   Debug mode: enabled
```

---

## 🔍 Step 3: Verify Single Connection

```bash
# Terminal 3: Check MQTT connections
docker exec -it mosquitto netstat -tn | grep :1883
```

**Expected**: You should see **EXACTLY ONE** connection from the agent, not 3+.

Example output:
```
tcp  0  0  172.18.0.5:1883  172.18.0.2:52341  ESTABLISHED
```

If you see 3+ connections, something went wrong.

---

## 📡 Step 4: Test Shadow Feature

```bash
# Terminal 3: Subscribe to shadow topics
docker exec -it mosquitto mosquitto_sub -t 'shadow/#' -v
```

```bash
# Terminal 4: Update shadow state via API
curl -X POST http://localhost:48484/v1/shadow/update `
  -H "Content-Type: application/json" `
  -d '{"state": {"reported": {"temperature": 25.5, "humidity": 60}}}'
```

**Expected in Terminal 3**:
```
shadow/device-state/<uuid>/update {"state":{"reported":{"temperature":25.5,"humidity":60}}}
shadow/device-state/<uuid>/update/accepted {"version":1,"timestamp":...}
```

**Expected in Agent logs**:
```
[MqttManager] 📤 Publishing to shadow/device-state/<uuid>/update (QoS: 1)
[Shadow] Update accepted (version: 1)
```

---

## 📝 Step 5: Test Logging Feature

```bash
# Terminal 3: Subscribe to log topics
docker exec -it mosquitto mosquitto_sub -t 'device/logs/#' -v
```

```bash
# Terminal 4: Trigger device API request (generates logs)
curl http://localhost:48484/v2/device
```

**Expected in Terminal 3**:
```
device/logs/info [{"level":"info","message":"Device API request","timestamp":"..."}]
```

**Expected in Agent logs**:
```
[MqttManager] 📤 Publishing to device/logs/info (QoS: 1)
[MqttLogBackend] Published batch: 1 logs
```

---

## 🔎 Step 6: Monitor MQTT Manager Debug Logs

With `MQTT_DEBUG=true`, you should see detailed logs:

```
[MqttManager] 📥 Subscribed to topic: shadow/device-state/<uuid>/update/accepted
[MqttManager] 📥 Subscribed to topic: shadow/device-state/<uuid>/update/rejected
[MqttManager] 📥 Subscribed to topic: shadow/device-state/<uuid>/delta
[MqttManager] 📤 Publishing to device/logs/info (QoS: 1)
[MqttManager] 📨 Message received on shadow/device-state/<uuid>/update/accepted
[MqttManager] ✅ Routed to 1 handler(s)
```

**This confirms**:
- All subscriptions go through MqttManager
- All publishes go through MqttManager
- Message routing works correctly

---

## 📊 Step 7: Check Memory Usage

```bash
# Get agent process memory
docker stats <agent-container-id> --no-stream
```

**Expected**: MQTT memory should be **~5MB**, not 15MB+.

---

## ✅ Success Criteria

| Test | Expected | Status |
|------|----------|--------|
| Single MQTT connection | 1 connection visible | ⏳ Test |
| MqttManager logs | Debug logs visible | ⏳ Test |
| Shadow updates | Publishes via MqttManager | ⏳ Test |
| Logging | Publishes via MqttManager | ⏳ Test |
| Memory usage | ~5MB (not 15MB) | ⏳ Test |
| Reconnection | Graceful, single reconnect | ⏳ Test |
| Error handling | No crashes if MQTT down | ⏳ Test |

---

## 🐛 Troubleshooting

### Issue: "MqttManager not initialized"
**Cause**: `MQTT_BROKER` not set  
**Fix**: 
```powershell
$env:MQTT_BROKER="mqtt://mosquitto:1883"
npm run dev
```

### Issue: Multiple connections still visible
**Cause**: Old instances running  
**Fix**:
```bash
docker-compose down
docker-compose -f docker-compose.dev.yml up -d
cd agent && npm run dev
```

### Issue: Shadow updates not publishing
**Cause**: MqttManager failed to connect  
**Fix**: Check mosquitto is running:
```bash
docker-compose ps mosquitto
docker logs mosquitto
```

### Issue: Debug logs not showing
**Cause**: `MQTT_DEBUG` not set  
**Fix**:
```powershell
$env:MQTT_DEBUG="true"
npm run dev
```

---

## 📸 Screenshot Checklist

Capture these for verification:

1. ✅ Agent startup logs showing `initializeMqttManager()`
2. ✅ `netstat` showing single connection
3. ✅ Shadow update logs with MqttManager routing
4. ✅ MQTT subscription showing published messages
5. ✅ Memory stats showing reduced usage

---

## 🎯 After Testing

Once all tests pass:

1. **Commit changes**:
   ```bash
   git add agent/src/supervisor.ts agent/docs/mqtt/
   git commit -m "feat: integrate MQTT centralization into supervisor"
   ```

2. **Update main README**:
   - Document new MQTT environment variables
   - Add MQTT_DEBUG flag

3. **Deploy to staging**:
   - Test in staging environment
   - Monitor for any issues

4. **Production deployment**:
   - Roll out gradually
   - Monitor memory and connection count

---

## 📚 Related Documentation

- **Integration Report**: [INTEGRATION-COMPLETE.md](./INTEGRATION-COMPLETE.md)
- **Quick Reference**: [QUICK-REFERENCE.md](./QUICK-REFERENCE.md)
- **Full Guide**: [README.md](./README.md)
- **Testing Checklist**: [INTEGRATION-CHECKLIST.md](./INTEGRATION-CHECKLIST.md)

---

**Ready to test?** Start with Step 1! 🚀

**Questions?** Check [INTEGRATION-COMPLETE.md](./INTEGRATION-COMPLETE.md) for detailed troubleshooting.
