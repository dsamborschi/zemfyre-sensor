#!/bin/sh
set -e

# Automatically fetch the latest release tag from GitHub
tag=$(curl -sL https://github.com/iotistica/apps-engine/releases/latest \
       | grep -oP 'tag/\K[^"]+')
tag=$(echo "$tag" | sed 's|+|.|g')

# Check and warn about missing required commands before doing any actual work.
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
		You are not running as root and we are unable to find "sudo" available.
		EOF
		exit 1
	fi
	sudo="sudo -E"
fi

# Detect the system architecture
machine=$(uname -m)

case "$machine" in
	"armv5"*)
		arch="armv5e"
		;;
	"armv6"*)
		arch="armv6l"
		;;
	"armv7"*)
		arch="armv7hf"
		;;
	"armv8"*)
		arch="arm64"
		;;
	"aarch64"*)
		arch="arm64"
		;;
	"x86_64")
		arch="amd64"
		;;
	*)
		echo "Unknown machine type: $machine" >&2
		exit 1
esac

# Download and extract

# Download and extract
# curl -L https://github.com/iotistica/apps-engine/releases/download/${tag}/iotistic-engine-${tag}-linux_${arch}.tar.gz \
#   | sudo tar xzv -C /usr/bin --strip-components=1

url="https://github.com/iotistica/apps-engine/releases/download/${tag}/iotistic-engine-${tag}-linux_${arch}.tar.gz"
curl -sL "$url" | $sudo tar xzv -C /usr/bin --strip-components=1

cat <<-EOF

Installation successful!

█████    ███████    ███████████ █████  █████████  ███████████ █████   █████████ 
░░███   ███░░░░░███ ░█░░░███░░░█░░███  ███░░░░░███░█░░░███░░░█░░███   ███░░░░░███
 ░███  ███     ░░███░   ░███  ░  ░███ ░███    ░░░ ░   ░███  ░  ░███  ███     ░░░ 
 ░███ ░███      ░███    ░███     ░███ ░░█████████     ░███     ░███ ░███         
 ░███ ░███      ░███    ░███     ░███  ░░░░░░░░███    ░███     ░███ ░███         
 ░███ ░░███     ███     ░███     ░███  ███    ░███    ░███     ░███ ░░███     ███
 █████ ░░░███████░      █████    █████░░█████████     █████    █████ ░░█████████ 
░░░░░    ░░░░░░░       ░░░░░    ░░░░░  ░░░░░░░░░     ░░░░░    ░░░░░   ░░░░░░░░░  
  
  the container engine for the IoT

To use appEngine you need to start iotitic-engine-daemon as a background process...
This can be done manually or using the init system scripts provided here:

    https://github.com/balena-os/balena-engine/tree/$tag/contrib/init

This requires adding a \"iotistic-engine\" group for the daemon to run under:

    sudo groupadd -r iotistic-engine

If you want to allow non-root users to run containers they can be added to this group
with something like:

    sudo usermod -aG iotistic-engine <user>

WARNING: Adding a user to the \"iotistic-engine\" group will grant the ability to run
         containers which can be used to obtain root privileges on the
         docker host.
         Refer to https://docs.docker.com/engine/security/security/#docker-daemon-attack-surface
         for more information.
EOF