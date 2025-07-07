# Kiosk Role

This Ansible role configures a Raspberry Pi for kiosk mode with Chromium browser.

## Features

- Installs required X11 and kiosk packages
- Configures automatic login for kiosk user
- Sets up X11 startup script with Chromium in kiosk mode
- Waits for services to be available before launching browser
- Configurable kiosk URL and user

## Variables

- `kiosk_user`: User to run kiosk mode (default: "zemfyre")
- `kiosk_url`: URL to display in kiosk mode (default: "http://localhost:51850/")
- `kiosk_wait_service`: Service to wait for before launching (default: "http://localhost:53000/")
- `kiosk_wait_timeout`: Timeout for service wait in seconds (default: 120)
- `kiosk_chromium_flags`: List of Chromium flags
- `kiosk_packages`: List of packages to install

## Usage

### Standalone playbook:
```bash
ansible-playbook -i hosts.ini deploy-kiosk.yml
```

### Include in existing playbook:
```yaml
- name: Setup kiosk mode
  include_role:
    name: kiosk
  vars:
    kiosk_user: "myuser"
    kiosk_url: "http://localhost:8080/"
```

## Requirements

- Raspberry Pi with Raspbian/Raspberry Pi OS
- SSH access with sudo privileges
- Internet connection for package installation
