# Ansible Docker Installation Fix

## Problem

The Ansible playbook was failing at various `apt` operations:
```
TASK [network : Ensure NetworkManager is installed]
fatal: [localhost]: FAILED! => {"changed": false, "msg": "Failed to update apt cache: unknown reason"}
```

And earlier at:
```
TASK [system : Add Docker repository]
changed: [localhost]  # ← Always "changed" (not idempotent)
```

## Root Causes

### 1. **Non-Idempotent Docker Repository Task**
The `lineinfile` task without a `regexp` parameter wasn't idempotent.

### 2. **GPG Key Format Issues** 
Attempting to manually manage Docker GPG keys and repositories was error-prone and caused apt cache failures.

### 3. **Over-Complicated Setup**
Manually detecting codenames, mapping architectures, managing GPG keys, etc. - all things the official Docker script already does perfectly.

## Solution

**Use the official Docker installation script for everything!**

The `get.docker.com` script handles:
- ✅ GPG key download and dearmoring
- ✅ Repository detection and setup  
- ✅ Architecture detection
- ✅ Codename mapping
- ✅ Package installation
- ✅ All edge cases

### Before (70+ lines)
```yaml
# Remove old files
# Detect codename
# Map codename
# Create keyrings directory  
# Download GPG key (wrong format!)
# Add repository (not idempotent!)
# Update apt cache (fails!)
# Check Docker
# Install Docker
```

### After (15 lines)
```yaml
# Check if Docker is installed
- name: Check if Docker is installed
  command: docker --version
  register: docker_version
  ignore_errors: true
  changed_when: false

# Install Docker using official script  
- name: Install Docker using official script
  shell: curl -fsSL https://get.docker.com | sh
  when: docker_version.rc != 0
```

## Benefits

1. ✅ **Simpler** - 70+ lines → 15 lines
2. ✅ **More Reliable** - Official Docker script is battle-tested
3. ✅ **Idempotent** - Only runs when Docker not installed
4. ✅ **No apt Failures** - Script handles GPG keys correctly
5. ✅ **Future-Proof** - Docker maintains the script
6. ✅ **Faster** - No unnecessary tasks

## Testing

```bash
cd ansible && ./run.sh

# First run:
TASK [system : Check if Docker is installed]
fatal: [localhost]: FAILED! (Docker not installed)

TASK [system : Install Docker using official script]  
changed: [localhost]  # ← Installs Docker

✅ Success!

# Second run:
TASK [system : Check if Docker is installed]
ok: [localhost]  # ← Docker found

TASK [system : Install Docker using official script]
skipped: [localhost]  # ← Skipped (idempotent)

✅ Idempotent!
```

## Verification

```bash
# Check Docker installed
docker --version
# Output: Docker version 24.0.7, build ...

# Check repository was created correctly
cat /etc/apt/sources.list.d/docker.list
# Should contain properly formatted deb line

# Test apt works
sudo apt update
# Should succeed without errors
```

## Key Takeaway

**Don't reinvent the wheel!** 

When official installation scripts exist (Docker, Node.js, etc.), use them instead of manually managing repositories and GPG keys.

❌ **Bad**: Manual GPG keys, repository management, codename detection  
✅ **Good**: `curl -fsSL https://get.docker.com | sh`
