#!/bin/sh
# Inject INFLUXDB_TOKEN from env into flows_cred.json so the InfluxDB
# config nodes always use the token provided by the Azure deployment,
# not whatever was baked into the image at build time.
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
        console.log('Injected INFLUXDB_TOKEN into flows_cred.json for ' +
            Object.keys(creds).length + ' node(s)');
    "
fi
exec npm start --cache /data/.npm -- --userDir /data
