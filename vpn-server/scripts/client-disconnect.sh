#!/bin/bash
# Client disconnect script for OpenVPN
# Called when a client disconnects from the VPN server
# Environment variables available:
# - common_name: Client certificate CN
# - trusted_ip: Client's real IP address
# - ifconfig_pool_remote_ip: VPN IP that was assigned to client
# - bytes_received: Total bytes received from client
# - bytes_sent: Total bytes sent to client
# - time_duration: Connection duration in seconds

LOG_FILE="/var/log/openvpn/clients.log"

# Log client disconnection
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Client disconnected: CN=${common_name}, VPN_IP=${ifconfig_pool_remote_ip}, Duration=${time_duration}s, RX=${bytes_received}, TX=${bytes_sent}" >> "$LOG_FILE"

# Notify API server (optional)
if [ -n "$API_URL" ]; then
    curl -s -X POST "${API_URL}/vpn/events/disconnect" \
        -H "Content-Type: application/json" \
        -d "{\"common_name\":\"${common_name}\",\"vpn_ip\":\"${ifconfig_pool_remote_ip}\",\"duration\":${time_duration:-0},\"bytes_rx\":${bytes_received:-0},\"bytes_tx\":${bytes_sent:-0}}" \
        > /dev/null 2>&1 || true
fi

exit 0
