# Remote Access Integration in install.sh

## Overview

The `install.sh` script now includes an optional **SSH Reverse Tunnel setup** during initial device installation. This allows users to enable remote device access as part of the installation process.

## Installation Flow

```
1. Install prerequisites
2. Initialize system
3. Install packages
4. Install Ansible
5. Run Ansible playbook
6. Upgrade Docker containers
7. ✨ Setup Remote Access (NEW - Optional)
8. Cleanup
9. Modify permissions
10. Complete installation
11. Reboot
```

## User Experience

During installation, after Docker containers are set up, users see:

```
╔═══════════════════════════════════════════════════════════╗
║     Remote Device Access Setup (Optional)                 ║
╚═══════════════════════════════════════════════════════════╝

SSH Reverse Tunnel allows remote access to this device from your cloud server.
This is useful for fleet management and remote troubleshooting.

? Would you like to enable remote access? (y/N)
```

### If User Selects "Yes":

1. **Prompt for cloud host**:
   ```
   Enter your cloud server hostname or IP address:
   (e.g., cloud.example.com or 203.0.113.50)
   Cloud host: _
   ```

2. **Prompt for SSH user**:
   ```
   Enter the SSH username on the cloud server:
   (Default: tunnel)
   SSH user [tunnel]: _
   ```

3. **Generate SSH keys**:
   ```
   🔌 Setting up SSH reverse tunnel...
   Generating SSH key pair...
   ✅ SSH key generated
   ```

4. **Copy key to cloud**:
   ```
   📤 Copying SSH key to cloud server...
      You may need to enter the password for tunnel@cloud.example.com
   
   [Password prompt appears]
   
   ✅ SSH key copied to cloud server
   ```

5. **Test connection**:
   ```
   🧪 Testing SSH connection...
   ✅ SSH connection successful!
   ```

6. **Update .env**:
   ```
   📝 Updating .env file...
   ✅ Remote access configured!
   
   Cloud Server Configuration Required:
   On your cloud server (cloud.example.com), add to /etc/ssh/sshd_config:
      GatewayPorts yes
      ClientAliveInterval 60
      ClientAliveCountMax 3
   Then restart SSH: sudo systemctl restart sshd
   
   After device restarts, access it from cloud server:
      curl http://localhost:48484/v2/device
   ```

### If User Selects "No":

```
⚠️  Remote access disabled. You can enable it later by running:
   `bash /home/pi/iotistic/bin/setup-remote-access.sh <cloud-host> <ssh-user>`
```

Installation continues normally.

## What Gets Configured

When remote access is enabled, the script:

1. **Creates SSH directory**: `/home/pi/iotistic/data/ssh/`
2. **Generates ED25519 key pair**: `id_rsa` and `id_rsa.pub`
3. **Copies public key** to cloud server
4. **Tests SSH connection**
5. **Updates .env file** with:
   ```bash
   ENABLE_REMOTE_ACCESS=true
   CLOUD_HOST=cloud.example.com
   CLOUD_SSH_PORT=22
   SSH_TUNNEL_USER=tunnel
   SSH_KEY_PATH=/app/data/ssh/id_rsa
   SSH_AUTO_RECONNECT=true
   SSH_RECONNECT_DELAY=5000
   ```

## CI Mode Handling

In CI environments (GitHub Actions), the remote access setup is automatically skipped:

```bash
if [ "$IS_CI_MODE" = true ]; then
    gum format "**CI Mode** - Skipping remote access setup"
    return
fi
```

This prevents installation failures in automated testing.

## Cloud Server Requirements

After device installation, the cloud server needs one-time configuration:

### 1. Create Tunnel User (if doesn't exist)
```bash
sudo useradd -m -s /bin/bash tunnel
sudo passwd tunnel
```

### 2. Configure SSH Server
Edit `/etc/ssh/sshd_config`:
```
GatewayPorts yes
ClientAliveInterval 60
ClientAliveCountMax 3
```

### 3. Restart SSH
```bash
sudo systemctl restart sshd
```

## Post-Installation

After device reboot:

1. Device agent starts automatically
2. SSH tunnel establishes connection to cloud server
3. Device API becomes accessible on cloud at `localhost:48484`

**From cloud server:**
```bash
curl http://localhost:48484/v2/device
curl http://localhost:48484/v2/applications/state
```

## Manual Setup (Alternative)

Users can also skip remote access during installation and set it up later:

```bash
cd /home/pi/iotistic
bash bin/setup-remote-access.sh cloud.example.com tunnel
docker-compose restart agent
```

## Error Handling

The setup function handles errors gracefully:

- **SSH key copy fails**: Shows manual instructions
- **Connection test fails**: Warns user but continues
- **No cloud host provided**: Skips setup with warning
- **Missing SSH utilities**: Script will fail early with clear error

## Files Modified

- **bin/install.sh**: Added `setup_remote_access()` function and integrated into main flow

## Benefits

1. **Seamless Integration**: Remote access setup as part of initial installation
2. **User Choice**: Optional - users can skip if not needed
3. **Guided Process**: Interactive prompts with clear instructions
4. **Error Resilient**: Continues installation even if remote access setup fails
5. **CI Compatible**: Automatically skips in CI environments
6. **Manual Alternative**: Standalone script available for later setup

## Example Installation Session

```bash
sudo bash bin/install.sh

# ... (normal installation steps) ...

╔═══════════════════════════════════════════════════════════╗
║     Remote Device Access Setup (Optional)                 ║
╚═══════════════════════════════════════════════════════════╝

? Would you like to enable remote access? Yes

Cloud host: my-cloud.example.com
SSH user [tunnel]: tunnel

🔌 Setting up SSH reverse tunnel...
✅ SSH key generated
📤 Copying SSH key to cloud server...
Enter password for tunnel@my-cloud.example.com: ********
✅ SSH key copied to cloud server
🧪 Testing SSH connection...
✅ SSH connection successful!
✅ Remote access configured!

# ... (installation completes) ...

? Do you want to reboot now? Yes
Rebooting...
```

After reboot, from cloud server:
```bash
curl http://localhost:48484/v2/device
{
  "uuid": "abc123...",
  "name": "device-abc123",
  "status": "online"
}
```

---

**Status**: ✅ Integrated into install.sh
**Version**: 1.0.0
**Date**: October 2025
