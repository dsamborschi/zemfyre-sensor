#!/bin/sh
set -e

# Automatically fetch the latest release tag from GitHub
tag=$(curl -sL https://github.com/iotistica/apps-engine/releases/latest \
       | grep -oP 'tag/\K[^"]+')
tag=$(echo "$tag" | sed 's|+|.|g')

# Check required commands
abort=0
for cmd in curl tar; do
    if [ -z "$(command -v $cmd)" ]; then
        cat >&2 <<-EOF
        Error: unable to find required command: $cmd
        EOF
        abort=1
    fi
done
[ $abort = 1 ] && exit 1

sudo=
if [ "$(id -u)" -ne 0 ]; then
    if [ -z "$(command -v sudo)" ]; then
        cat >&2 <<-EOF
        Error: this installer needs the ability to run commands as root.
        You are not running as root and we are unable to find "sudo".
        EOF
        exit 1
    fi
    sudo="sudo -E"
fi

# Detect architecture
machine=$(uname -m)
case "$machine" in
    "armv5"*) arch="armv5e" ;;
    "armv6"*) arch="armv6l" ;;
    "armv7"*) arch="armv7hf" ;;
    "armv8"*) arch="arm64" ;;
    "aarch64") arch="arm64" ;;
    "x86_64") arch="amd64" ;;
    *) echo "Unknown machine type: $machine" >&2; exit 1 ;;
esac

# Download and extract
url="https://github.com/iotistica/apps-engine/releases/download/${tag}/iotistic-engine-${tag}-linux_${arch}.tar.gz"
curl -sL "$url" | $sudo tar xzv -C /usr/bin --strip-components=1