# Deploying the Zemfyre backend to Azure Container Apps

This deploys **mosquitto, node-red, influxdb, grafana** to Azure Container
Apps on the Consumption plan (pay-per-second, scale-to-zero where possible).
`api` and `admin` are intentionally not included — see the discussion in the
PR/chat history: `api`'s docker.sock-based container management and
`notify-send` calls don't work in a serverless container platform.

Estimated cost: **~$40–45/month** for a single-device prototype (mosquitto,
node-red and influxdb must stay warm to hold live connections/accept writes;
grafana scales to zero between dashboard views).

## Architecture

| Service | Ingress | Min replicas | Image source |
|---|---|---|---|
| mosquitto | TCP 1883 + 9001 (external) | 1 | Docker Hub `eclipse-mosquitto` |
| influxdb | internal only | 1 | Docker Hub `influxdb:alpine` |
| node-red | HTTP (external) | 1 | Docker Hub `iotistic/zemfyre-nodered:latest-x86` (this repo's own CI) |
| grafana | HTTP (external) | 0 | Docker Hub `iotistic/zemfyre-grafana:latest-x86` (this repo's own CI) |

No container registry is needed — every image is already public. If
`iotistic/zemfyre-nodered` or `iotistic/zemfyre-grafana` turn out to be
private repos, add a `registries` block with a Docker Hub username/password
secret to those two apps in `apps.bicep`.

## One-time setup

### 1. Create a service principal for GitHub Actions

```bash
az ad sp create-for-rbac \
  --name "zemfyre-github-deploy" \
  --role Contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<resource-group> \
  --sdk-auth
```

(If the resource group doesn't exist yet, scope to the subscription instead
and narrow it after first deploy.) Save the JSON output as the GitHub secret
`AZURE_CREDENTIALS`.

### 2. Set GitHub repository secrets and variables

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | JSON from step 1 |
| `AZURE_RESOURCE_GROUP` | e.g. `zemfyre-rg` |
| `INFLUXDB_PASSWORD` | InfluxDB admin password |
| `INFLUXDB_TOKEN` | InfluxDB admin API token (shared with node-red + grafana) |
| `GRAFANA_PASSWORD` | Grafana admin password |

**Variables** (same page, "Variables" tab — optional, have defaults):

| Name | Default |
|---|---|
| `AZURE_LOCATION` | `eastus` |
| `INFLUXDB_USERNAME` | `admin` |
| `GRAFANA_USERNAME` | `admin` |

### 3. Run the workflow once

Trigger `.github/workflows/deploy-azure.yml` manually (Actions tab → Deploy
Backend to Azure → Run workflow) the first time. This creates the storage
account + file shares + Container Apps Environment, then the 4 apps.

### 4. Seed persistent storage (required before mosquitto/node-red work)

Mosquitto and node-red both mount an **empty** Azure Files share on first
boot, which shadows anything baked into their images. Before either will
work correctly, copy this repo's existing local data onto the shares. Run
this once, after step 3, from the repo root:

```bash
STORAGE_ACCOUNT=$(az deployment group show -g <resource-group> -n zemfyre-infra \
  --query "properties.outputs.storageAccountName.value" -o tsv)
KEY=$(az storage account keys list -g <resource-group> -n $STORAGE_ACCOUNT \
  --query "[0].value" -o tsv)

# mosquitto.conf
az storage file upload \
  --account-name $STORAGE_ACCOUNT --account-key $KEY \
  --share-name mosquitto --source mosquitto/config/mosquitto.conf --path config/mosquitto.conf

# node-red flows/settings/custom nodes
az storage file upload-batch \
  --account-name $STORAGE_ACCOUNT --account-key $KEY \
  --destination nodered-data --source nodered/data
az storage file upload-batch \
  --account-name $STORAGE_ACCOUNT --account-key $KEY \
  --destination nodered-data/nodes --source nodered/nodes
```

Then restart the two apps so they pick up the newly-seeded files:

```bash
az containerapp revision restart -g <resource-group> --name zemfyre-mosquitto \
  --revision $(az containerapp revision list -g <resource-group> -n zemfyre-mosquitto --query "[0].name" -o tsv)
az containerapp revision restart -g <resource-group> --name zemfyre-nodered \
  --revision $(az containerapp revision list -g <resource-group> -n zemfyre-nodered --query "[0].name" -o tsv)
```

**Important**: this seeding step is deliberately a one-time manual action,
*not* part of the CI workflow. Once node-red is live, people will edit flows
through its editor UI — if CI re-uploaded `nodered/data/flows.json` from git
on every deploy, it would silently overwrite those live edits. If you want
git to stay the source of truth for flows, that's a deliberate choice to
revisit later (e.g. export flows back to git manually before each deploy).

## Getting the MQTT broker's public IP

Container Apps doesn't give each app its own IP — every app with external
ingress in one environment (including mosquitto's TCP ingress) shares **one
static IP at the environment level**:

```bash
az containerapp env show -n zemfyre-env -g <resource-group> \
  --query "properties.staticIp" -o tsv
```

Point your sensor's MQTT client at that IP on port `1883` (or `9001` for
websockets). The deploy workflow also prints this at the end of every run.

## Day-to-day deploys

Pushing to `master` under `nodered/**` or `grafana/**` triggers the existing
build workflows, which push new `:latest-x86` images to Docker Hub; that
completion then triggers `deploy-azure.yml`, which redeploys the Container
Apps with a fresh `revisionSuffix` so the new image is actually picked up
(Container Apps won't create a new revision on an unchanged image string
otherwise). Changes to `azure/**` also redeploy directly.

## Known limitations of this setup

- **mosquitto and node-red cannot scale to zero.** They hold live
  connections (broker sessions, MQTT subscription), so `minReplicas: 1` is
  required — this is the majority of the monthly cost. If cost needs to go
  lower, the more "consumption-native" alternative is replacing mosquitto
  with Azure IoT Hub's free tier, at the cost of reworking device auth
  (SAS tokens instead of anonymous MQTT) and node-red's MQTT-in node config.
- **Single replica only** on every app (`maxReplicas: 1`). None of these
  services (broker, single-writer flow engine, single-node influx) are safe
  to run as multiple concurrent replicas without extra work, so this isn't a
  high-availability deployment — acceptable for a prototype, not for
  production SLAs.
- InfluxDB and Grafana admin credentials are stored as Container Apps
  secrets (encrypted at rest, not exposed in `az containerapp show` output),
  sourced from GitHub Actions secrets. Rotate `INFLUXDB_TOKEN` and the admin
  passwords the same way you would locally.
