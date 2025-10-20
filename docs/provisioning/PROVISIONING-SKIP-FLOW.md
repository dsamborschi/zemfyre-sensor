# Provisioning Skip Flow Diagram

## Overall Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User runs ./bin/install.sh                                   │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ provisioning_check() function                                │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Does database exist?   │
        │ ~/iotistic/agent/data/ │
        │   database.sqlite      │
        └───────┬───────────────┘
                │
        ┌───────┴───────┐
        │               │
       YES             NO
        │               │
        ▼               ▼
┌───────────────┐  ┌────────────────┐
│ Query DB for  │  │ Set PROVISIONED│
│ provisioned   │  │ = false        │
│ column value  │  │ (not provisioned)│
└───────┬───────┘  └────────┬───────┘
        │                   │
        ▼                   │
  ┌─────────────┐          │
  │ Value = 1?  │          │
  └──┬──────┬───┘          │
     │      │              │
    YES    NO              │
     │      │              │
     │      └──────────────┘
     │                     │
     ▼                     ▼
┌────────────────┐  ┌──────────────────────┐
│ Set PROVISIONED│  │ Check: IS_CI_MODE    │
│ = true         │  │ and PROVISIONING_KEY │
│                │  │ environment variable │
└────┬───────────┘  └──────────┬───────────┘
     │                         │
     │              ┌──────────┴──────────┐
     │              │                     │
     │         CI or ENV SET         Interactive
     │              │                     │
     │              ▼                     ▼
     │      ┌───────────────┐    ┌──────────────────┐
     │      │ Use env vars  │    │ PROMPT USER for: │
     │      │ or defaults   │    │ - API Key        │
     │      └───────┬───────┘    │ - Cloud Endpoint │
     │              │             └──────────┬───────┘
     │              │                        │
     └──────────────┴────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Display Summary:       │
        │ - Network settings     │
        │ - Branch/Tag           │
        │ - System upgrade       │
        │ - Provisioning status  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Continue installation  │
        │ - Ansible playbook     │
        │ - Docker containers    │
        │ - Agent startup        │
        └───────────────────────┘
```

## Detailed Decision Tree

```
install.sh: provisioning_check()
│
├─ Check: Database exists at ${IOTISTIC_REPO_DIR}/agent/data/database.sqlite?
│  │
│  ├─ NO → DEVICE_PROVISIONED = false
│  │      Go to: Check Prompt Conditions
│  │
│  └─ YES → Check: sqlite3 command available?
│     │
│     ├─ NO → DEVICE_PROVISIONED = false (fallback)
│     │       Go to: Check Prompt Conditions
│     │
│     └─ YES → Query: SELECT provisioned FROM device LIMIT 1;
│        │
│        ├─ Result = 1 → DEVICE_PROVISIONED = true
│        │               Display: "✅ Device Already Provisioned"
│        │               Show: UUID, Device Name
│        │               Skip provisioning prompts
│        │               Go to: Display Summary
│        │
│        └─ Result = 0 or error → DEVICE_PROVISIONED = false
│                                 Go to: Check Prompt Conditions
│
│
├─ Check Prompt Conditions
│  │
│  └─ IF (DEVICE_PROVISIONED = false AND IS_CI_MODE = false AND PROVISIONING_API_KEY is empty):
│     │
│     ├─ YES → Display: "🔐 Device Provisioning Setup"
│     │        Prompt: "Enter your provisioning API key:"
│     │        Read: PROVISIONING_API_KEY
│     │        │
│     │        └─ If PROVISIONING_API_KEY provided:
│     │           Prompt: "Cloud API Endpoint [http://10.0.0.60:4002]:"
│     │           Read: CLOUD_API_ENDPOINT (with default)
│     │
│     └─ NO → Skip prompts
│            (Use environment variables or skip provisioning)
│
│
└─ Display Summary
   │
   └─ Show installation configuration:
      - Manage Network: Yes/No
      - Branch/Tag: master / v1.0.0 / etc.
      - System Upgrade: Yes/No
      - Docker Tag: latest / etc.
      - Provisioning Status:
        │
        ├─ DEVICE_PROVISIONED = true → "✅ Already provisioned (skipped)"
        ├─ PROVISIONING_API_KEY set → "✅ Enabled" + Cloud Endpoint
        └─ Neither → "⚠️  Skipped (manual setup required)"
```

## Agent Supervisor Flow

```
Supervisor.initializeDeviceManager()
│
├─ Load device info from database
│  (DeviceManager.initialize())
│
├─ Check: deviceInfo.provisioned?
│  │
│  ├─ YES → Log: "✅ Device already provisioned"
│  │         Skip provisioning
│  │         Continue with initialization
│  │
│  └─ NO → Check: PROVISIONING_API_KEY env var set?
│     │
│     ├─ NO → Log: "⚠️  Device not provisioned. Set PROVISIONING_API_KEY..."
│     │        Skip provisioning
│     │        Continue with initialization (standalone mode)
│     │
│     └─ YES → Check: CLOUD_API_ENDPOINT set?
│        │
│        ├─ NO → Skip provisioning
│        │        Continue with initialization
│        │
│        └─ YES → Execute: Auto-provisioning
│                  │
│                  ├─ Detect system info (MAC, OS version)
│                  │
│                  ├─ Phase 1: Register with provisioning key
│                  │   POST /api/v1/device/register
│                  │   Authorization: Bearer ${PROVISIONING_API_KEY}
│                  │
│                  ├─ Phase 2: Exchange keys
│                  │   POST /api/v1/device/:uuid/key-exchange
│                  │   Authorization: Bearer ${deviceApiKey}
│                  │
│                  ├─ Phase 3: Remove provisioning key
│                  │   Set: provisioningApiKey = undefined
│                  │
│                  ├─ Mark: provisioned = true
│                  │
│                  ├─ Save to database
│                  │
│                  └─ Log: "✅ Device auto-provisioned successfully"
│
└─ Continue with supervisor initialization
   (container manager, API, logging, etc.)
```

## Database State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│ Database State During Provisioning                           │
└─────────────────────────────────────────────────────────────┘

STATE 1: Fresh Installation (No Database)
┌────────────────────────────────────┐
│ Database: Does not exist           │
│ Status: Not provisioned            │
│ Action: Prompt for credentials     │
└────────────────────────────────────┘
                 │
                 │ Agent first run
                 │ DeviceManager.initialize()
                 ▼
STATE 2: Database Created (Not Provisioned)
┌────────────────────────────────────┐
│ Database: EXISTS                   │
│ device table:                      │
│   uuid: "550e8400..."              │
│   provisioned: 0                   │
│   deviceApiKey: "a1b2c3d4..."      │
│   deviceId: NULL                   │
│ Status: Not provisioned            │
│ Action: Prompt for credentials     │
└────────────────────────────────────┘
                 │
                 │ Provisioning executed
                 │ (manual or auto)
                 ▼
STATE 3: Provisioned
┌────────────────────────────────────┐
│ Database: EXISTS                   │
│ device table:                      │
│   uuid: "550e8400..."              │
│   provisioned: 1                   │ ← Changed!
│   deviceApiKey: "a1b2c3d4..."      │
│   deviceId: "dev_1234567890"       │ ← Set by cloud
│   deviceName: "Living Room"        │
│   registeredAt: 1704196800000      │
│ Status: Provisioned                │
│ Action: Skip provisioning prompts  │
└────────────────────────────────────┘
```

## Summary Status Display

```
┌─────────────────────────────────────────────────────────────┐
│ User Input Summary                                           │
├─────────────────────────────────────────────────────────────┤
│ **Manage Network:**     Yes                                  │
│ **Branch/Tag:**         `master`                             │
│ **System Upgrade:**     No                                   │
│ **Docker Tag Prefix:**  `latest`                             │
│ **Provisioning:**       ✅ Already provisioned (skipped)     │
│   (Device UUID: 550e8400-e29b-41d4-a716-446655440000)       │
│   (Device Name: Living Room)                                 │
└─────────────────────────────────────────────────────────────┘

                    OR

┌─────────────────────────────────────────────────────────────┐
│ User Input Summary                                           │
├─────────────────────────────────────────────────────────────┤
│ **Manage Network:**     Yes                                  │
│ **Branch/Tag:**         `master`                             │
│ **System Upgrade:**     No                                   │
│ **Docker Tag Prefix:**  `latest`                             │
│ **Provisioning:**       ✅ Enabled                           │
│ **Cloud Endpoint:**     `http://10.0.0.60:4002`             │
└─────────────────────────────────────────────────────────────┘

                    OR

┌─────────────────────────────────────────────────────────────┐
│ User Input Summary                                           │
├─────────────────────────────────────────────────────────────┤
│ **Manage Network:**     Yes                                  │
│ **Branch/Tag:**         `master`                             │
│ **System Upgrade:**     No                                   │
│ **Docker Tag Prefix:**  `latest`                             │
│ **Provisioning:**       ⚠️  Skipped (manual setup required) │
└─────────────────────────────────────────────────────────────┘
```
