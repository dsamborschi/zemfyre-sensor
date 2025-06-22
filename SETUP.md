# SETUP.md

## 0. SSH Credentials for Raspberry Pi
- **Host:** `10.0.0.97`
- **Username:** `admin`
- **Password:** `password123`

## 1. Prerequisites
- Python 3 and pip installed on your local machine
- Ansible installed (`pip install ansible`)
- Git installed on both your local machine and the Raspberry Pi
- SSH access to your Raspberry Pi (default user: `pi`)

## 1a. Prepare the Raspberry Pi
1. **Enable SSH:**
   - Run `sudo raspi-config` on the Pi.
   - Go to "Interface Options" > "SSH" and enable it.
2. **Set a password for the `pi` user:**
   - Run `passwd` and set a password if you haven't already.
3. **Connect the Pi to your network:**
   - Make sure the Pi is connected (Ethernet or Wi-Fi) and note its IP address.
4. **(Optional) Set a static IP:**
   - This makes connecting easier in the future.
5. **(Optional) Ensure Python 3 is installed:**
   - Run `python3 --version` and install with `sudo apt-get install -y python3` if needed.

## 2. Clone the Repository
Clone this repository to your local machine:
```sh
git clone https://github.com/your-username/your-repo.git
cd zemfyre-sensor
```

## 3. Configure Ansible Inventory
Edit the `hosts.ini` file and set your Raspberry Pi's IP address and SSH credentials:
```ini
[raspberrypi]
admin@192.168.1.100 ansible_ssh_pass=password123
```

## 4. Review and Edit Environment Variables (Optional)
Edit the `.env` file to change external port mappings if needed:
```
MOSQUITTO_PORT_EXT=51883
MOSQUITTO_WS_PORT_EXT=59001
NODERED_PORT_EXT=51880
INFLUXDB_PORT_EXT=58086
GRAFANA_PORT_EXT=53000
```

## 5. Run the Ansible Playbook
From your local machine, run:
```sh
ansible-playbook -i hosts.ini deploy-raspberrypi.yml
```
This will:
- Install `git` and `curl` on the Raspberry Pi if missing
- Clone or update the repository on the Pi
- Make `setup.sh` executable
- Run `setup.sh` to build and start all services with health checks

## 6. Access the Services
- Mosquitto: `tcp://<raspberry_pi_ip>:51883`
- Node-RED: `http://<raspberry_pi_ip>:51880`
- InfluxDB: `http://<raspberry_pi_ip>:58086`
- Grafana: `http://<raspberry_pi_ip>:53000`

## 7. Updating the Deployment
- Push changes to GitHub as usual
- Re-run the Ansible playbook to update the Raspberry Pi with the latest code and configuration

---
For troubleshooting or advanced configuration, see the `README.md` or contact the project maintainer.
