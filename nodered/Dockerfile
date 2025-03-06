FROM nodered/node-red

USER root

# Copy custom files
COPY data/package.json /data
COPY data/package-lock.json /data
COPY data/settings.js /data/settings.js
COPY data/flows.json /data/flows.json

# Set working directory
WORKDIR /data

# Adjust file permissions
RUN chown -R root:node-red /data

# Install dependencies using npm
RUN npm ci

WORKDIR /usr/src/node-red


# Switch back to node-red userdoc
# USER node-red


