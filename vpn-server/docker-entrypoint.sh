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

# Start the API server
start_api_server() {
    log "Starting VPN API server..."
    
    cd /app
    
    # Wait for database to be ready
    if [ -n "$DATABASE_URL" ]; then
        log "Waiting for database connection..."
        while ! pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
            sleep 2
        done
        success "Database connection established"
    fi
    
    # Start Node.js API server
    node dist/index.js &
    API_PID=$!
    
    # Wait a moment for API to start
    sleep 3
    
    # Check if API is running
    if kill -0 $API_PID 2>/dev/null; then
        success "VPN API server started successfully (PID: $API_PID)"
    else
        error "Failed to start VPN API server"
        exit 1
    fi
}

# Monitor services
monitor_services() {
    log "Monitoring VPN and API services..."
    
    while true; do
        # Check OpenVPN
        if ! pgrep openvpn > /dev/null; then
            error "OpenVPN server has stopped, restarting..."
            start_vpn_server
        fi
        
        # Check API server
        if [ -n "$API_PID" ] && ! kill -0 $API_PID 2>/dev/null; then
            error "API server has stopped, restarting..."
            start_api_server
        fi
        
        sleep 30
    done
}

# Graceful shutdown
cleanup() {
    log "Shutting down services..."
    
    # Stop API server
    if [ -n "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
    fi
    
    # Stop OpenVPN
    pkill openvpn 2>/dev/null || true
    
    success "Services stopped"
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
        start_vpn_server
        start_api_server
        monitor_services
        ;;
    "init-pki")
        init_pki
        ;;
    "vpn-only")
        init_pki
        setup_iptables
        start_vpn_server
        # Keep container running
        tail -f /var/log/openvpn/openvpn.log
        ;;
    "api-only")
        start_api_server
        # Keep container running
        wait $API_PID
        ;;
    *)
        echo "Usage: $0 {start|init-pki|vpn-only|api-only}"
        exit 1
        ;;
esac