#!/bin/bash
# Client connect script for OpenVPN
# Called when a client connects to the VPN server
# Environment variables available:
# - common_name: Client certificate CN
# - trusted_ip: Client's real IP address
# - ifconfig_pool_remote_ip: VPN IP assigned to client

LOG_FILE="/var/log/openvpn/clients.log"

# Log client connection
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Client connected: CN=${common_name}, VPN_IP=${ifconfig_pool_remote_ip}, Real_IP=${trusted_ip}" >> "$LOG_FILE"

# Notify API server (optional)
if [ -n "$API_URL" ]; then
    curl -s -X POST "${API_URL}/vpn/events/connect" \
        -H "Content-Type: application/json" \
        -d "{\"common_name\":\"${common_name}\",\"vpn_ip\":\"${ifconfig_pool_remote_ip}\",\"real_ip\":\"${trusted_ip}\"}" \
        > /dev/null 2>&1 || true
fi

exit 0
