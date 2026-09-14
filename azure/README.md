# Deploying the Zemfyre backend to Azure

This deploys **mosquitto, influxdb, node-red, grafana** to Azure. `api` and
`admin` are intentionally not included — `api`'s docker.sock-based container
management and `notify-send` calls don't work in a serverless container
platform.

## Architecture

| Service | Platform | Ingress | Persistent storage | Image source |
|---|---|---|---|---|
| mosquitto | **Azure Container Instances** | Public IP, TCP 1883 + 9001 | Azure Files (works — mosquitto doesn't use SQLite) | Docker Hub `eclipse-mosquitto` |
| influxdb | Container Apps, min replicas 1 | internal only | **none (ephemeral)** — see below | Docker Hub `influxdb:alpine` |
| node-red | Container Apps, min replicas 1 | HTTP (public) | Azure Files | Docker Hub `iotistic/zemfyre-nodered:latest-x86` (this repo's own CI) |
| grafana | Container Apps, min replicas 0 (scale to zero) | HTTP (public) | **none (ephemeral)** — see below | Docker Hub `iotistic/zemfyre-grafana:latest-x86` (this repo's own CI) |

Split across two platforms deliberately, for two independent reasons
discovered while deploying this:

1. **mosquitto needs a public IP on a raw TCP port.** Azure Container Apps
   only allows external TCP ingress when the environment has a custom VNet,
   which provisions a mandatory Standard Load Balancer (~$18-20/month extra).
   Azure Container Instances gets a public IP directly with no VNet needed,
   so mosquitto runs there instead.
2. **InfluxDB and Grafana can't use Azure Files at all.** Both store their
   metadata in an embedded SQLite/BoltDB-style engine, and Azure Files (SMB)
   does not support the file locking these engines require — confirmed via
   a reproducible `"database is locked"` crash loop on every startup,
   regardless of WAL mode or retries. Azure Container Instances doesn't help
   here either — it only supports `AzureFile`, `EmptyDir`, `Secret`, and
   `GitRepo` volumes, no managed disk mount, so ACI can't provide real block
   storage as a workaround. **Until this is fixed, InfluxDB and Grafana run
   on ephemeral local container storage — see "Known gap" below.**

No container registry is needed — every image not built by this repo's own
CI (mosquitto, influxdb) is already public on Docker Hub.

## Known gap: InfluxDB has no persistent storage

**This means sensor data written to InfluxDB is lost every time the
container restarts** (redeploys, crashes, or platform maintenance). This is
the one gap that actually matters — Grafana losing ad hoc UI changes is a
minor inconvenience since dashboards/datasources are already provisioned
from files baked into its image; InfluxDB losing your actual time-series
data is not.

Realistic fixes, none of them free:

- **A small persistent VM running Docker Compose for influx (+ optionally
  mosquitto)** — a real local disk has no SMB locking problem. Cheapest
  (~$8-15/month for a B1s/B2s VM), most reliable, but it's flat-rate billing,
  not consumption. This is probably the pragmatic answer given the two
  platforms already couldn't do this natively.
- **VNet + Premium NFS Azure Files, staying on Container Apps/ACI.** NFS
  supports proper file locking, unlike SMB. But NFS Azure file shares only
  work inside a VNet (no public endpoint at all, by design), which reopens
  the mandatory Load Balancer cost, and Premium file shares have a large
  minimum provisioned size (~100GiB) that pushes storage cost to
  ~$30-40/month on its own. Likely $90-100+/month total — no longer very
  economical.
- **A managed database service** instead of self-hosting InfluxDB. Not
  investigated in depth here; would need its own evaluation.

This hasn't been decided yet — revisit before relying on this deployment for
anything beyond a prototype.

## One-time setup

### 1. Create a service principal for GitHub Actions

```bash
az ad sp create-for-rbac \
  --name "zemfyre-github-deploy" \
  --role Contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group> \
  --sdk-auth
```

Save the JSON output as the GitHub secret `AZURE_CREDENTIALS`. The identity
also needs a role assignment on the target resource group if it doesn't
already have one:

```bash
az role assignment create \
  --assignee <principal-id> \
  --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>
```

### 2. Set GitHub repository secrets and variables

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | JSON from step 1 |
| `AZURE_RESOURCE_GROUP` | e.g. `zemfyre` |
| `INFLUXDB_PASSWORD` | InfluxDB admin password |
| `INFLUXDB_TOKEN` | InfluxDB admin API token (shared with node-red + grafana) |
| `GRAFANA_PASSWORD` | Grafana admin password |

**Variables** (same page, "Variables" tab — optional, have defaults):

| Name | Default |
|---|---|
| `AZURE_LOCATION` | `eastus` |
| `INFLUXDB_USERNAME` | `admin` |
| `GRAFANA_USERNAME` | `admin` |

Locally, the equivalent values live in `azure/.secrets/cloud.env`
(gitignored — never commit this file).

### 3. Deploy in order

```bash
# 1. Shared infra: storage account, file shares, Container Apps Environment
az deployment group create -g <resource-group> -n zemfyre-infra \
  --template-file azure/infra.bicep --parameters location=<region>

# 2. Grab outputs needed by the next steps
ENV_ID=$(az deployment group show -g <resource-group> -n zemfyre-infra \
  --query "properties.outputs.environmentId.value" -o tsv)
ENV_DOMAIN=$(az deployment group show -g <resource-group> -n zemfyre-infra \
  --query "properties.outputs.environmentDefaultDomain.value" -o tsv)
STORAGE_ACCOUNT=$(az deployment group show -g <resource-group> -n zemfyre-infra \
  --query "properties.outputs.storageAccountName.value" -o tsv)

# 3. influx, node-red, grafana on Container Apps
az deployment group create -g <resource-group> -n zemfyre-apps \
  --template-file azure/apps.bicep \
  --parameters location=<region> environmentId="$ENV_ID" \
    environmentDefaultDomain="$ENV_DOMAIN" revisionSuffix="$(date +%s)" \
    influxUsername=admin influxPassword=<...> influxToken=<...> \
    grafanaUsername=admin grafanaPassword=<...>

# 4. mosquitto on Azure Container Instances
az deployment group create -g <resource-group> -n zemfyre-mosquitto \
  --template-file azure/mosquitto.bicep \
  --parameters location=<region> storageAccountName="$STORAGE_ACCOUNT"
```

`environmentId` and similar `/subscriptions/...` values get mangled by Git
Bash on Windows into a local file path — prefix commands with
`MSYS_NO_PATHCONV=1` if you hit an `InvalidEnvironmentId`-style error.

### 4. Seed node-red's persistent storage

node-red mounts an **empty** Azure Files share on first boot, which is why
it starts with a blank flow rather than this repo's flows. Seed it once,
after step 3, from the repo root:

```bash
KEY=$(az storage account keys list -g <resource-group> -n $STORAGE_ACCOUNT \
  --query "[0].value" -o tsv)

az storage file upload-batch \
  --account-name $STORAGE_ACCOUNT --account-key $KEY \
  --destination nodered-data --source nodered/data
az storage file upload-batch \
  --account-name $STORAGE_ACCOUNT --account-key $KEY \
  --destination nodered-data/nodes --source nodered/nodes

az containerapp revision restart -g <resource-group> --name zemfyre-nodered \
  --revision $(az containerapp revision list -g <resource-group> -n zemfyre-nodered --query "[0].name" -o tsv)
```

Also update the MQTT broker node inside those flows to point at mosquitto's
new host (see below) instead of the old `mosquitto` compose hostname —
Container Apps and Container Instances don't share an internal DNS.

**Important**: this seeding step is deliberately a one-time manual action,
*not* part of the CI workflow. Once node-red is live, people will edit flows
through its editor UI — if CI re-uploaded `nodered/data/flows.json` from git
on every deploy, it would silently overwrite those live edits.

## Getting mosquitto's address

mosquitto runs as its own Azure Container Instance with its own public IP
(not shared with the Container Apps environment):

```bash
az deployment group show -g <resource-group> -n zemfyre-mosquitto \
  --query "properties.outputs" -o json
```

Point your sensor's MQTT client and node-red's MQTT broker node at that IP
(or FQDN) on port `1883` (or `9001` for websockets).

## Grafana login

If login appears to succeed but bounces back to the login page, it's almost
certainly a cookie/root_url mismatch — the image's baked-in `grafana.ini`
hardcodes a local-LAN domain and `cookie_samesite = none` with
`cookie_secure = false`, which modern browsers silently reject over HTTPS.
`apps.bicep` overrides this via `GF_SERVER_DOMAIN`, `GF_SERVER_ROOT_URL`, and
`GF_SECURITY_COOKIE_SECURE=true` env vars — do **not** also set
`GF_SERVER_PROTOCOL=https`, since Container Apps terminates TLS at the edge
and forwards plain HTTP internally; forcing Grafana's own listener into TLS
mode breaks it a different way (`Client sent an HTTP request to an HTTPS
server`).

## Day-to-day deploys

Pushing to `master` under `nodered/**` or `grafana/**` triggers the existing
build workflows, which push new `:latest-x86` images to Docker Hub; that
completion then triggers `.github/workflows/deploy-azure.yml`, which
redeploys the Container Apps with a fresh `revisionSuffix` so the new image
is actually picked up (Container Apps won't create a new revision on an
unchanged image string otherwise). The workflow also redeploys
`mosquitto.bicep` every run; since it always references `:latest` from
Docker Hub with no revision mechanism, ARM only actually restarts it when
something in the template changed.

## Known limitations of this setup

- **InfluxDB has no persistent storage** — see "Known gap" above. This is
  the main outstanding issue.
- **mosquitto, influxdb and node-red cannot scale to zero.** mosquitto and
  node-red hold live connections; influxdb must accept writes at any time.
  This is the majority of the monthly cost. If cost needs to go lower, the
  more "consumption-native" alternative is replacing mosquitto with Azure
  IoT Hub's free tier, at the cost of reworking device auth (SAS tokens
  instead of anonymous MQTT) and node-red's MQTT-in node config.
- **Single replica only** on every service. None of these (broker,
  single-writer flow engine, single-node influx) are safe to run as multiple
  concurrent replicas without extra work — acceptable for a prototype, not
  for production SLAs.
- Credentials are stored as Container Apps secrets (encrypted at rest, not
  exposed in `az containerapp show` output) and locally in
  `azure/.secrets/cloud.env` (gitignored). Rotate `INFLUXDB_TOKEN` and the
  admin passwords the same way you would locally.
