#!/bin/bash
# Server down script for OpenVPN
# Called when the VPN server is shutting down
# Environment variables available:
# - dev: TUN/TAP device name
# - tun_mtu: MTU of TUN device
# - link_mtu: MTU of UDP link
# - ifconfig_local: Local VPN endpoint IP
# - ifconfig_netmask: VPN network netmask

LOG_FILE="/var/log/openvpn/server.log"

# Log server shutdown
echo "[$(date +'%Y-%m-%d %H:%M:%S')] VPN server DOWN: Device=${dev}, Local=${ifconfig_local}" >> "$LOG_FILE"

# Cleanup firewall rules if needed
if [ -n "$dev" ]; then
    iptables -D FORWARD -i "$dev" -j ACCEPT 2>/dev/null || true
    iptables -D FORWARD -o "$dev" -j ACCEPT 2>/dev/null || true
fi

exit 0
