---
mode: agent
---

# Fix Ansible Docker Installation Issues

## Context
The Ansible deployment role installs Docker on Raspberry Pi devices. Common issues include malformed apt repository files and dependency conflicts.

## Common Issues

1. **Malformed docker.list file**
   - Error: `E:Malformed entry 1 in list file /etc/apt/sources.list.d/docker.list`
   - Cause: Manual repository setup with incorrect variable substitution
   - Solution: Use Docker's official convenience script

2. **apt_repository module fails**
   - Module parses all repository files before making changes
   - Existing malformed files cause module to fail
   - Pre-flight cleanup doesn't help if module validates first

3. **Variable substitution issues**
   - `{{ architecture }}` or `{{ docker_codename }}` may be empty
   - Debian/Ubuntu codename mapping needed (noble→bookworm, jammy→bullseye)
   - Architecture mapping needed (x86_64→amd64, aarch64→arm64, armv7l→armhf)

## Recommended Solution

Replace manual repository setup with Docker's official convenience script:

```yaml
- name: Install Docker using official convenience script
  ansible.builtin.shell: |
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    rm /tmp/get-docker.sh
  when: docker_version.rc != 0
```

## Task

Fix Docker installation in Ansible:
1. Review current installation method in `ansible/roles/system/tasks/main.yml`
2. Replace complex manual repository setup with convenience script
3. Remove codename and architecture detection logic
4. Add Docker version verification
5. Ensure user is added to docker group
6. Test on multiple Debian/Ubuntu versions

## Key Files
- `ansible/roles/system/tasks/main.yml` (Docker installation section)
- `ansible/deploy.yml`

## Success Criteria
- Docker installs successfully on Debian 11, 12 and Ubuntu 22.04, 24.04
- No malformed repository file errors
- Docker service starts and is enabled
- User can run docker commands without sudo
- Ansible playbook completes without errors
