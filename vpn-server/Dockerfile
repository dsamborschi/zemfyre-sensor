# Lightweight OpenVPN server (no Node.js)
FROM alpine:3.18

# Install required packages
RUN apk add --no-cache \
    openvpn \
    easy-rsa \
    iptables \
    bash \
    curl \
    openssl

# Create directories
RUN mkdir -p /etc/openvpn/pki \
    /etc/openvpn/ccd \
    /etc/openvpn/scripts \
    /var/log/openvpn

# Copy OpenVPN configuration
COPY config/server.conf /etc/openvpn/
COPY config/client-template.conf /etc/openvpn/

# Copy scripts
COPY scripts/ /etc/openvpn/scripts/
RUN chmod +x /etc/openvpn/scripts/*.sh

# Use existing openvpn user/group created by openvpn package
# Set permissions
RUN chown -R openvpn:openvpn /etc/openvpn /var/log/openvpn

# Expose ports
EXPOSE 1194/udp 7505/tcp

# Health check - verify OpenVPN is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD pgrep openvpn || exit 1

# Entry point
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["start"]