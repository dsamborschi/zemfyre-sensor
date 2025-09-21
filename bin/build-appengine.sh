#!/usr/bin/env bash
set -euo pipefail

# === Config ===
ARCH="arm64"   # set "arm" for 32-bit Raspberry Pi OS
MOBY_REPO="https://github.com/moby/moby.git"
CONTAINERD_REPO="https://github.com/containerd/containerd.git"
RUNC_REPO="https://github.com/opencontainers/runc.git"
OUTDIR="$PWD/output"
APP_NAME="appEngine"
APP_VERSION="0.1-pi"

# Ensure Go is installed
if ! command -v go >/dev/null 2>&1; then
  echo "Go not found. Please install Go >=1.21"
  exit 1
fi

mkdir -p "$OUTDIR"

# === Build runc ===
if [ ! -d runc ]; then
  git clone --depth=1 "$RUNC_REPO"
fi
cd runc
export GOARCH=$ARCH
make static
cp runc "$OUTDIR/"
cd ..

# === Build containerd ===
if [ ! -d containerd ]; then
  git clone --depth=1 "$CONTAINERD_REPO"
fi
cd containerd
export GOARCH=$ARCH
make bin/containerd bin/containerd-shim bin/ctr
cp bin/containerd bin/containerd-shim bin/ctr "$OUTDIR/"
cd ..

# === Build docker (Moby) -> appEngine ===
if [ ! -d moby ]; then
  git clone --depth=1 "$MOBY_REPO"
fi
cd moby
export GOARCH=$ARCH
export DOCKER_BUILDTAGS="exclude_swarm exclude_graphdriver_btrfs exclude_graphdriver_devicemapper exclude_aufs"
export DOCKER_BUILDKIT=0

make clean || true

# Inject branding via ldflags
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
echo "appEngine build complete for arch=$ARCH"
echo "Binaries + systemd unit are in: $OUTDIR"
echo
echo "Contents:"
ls -1 "$OUTDIR"
echo
echo "Next steps on Raspberry Pi:"
echo "  1) scp output/* pi@raspberrypi:/usr/local/bin/"
echo "  2) scp output/appengine.service pi@raspberrypi:/etc/systemd/system/"
echo "  3) On Pi: sudo systemctl daemon-reexec"
echo "  4) On Pi: sudo systemctl enable --now appengine.service"
echo "  5) Test with either:"
echo "       appengine run hello-world"
echo "       docker run hello-world (alias wrapper)"
echo "  6) Check branding:"
echo "       appengine version"
