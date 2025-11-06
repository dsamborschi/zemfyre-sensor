#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# Initialize PKI if it doesn't exist
init_pki() {
    if [ ! -f "/etc/openvpn/pki/ca.crt" ]; then
        log "Initializing PKI..."
        
        cd /etc/openvpn
        
        # Initialize easy-rsa (force non-interactive mode)
        /usr/share/easy-rsa/easyrsa --batch init-pki
        
        # Build CA
        echo "iotistic-vpn-ca" | /usr/share/easy-rsa/easyrsa --batch build-ca nopass
        
        # Generate server certificate
        echo "server" | /usr/share/easy-rsa/easyrsa --batch gen-req server nopass
        echo "yes" | /usr/share/easy-rsa/easyrsa --batch sign-req server server
        
        # Generate DH parameters
        /usr/share/easy-rsa/easyrsa --batch gen-dh
        
        # Generate TLS auth key
        openvpn --genkey secret pki/ta.key
        
        # Generate CRL
        /usr/share/easy-rsa/easyrsa --batch gen-crl
        
        # Set proper permissions
        chown -R openvpn:openvpn /etc/openvpn/pki
        chmod 400 /etc/openvpn/pki/private/*
        
        success "PKI initialized successfully"
    else
        log "PKI already exists, skipping initialization"
    fi
}

# Set up iptables rules for VPN
setup_iptables() {
    log "Setting up iptables rules..."
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Get the default route interface
    DEFAULT_INTERFACE=$(ip route | grep default | awk '{print $5}' | head -n1)
    
    if [ -n "$DEFAULT_INTERFACE" ]; then
        # NAT rules for VPN traffic
        iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o $DEFAULT_INTERFACE -j MASQUERADE
        iptables -A FORWARD -i tun0 -j ACCEPT
        iptables -A FORWARD -i tun0 -o $DEFAULT_INTERFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
        iptables -A FORWARD -i $DEFAULT_INTERFACE -o tun0 -m state --state RELATED,ESTABLISHED -j ACCEPT
        
        success "iptables rules configured for interface $DEFAULT_INTERFACE"
    else
        warn "Could not determine default interface, NAT may not work properly"
    fi
}

# Start the VPN server
start_vpn_server() {
    log "Starting OpenVPN server..."
    
    # Ensure log directory exists
    mkdir -p /var/log/openvpn
    chown openvpn:openvpn /var/log/openvpn
    
    # Start OpenVPN in background with verbose logging
    openvpn --config /etc/openvpn/server.conf --verb 4 --daemon
    
    # Wait a moment for server to start
    sleep 3
    
    # Check log for errors
    if [ -f "/var/log/openvpn/openvpn.log" ]; then
        tail -20 /var/log/openvpn/openvpn.log
    fi
    
    # Check if OpenVPN is running
    if pgrep openvpn > /dev/null; then
        success "OpenVPN server started successfully"
    else
        error "Failed to start OpenVPN server"
        if [ -f "/var/log/openvpn/openvpn.log" ]; then
            error "Last log entries:"
            tail -30 /var/log/openvpn/openvpn.log
        fi
        exit 1
    fi
}

# Start simple HTTP server for CA certificate
start_ca_server() {
    log "Starting CA certificate HTTP server on port 8080..."
    
    # Create a simple HTTP response with CA cert
    while true; do
        { echo -ne "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n"; cat /etc/openvpn/pki/ca.crt; } | nc -l -p 8080 > /dev/null 2>&1
    done &
    
    CA_PID=$!
    success "CA certificate server started on port 8080 (PID: $CA_PID)"
}

# Monitor OpenVPN service
monitor_services() {
    log "Monitoring OpenVPN service..."
    
    while true; do
        # Check if OpenVPN is running
        if ! pgrep openvpn > /dev/null; then
            error "OpenVPN server has stopped, restarting..."
            start_vpn_server
        fi
        
        sleep 30
    done
}

# Graceful shutdown
cleanup() {
    log "Shutting down OpenVPN server..."
    
    # Stop OpenVPN
    pkill openvpn 2>/dev/null || true
    
    success "OpenVPN stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Main execution
case "$1" in
    "start")
        log "Starting Iotistic VPN Server..."
        init_pki
        setup_iptables
        start_ca_server
        start_vpn_server
        monitor_services
        ;;
    "init-pki")
        init_pki
        ;;
    "logs")
        # Follow OpenVPN logs
        tail -f /var/log/openvpn/openvpn.log
        ;;
    *)
        echo "Usage: $0 {start|init-pki|logs}"
        exit 1
        ;;
esac