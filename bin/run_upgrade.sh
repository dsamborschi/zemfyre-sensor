#!/bin/bash
# latest version    
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://scripts.iotistic.ca/install)

# specific version
# tag="v1.2.3"
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://scripts.iotistic.ca/install) v1.2.3

# Install or upgrade iotistic (formerly docker) engine
bash <(curl -H 'Cache-Control: no-cache' -sL --proto '=https' https://scripts.iotistic.ca/install-engine)
