#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
ARCH="$(uname -m)"   # automatically detects arm/arm64
MOBY_REPO="https://github.com/moby/moby.git"
CONTAINERD_REPO="https://github.com/containerd/containerd.git"
OUTDIR="$PWD/output"
APP_NAME="appEngine"
APP_VERSION="0.1-pi"

# Ensure Go >=1.21 is installed
if ! command -v go >/dev/null 2>&1; then
  echo "Go not found. Please install Go >=1.21"
  exit 1
fi

mkdir -p "$OUTDIR"

# --- Use system runc ---
if ! command -v runc >/dev/null 2>&1; then
  echo "Installing runc from system packages..."
  sudo apt update
  sudo apt install -y runc
fi

# === Build containerd ===
if [ ! -d containerd ]; then
  git clone --depth=1 "$CONTAINERD_REPO"
fi
cd containerd
make bin/containerd bin/containerd-shim bin/ctr
cp bin/containerd bin/containerd-shim bin/ctr "$OUTDIR/"
cd ..

# === Build Moby (docker) -> appEngine ===
if [ ! -d moby ]; then
  git clone --depth=1 "$MOBY_REPO"
fi
cd moby

export CGO_ENABLED=0           # disable cgo for Pi build
export DOCKER_BUILDTAGS="exclude_swarm exclude_graphdriver_btrfs exclude_graphdriver_devicemapper exclude_aufs"
export DOCKER_BUILDKIT=0

make clean || true

# Branding via ldflags
LDFLAGS="-X github.com/docker/docker/dockerversion.ProductName=${APP_NAME} \
         -X github.com/docker/docker/dockerversion.Version=${APP_VERSION}"

# Build client & daemon
go build -o "$OUTDIR/appengine" -tags "$DOCKER_BUILDTAGS" -ldflags "$LDFLAGS" ./cmd/docker
go build -o "$OUTDIR/appengined" -tags "$DOCKER_BUILDTAGS" -ldflags "$LDFLAGS" ./cmd/dockerd
cd ..

# === Create systemd unit file for appEngine ===
cat > "$OUTDIR/appengine.service" <<'EOF'
[Unit]
Description=appEngine Daemon
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/appengined \
  --host=unix:///var/run/appengine.sock \
  --host=unix:///var/run/docker.sock \
  --storage-driver=overlay2
ExecReload=/bin/kill -s HUP $MAINPID
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
TimeoutStartSec=0
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# === Add docker alias wrapper ===
cat > "$OUTDIR/docker" <<'EOF'
#!/bin/sh
# Alias wrapper: call appengine instead of docker
exec /usr/local/bin/appengine "$@"
EOF
chmod +x "$OUTDIR/docker"

# === Done ===
echo "=================================================="
echo "appEngine build complete for native Pi ($ARCH)"
echo "Binaries + systemd unit are in: $OUTDIR"
echo
echo "Next steps on Raspberry Pi:"
echo "  1) sudo cp output/* /usr/local/bin/"
echo "  2) sudo cp output/appengine.service /etc/systemd/system/"
echo "  3) sudo systemctl daemon-reexec"
echo "  4) sudo systemctl enable --now appengine.service"
echo "  5) Test with:"
echo "       appengine run hello-world"
echo "       docker run hello-world (alias wrapper)"
echo "  6) Check branding:"
echo "       appengine version"
