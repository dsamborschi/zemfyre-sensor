FROM nodered/node-red

USER root

RUN apk update && \
    apk add --no-cache python3 py3-numpy py3-pandas py3-scikit-learn && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Copy custom files
COPY data/package.json /data/
COPY data/settings.js /data/settings.js
COPY data/flows.json /data/flows.json
COPY data/flows_cred.json /data/flows_cred.json

# Startup script: injects INFLUXDB_TOKEN env var into flows_cred.json
# so the Azure secret is the single source of truth for the token.
COPY entrypoint.sh /data/entrypoint.sh
RUN chmod +x /data/entrypoint.sh

# Now overwrite the fixed node-red-contrib-machine-learning-v2 module1
COPY data/custom/node-red-contrib-machine-learning-v2 /data/node_modules/node-red-contrib-machine-learning-v2

WORKDIR /data

RUN chown -R node-red:node-red /data

# Install dependencies as node-red user
# USER node-red
RUN npm ci || npm install


WORKDIR /usr/src/node-red

ENTRYPOINT ["/data/entrypoint.sh"]
