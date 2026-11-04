#!/bin/sh
# Inject runtime secrets/config from env vars into Node-RED's flow files
# so Azure Container Apps secrets are the single source of truth.

if [ -n "$INFLUXDB_TOKEN" ] && [ -f /data/flows_cred.json ]; then
    node -e "
        const fs = require('fs');
        const creds = JSON.parse(fs.readFileSync('/data/flows_cred.json', 'utf8'));
        const token = process.env.INFLUXDB_TOKEN;
        for (const id of Object.keys(creds)) {
            if (creds[id].token !== undefined) {
                creds[id].token = token;
            }
        }
        fs.writeFileSync('/data/flows_cred.json', JSON.stringify(creds, null, 4));
        console.log('Injected INFLUXDB_TOKEN into flows_cred.json');
    "
fi

if [ -n "$MQTT_BROKER_HOST" ] && [ -f /data/flows.json ]; then
    node -e "
        const fs = require('fs');
        const flows = JSON.parse(fs.readFileSync('/data/flows.json', 'utf8'));
        const host = process.env.MQTT_BROKER_HOST;
        let count = 0;
        for (const node of flows) {
            if (node.type === 'mqtt-broker' && node.name === 'Zemfyre Azure') {
                node.broker = host;
                count++;
            }
        }
        fs.writeFileSync('/data/flows.json', JSON.stringify(flows, null, 4));
        if (count) console.log('Injected MQTT_BROKER_HOST (' + host + ') into ' + count + ' broker node(s)');
    "
fi

exec npm start --cache /data/.npm -- --userDir /data
