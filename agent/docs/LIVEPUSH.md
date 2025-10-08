# Livepush - Live Code Synchronization

Livepush enables **rapid development iteration** by syncing code changes to running containers in real-time, without rebuilding Docker images. Think of it as "hot reload" for containerized applications.

## Overview

When developing containerized applications, the traditional workflow is:ff
1. Change code
2. Rebuild Docker image
3. Stop container
4. Start new container
5. Test changes

With livepush, this becomes:
1. Change code
2. ✨ **Automatic sync** ✨
3. Test changes

## Installation

Livepush dependencies are already included in your `package.json`:

```json
{
  "dependencies": {
    "chokidar": "^3.5.3",
    "livepush": "^2.0.0"
  }
}
```

Install them:

```bash
npm install
```

## Usage

### Basic Usage

1. **Start your container** using the container-manager or docker directly:

```bash
# Using docker directly
docker run -d --name my-app -p 8080:80 nginx:alpine

# Or using container-manager API
curl -X POST http://localhost:3002/api/v1/apps \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 1001,
    "appName": "my-app",
    "services": [{
      "serviceId": 1,
      "serviceName": "web",
      "image": "nginx:alpine"
    }]
  }'
```

2. **Start livepush** to watch your source code:

```bash
npm run dev:livepush -- --container=my-app --dockerfile=./Dockerfile
```

3. **Make changes** to your source code - they will automatically sync to the running container!

### Command Line Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `--container` | ✅ Yes | Container ID or name to sync to | `--container=my-app` |
| `--dockerfile` | ✅ Yes | Path to Dockerfile (defines build context) | `--dockerfile=./Dockerfile` |
| `--source` | ❌ No | Source directory to watch (defaults to current dir) | `--source=./src` |

### Examples

#### Example 1: Sync to nginx container

```bash
# Start nginx container
docker run -d --name my-nginx -p 8085:80 nginx:alpine

# Start livepush
npm run dev:livepush -- --container=my-nginx --dockerfile=./examples/nginx/Dockerfile

# Now edit your HTML/CSS files - changes sync immediately!
```

#### Example 2: Sync to Node.js app

```bash
# Start your app via container-manager
curl -X POST http://localhost:3002/api/v1/apps \
  -H "Content-Type: application/json" \
  -d '{
    "appId": 2001,
    "appName": "node-app",
    "services": [{
      "serviceId": 1,
      "serviceName": "api",
      "image": "node:20-slim",
      "command": ["node", "server.js"]
    }]
  }'

# Find the container ID
docker ps | grep node-app

# Start livepush
npm run dev:livepush -- --container=<container-id> --dockerfile=./Dockerfile --source=./src
```

#### Example 3: Sync specific directory

```bash
# Only watch the src directory
npm run dev:livepush -- \
  --container=my-app \
  --dockerfile=./Dockerfile \
  --source=./src
```

## How It Works

1. **File Watching**: Uses [chokidar](https://github.com/paulmillr/chokidar) to watch your source directory for changes
2. **Change Detection**: Detects file additions, modifications, and deletions
3. **Debouncing**: Batches rapid changes (300ms window) to avoid excessive syncs
4. **Live Sync**: Uses [livepush library](https://www.npmjs.com/package/livepush) to copy changed files into the running container
5. **Dockerfile Context**: Respects your Dockerfile's COPY/ADD instructions to know what to sync

## Ignored Files

By default, livepush ignores:
- `node_modules/**` - Dependencies (too large, should be in image)
- `.git/**` - Git metadata
- `dist/**` - Build output
- `data/**` - Database files
- `*.log` - Log files

You can customize this by modifying `src/livepush.ts`.

## Features

### ✅ Real-time Sync
Changes appear in your container within seconds of saving a file.

### ✅ Smart Batching
Multiple rapid changes are batched together to avoid sync storms.

### ✅ Event Logging
See exactly what's being synced:

```
📝 File changed: src/app.ts
🚀 Syncing 1 changed and 0 deleted files...
  ⚙️  Executing: docker cp /path/to/src/app.ts container:/app/src/app.ts
  ✅ Command completed successfully
✅ Sync complete!
```

### ✅ Error Handling
Clear error messages if sync fails (permissions, container stopped, etc.)

### ✅ Graceful Shutdown
Press Ctrl+C to cleanly stop watching and cleanup.

## Limitations

### Not All Changes Can Be Live-Synced

Some changes **require container restart**:
- Dependency changes (package.json)
- Environment variable changes
- Port mappings
- Volume mounts
- Dockerfile changes

### Interpreted Languages Work Best

Livepush works great for:
- ✅ JavaScript/TypeScript (Node.js)
- ✅ Python
- ✅ PHP
- ✅ HTML/CSS
- ✅ Configuration files

Less ideal for:
- ⚠️ Compiled languages (Go, Rust, C++) - need rebuild
- ⚠️ Binary changes

### Container Must Be Running

Livepush requires an active container. If your container crashes, you'll need to restart it before livepush can work.

## Workflow Example

Here's a typical development workflow with livepush:

```bash
# Terminal 1: Start container-manager
cd standalone-application-manager
npm run dev

# Terminal 2: Deploy your app
curl -X POST http://localhost:3002/api/v1/apps \
  -H "Content-Type: application/json" \
  -d @my-app-config.json

# Get the container ID
docker ps

# Terminal 3: Start livepush
npm run dev:livepush -- --container=<container-id> --dockerfile=./Dockerfile

# Terminal 4: Edit your code
vim src/app.ts
# Save changes → automatically synced!

# Terminal 5: Test your changes
curl http://localhost:8080/api/test
```

## Troubleshooting

### Container not found

```
❌ Error: Container 'my-app' is not running or does not exist
```

**Solution**: 
- Check container is running: `docker ps`
- Use correct container ID or name
- Start your container first

### Permission denied

```
❌ Sync failed: EACCES: permission denied
```

**Solution**:
- Check file permissions in container
- Run container with appropriate user permissions
- Some containers (nginx) run as non-root user

### Sync not triggering

**Solution**:
- Check files are not in ignored list
- Verify source directory path is correct
- Check file actually changed (save in editor)

### Changes not reflected

**Solution**:
- Some apps cache code (restart app process inside container)
- Check if app is watching for changes (nodemon, etc.)
- For compiled code, livepush won't help - rebuild needed

## Comparison with Traditional Development

| Aspect | Traditional | With Livepush |
|--------|------------|---------------|
| Code change → Test | 30-60 seconds | 2-3 seconds |
| Rebuild required? | ✅ Yes | ❌ No |
| Container restart? | ✅ Yes | ❌ No |
| State preserved? | ❌ No | ✅ Yes |
| Works for all changes? | ✅ Yes | ⚠️ Most |

## When to Use Livepush

### ✅ Use livepush for:
- Rapid feature development
- Bug fixing and debugging
- UI/frontend iteration
- API endpoint development
- Configuration tweaking
- Local development on actual hardware (Raspberry Pi)

### ❌ Don't use livepush for:
- Production deployments
- Dependency updates
- Dockerfile changes
- Testing full build process
- CI/CD pipelines

## Integration with Container Manager

Livepush is **completely optional** and doesn't affect the container-manager's core functionality:

- Container-manager works normally without livepush
- Auto-reconciliation still works
- Metrics collection unaffected
- API endpoints unchanged
- Database persistence unchanged

Livepush is purely a **development convenience tool**.

## Advanced: Programmatic Usage

You can also use livepush programmatically in your own scripts:

```typescript
import { startLivepush } from './src/livepush';

async function myDevWorkflow() {
  const livepush = await startLivepush({
    containerId: 'my-container',
    dockerfile: './Dockerfile',
    sourceDir: './src',
  });

  // Do your development work...

  // Later, stop watching:
  await livepush.stop();
}
```

## Tips for Maximum Productivity

1. **Use with nodemon/auto-reload**: Combine livepush (syncs files) with nodemon (restarts process) for ultimate speed

2. **Multiple terminals**: Keep livepush running in a dedicated terminal window

3. **Container logs**: Watch container logs in another terminal: `docker logs -f <container>`

4. **Source maps**: Use TypeScript source maps for debugging synced code

5. **Volume mounts alternative**: For simple cases, Docker volume mounts (`-v`) can work, but livepush is smarter about what to sync

## Next Steps

- ✅ Start using livepush for your next feature development
- 📚 Check out [Livepush NPM package](https://www.npmjs.com/package/livepush) for advanced options
- 🔧 Customize ignored files in `src/livepush.ts`
- 🎯 Combine with container-manager's metrics API for performance monitoring during development

---

**Happy fast iterating! 🚀**
