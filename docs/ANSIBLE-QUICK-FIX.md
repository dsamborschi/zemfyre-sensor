# Quick Fix Summary - Ansible APT Failures

## The Problem
```
TASK [network : Ensure NetworkManager is installed]
fatal: [localhost]: FAILED! => {"msg": "Failed to update apt cache: unknown reason"}
```

**Root cause**: Broken Docker repository files from previous failed runs made ALL apt operations fail.

## The Solution

Simplified Docker installation to use official script + cleanup:

```yaml
# 1. Clean up broken files
- name: Remove broken Docker repository files
  file:
    path: "{{ item }}"
    state: absent
  loop:
    - /etc/apt/sources.list.d/docker.list
    - /etc/apt/keyrings/docker.gpg

# 2. Update apt cache
- apt:
    update_cache: yes

# 3. Check if Docker installed  
- command: docker --version
  register: docker_version

# 4. Install Docker if needed
- shell: curl -fsSL https://get.docker.com | sh
  when: docker_version.rc != 0
```

## Why This Works

- ✅ Removes broken repo files from failed runs
- ✅ Refreshes apt cache so network role works
- ✅ Uses official Docker script (handles GPG keys correctly)
- ✅ Idempotent (only installs when needed)
- ✅ Simple (15 lines vs 70+ lines)

## Test It

```bash
cd ~/iotistic/ansible
./run.sh

# Should now complete without errors!
```

**Files changed**: `ansible/roles/system/tasks/main.yml`
