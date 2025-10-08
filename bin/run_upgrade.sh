#!/bin/bash
# latest version    
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://iotistic.ca/install-agent)

# specific version
# tag="v1.2.3"
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://iotistic.ca/install-agent) v1.2.3

# Install or upgrade iotistic (formerly docker) engine
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://iotistic.ca/install-engine)
