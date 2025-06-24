# Connect to Sensor via PuTTY (Serial)

This guide explains how to connect to the **sensor** using PuTTY over a serial connection.

---

## 🔧 PuTTY Configuration

**1. Launch PuTTY**

**2. Configure the following connection settings:**

| Setting         | Value        |
|-----------------|--------------|
| Connection type | Serial       |
| Serial line     | COM4         |
| Speed (baud)    | 115200       |

> These settings can be found under **Session** in the PuTTY sidebar.

---

**3. (Optional) Load Saved Session:**
- If you have saved the session:
  - Select `sensor` from the list under **Saved Sessions**
  - Click **Load**

**4. Start the Session:**
- Click **Open** to begin the serial connection.
- A terminal window will appear with the sensor’s output or login prompt.

---

## 💡 Notes

- Ensure the correct COM port (`COM4`) matches the one your sensor device is connected to. This may vary depending on your system.
- If nothing appears, press `Enter` to wake up the device or check your cable and power.
- You may need drivers for USB-to-Serial adapters (e.g., CH340 or CP210x chips).
