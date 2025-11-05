#!/bin/bash
# Server up script for OpenVPN
# Called when the VPN server TUN/TAP device is initialized and ready
# Environment variables available:
# - dev: TUN/TAP device name
# - tun_mtu: MTU of TUN device
# - link_mtu: MTU of UDP link
# - ifconfig_local: Local VPN endpoint IP
# - ifconfig_netmask: VPN network netmask

LOG_FILE="/var/log/openvpn/server.log"

# Log server startup
echo "[$(date +'%Y-%m-%d %H:%M:%S')] VPN server UP: Device=${dev}, Local=${ifconfig_local}, Netmask=${ifconfig_netmask}" >> "$LOG_FILE"

# Additional routing or firewall rules can be added here
# Example: Allow forwarding through VPN interface
if [ -n "$dev" ]; then
    iptables -A FORWARD -i "$dev" -j ACCEPT 2>/dev/null || true
    iptables -A FORWARD -o "$dev" -j ACCEPT 2>/dev/null || true
fi

exit 0
