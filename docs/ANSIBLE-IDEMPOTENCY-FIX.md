# Ansible Idempotency Fix - Docker Repository Task

## Problem

The Ansible task **"Add Docker repository"** was running (showing as "changed") every time the playbook executed, even when the repository was already configured correctly.

## Root Cause

The `lineinfile` module without a `regexp` parameter checks for an **exact string match**. However, the line being inserted contains Jinja2 variables:

```yaml
line: "deb [arch={{ architecture }} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian {{ docker_codename | trim }} stable"
```

### Why It Failed Idempotency

1. **Variable Rendering**: The `{{ architecture }}` variable might render differently between runs (e.g., `amd64` vs `x86_64`)
2. **No Pattern Matching**: Without `regexp`, `lineinfile` does a literal string comparison
3. **File vs Variable Mismatch**: The file might contain `amd64` but the variable renders as `amd64` with different whitespace or formatting

## Solution

Added a `regexp` parameter to match any Docker repository line, making the task idempotent:

```yaml
- name: Add Docker repository
  ansible.builtin.lineinfile:
    path: /etc/apt/sources.list.d/docker.list
    create: yes
    regexp: '^deb .* https://download.docker.com/linux/debian .* stable$'  # ← Added!
    line: "deb [arch={{ architecture }} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian {{ docker_codename | trim }} stable"
    state: present
```

### How It Works Now

1. **First Run**: `regexp` doesn't match any line → inserts the line → **changed**
2. **Subsequent Runs**: `regexp` matches existing line → updates if different, otherwise skips → **ok** (not changed)

## Testing

### Before Fix
```bash
cd ansible && ./run.sh

# Output:
TASK [system : Add Docker repository]
changed: [localhost]  # ← Always "changed"
```

### After Fix
```bash
cd ansible && ./run.sh

# First run:
TASK [system : Add Docker repository]
changed: [localhost]  # ← Changed (first time)

# Second run:
TASK [system : Add Docker repository]
ok: [localhost]  # ← OK (idempotent)
```

## Verification

Check the file contents:
```bash
cat /etc/apt/sources.list.d/docker.list

# Should contain:
# deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable
```

Run playbook twice:
```bash
cd ~/iotistic/ansible
./run.sh  # First run
./run.sh  # Second run - should show "ok" not "changed"
```

## Benefits

1. **True Idempotency**: Task only reports "changed" when actually making changes
2. **Faster Playbook Runs**: Skips unnecessary operations
3. **Clearer Output**: Easier to see what actually changed
4. **Better CI/CD**: Idempotent tasks are critical for automation

## Related Ansible Best Practices

### Always Use `regexp` with `lineinfile`

❌ **Bad** (not idempotent):
```yaml
- name: Add config line
  lineinfile:
    path: /etc/config
    line: "setting=value"
    state: present
```

✅ **Good** (idempotent):
```yaml
- name: Add config line
  lineinfile:
    path: /etc/config
    regexp: '^setting='
    line: "setting=value"
    state: present
```

### Use `changed_when` for Read-Only Tasks

```yaml
- name: Check Docker version
  command: docker --version
  register: docker_version
  changed_when: false  # ← Never report as changed
```

### Use Conditional Execution

```yaml
- name: Install Docker
  shell: curl -fsSL https://get.docker.com | sh
  when: docker_version.rc != 0  # ← Only run if not installed
```

## Other Potential Idempotency Issues in Playbook

After reviewing the playbook, here are other tasks to watch:

### ✅ Already Idempotent
- `lineinfile` tasks with `regexp` (NTP configuration)
- `systemd` tasks (checking state)
- `apt` tasks (package management is idempotent)

### ⚠️ Potentially Not Idempotent
None found after the Docker repository fix.

## Summary

**File Modified**: `ansible/roles/system/tasks/main.yml`

**Change**: Added `regexp: '^deb .* https://download.docker.com/linux/debian .* stable$'` to the "Add Docker repository" task

**Result**: Task now properly detects existing repository and only reports "changed" when actually modifying the file
