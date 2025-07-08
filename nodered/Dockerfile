FROM nodered/node-red

USER root

RUN apk update && \
    apk add --no-cache python3 py3-numpy py3-pandas py3-scikit-learn && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Copy custom files
COPY data/package.json /data/
COPY data/settings.js /data/settings.js
COPY data/flows.json /data/flows.json

WORKDIR /data

RUN chown -R node-red:node-red /data

# Install dependencies as node-red user
# USER node-red
RUN npm ci || npm install

# Now overwrite the fixed node-red-contrib-machine-learning-v2 module
COPY data/custom/node-red-contrib-machine-learning-v2 /data/node_modules/node-red-contrib-machine-learning-v2

WORKDIR /usr/src/node-red



