FROM alpine:3.18

# Install required packages
RUN apk add --no-cache \
    openvpn \
    easy-rsa \
    iptables \
    bash \
    curl \
    openssl \
    nodejs \
    npm \
    postgresql-client

# Create directories
RUN mkdir -p /etc/openvpn/pki \
    /etc/openvpn/ccd \
    /etc/openvpn/scripts \
    /var/log/openvpn \
    /app

# Copy OpenVPN configuration
COPY config/server.conf /etc/openvpn/
COPY config/client-template.conf /etc/openvpn/

# Copy scripts
COPY scripts/ /etc/openvpn/scripts/
RUN chmod +x /etc/openvpn/scripts/*.sh

# Set up application
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY dist/ ./dist/

# Create openvpn user
RUN addgroup -g 1001 openvpn && \
    adduser -D -u 1001 -G openvpn openvpn

# Set permissions
RUN chown -R openvpn:openvpn /etc/openvpn /var/log/openvpn /app

# Expose ports
EXPOSE 1194/udp 3200/tcp 7505/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3200/health || exit 1

# Entry point
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["start"]