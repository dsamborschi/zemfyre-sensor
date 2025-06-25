# ZUS801 Quick Guide (v1)

> **Note:** All conditions below are for development only. When a process is well defined this level of configuration will be trimmed.

A virgin board will not have its EEPROM programmed. Therefore, after programming and upon reset, default IP bindings are used.

The status LED will toggle **yellow**, indicating the MQTT broker binding (IPv4 and port) is not available.

From the CLI, the device can be configured.

In this condition, sensors are **not initialized** and will not be available until the MQTT broker binding (good or bad) is set.

To get the help menu:
```bash
help
```
For command-specific help:
```bash
<cmd> -h      # e.g. eth -h for Ethernet help
```

To view current MQTT binding:
```bash
eth -mqtt     # Displays current MQTT broker binding (none by default)
```

To assign the MQTT broker address using URL (used in this demo):
```bash
eth -mqtt url "mqtt-dashboard.com"
eth -mqtt port 1883
eth -mqtt     # Display updated configuration
```

### Update Ethernet Bindings

As LAN access is on `xxx.xxx.100.xxx`:

```bash
eth -ifconfig           # Displays current binding
eth -ifconfig ip 192.168.100.170     # Update device LAN address
eth -ifconfig gw 192.168.100.2       # Update LAN to WAN gateway access
```

> **NOTE:** The bindings will not be updated until a system reset is issued.

```bash
core -reset
```

After reset:
- New bindings are displayed.
- Three of the four sensors are configured and ready to be polled.
- The BROKER URL is undefined (due to port access restrictions for WAM).
- The status LED will toggle **GREEN**.

After changing the port and issuing a system reset:
- MQTT URL is resolved.
- Connection is made to the remote broker.
- Subscription request is granted.

> **NOTE:** The status LED (STATS) will be solid **GREEN**.
> Only one packet is transmitted.

At any time, a list of active tasks can be displayed.