FROM node:20-alpine

ARG REGISTRY
ARG REGISTRY_TOKEN
ARG TAG=latest
RUN if [[ ! -z "$REGISTRY_TOKEN" ]]; then echo "//$REGISTRY/:_authToken=$REGISTRY_TOKEN" >> ~/.npmrc ; fi
RUN if [[ ! -z "$REGISTRY" ]] ; then npm config set @flowfuse:registry "https://$REGISTRY"; fi

WORKDIR /usr/src/mqtt-schema-agent
# RUN npm install --production --no-audit --no-fund @flowfuse/mqtt-schema-agent@$TAG

LABEL org.label-schema.name="Iotistic MQTT Schema Agent" \
    org.label-schema.url="https://iotistic.ca" \
    org.label-schema.vcs-type="Git" \
    org.label-schema.docker.dockerfile="docker/Dockerfile" \
    org.schema-label.description="Collects Topic Schema from a MQTT broker" \
    authors="Iotistic Inc."

COPY package*.json ./

# Install dependencies
RUN npm install --unsafe-perm --only=production --no-update-notifier --no-fund --only=production

# Copy the rest of the application files
COPY . .

CMD ["node", "--inspect=0.0.0.0:9231", "index.js"]