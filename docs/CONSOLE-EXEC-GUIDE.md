# Container Console Execution - User Guide

## Overview

The console tab in the Service Details modal now supports **real command execution** in running containers via Docker exec. This replaces the previous mock/simulated implementation.

## Features

✅ **Real Docker Exec**: Executes commands directly in running containers  
✅ **Live Output**: Displays stdout/stderr from executed commands  
✅ **Exit Code Display**: Shows non-zero exit codes for failed commands  
✅ **Error Handling**: Clear error messages for containers not running or exec failures  
✅ **Command History**: Console maintains scrollable output history  

---

## How to Use

### 1. Access the Console

1. Navigate to **Applications** page
2. Click on any deployed service card
3. Click **Service Details** button
4. Switch to the **Console** tab

### 2. Check Container Status

Before executing commands, verify:
- Container has a valid **Container ID** (shown in Details tab)
- Status badge shows **"Running"** (green badge)

If the container is not running, the console will display an error message.

### 3. Execute Commands

Simply type a command in the input field and press:
- **Enter key**, or
- Click the **Execute** button

**Example Commands to Try:**

```bash
# View processes
ps aux

# List files
ls -la

# Check environment variables
env

# Show current directory
pwd

# Check disk usage
df -h

# View network configuration
ip addr

# Check installed packages (Alpine Linux)
apk list

# Check installed packages (Debian/Ubuntu)
dpkg -l

# View system info
uname -a

# Check running services
netstat -tulpn
```

---

## Command Parsing

Commands are **space-separated** and parsed into arrays automatically:

| Input | Parsed As |
|-------|-----------|
| `ls` | `["ls"]` |
| `ls -la` | `["ls", "-la"]` |
| `ps aux` | `["ps", "aux"]` |

**Note:** Complex commands with quotes or pipes may not parse correctly with the simple space-split method. For advanced use cases, consider using shell invocation:

```bash
sh -c "command with | pipes"
```

---

## Output Display

### Success Output
```
$ ls -la
total 12
drwxr-xr-x    3 root     root          4096 Oct  1 12:00 .
drwxr-xr-x    1 root     root          4096 Oct  1 12:00 ..
-rw-r--r--    1 root     root           220 Oct  1 12:00 .bashrc
```

### Error Output
```
$ invalid-command
sh: invalid-command: not found
[Exit code: 127]
```

### Container Not Running
```
Error: Container is not running (status: Exited)
```

---

## Backend API

### Endpoint
```
POST /api/v1/containers/:containerId/exec
```

### Request Body
```json
{
  "command": ["ls", "-la"]
}
```

### Response
```json
{
  "output": "total 12\ndrwxr-xr-x...",
  "exitCode": 0,
  "success": true
}
```

### Error Response
```json
{
  "error": "Container not running",
  "message": "Container abc123 is not running (state: exited)"
}
```

---

## Limitations

### Current Implementation
- ⚠️ **No interactive commands**: Commands like `vim`, `top`, or `htop` won't work properly
- ⚠️ **No stdin**: Cannot send input after command starts
- ⚠️ **Simple parsing**: Complex shell syntax may not parse correctly
- ⚠️ **No real-time streaming**: Output appears after command completes

### Not Supported
- Interactive shells (`bash`, `sh` without `-c`)
- Commands requiring user input (prompts)
- Long-running commands that stream output incrementally
- Terminal control codes (colors may appear as escape sequences)

---

## Troubleshooting

### "No container ID available"
**Problem**: Service doesn't have a container ID  
**Solution**: Ensure the service is deployed and running. Check the Details tab for Container ID field.

### "Container is not running"
**Problem**: Container is stopped or exited  
**Solution**: Start the service from the Actions menu (Restart Service button)

### "Failed to execute command"
**Problem**: Docker exec failed (permission, command not found, etc.)  
**Solution**: 
- Verify the command exists in the container (`which <command>`)
- Check container has required tools installed
- Review backend logs for detailed error messages

### Command hangs or doesn't return
**Problem**: Command is waiting for input or runs indefinitely  
**Solution**: 
- Avoid interactive commands
- Use timeout mechanisms (`timeout 5s <command>`)
- Refresh the page to reset

### Output looks corrupted
**Problem**: Terminal escape codes or binary output  
**Solution**: 
- Use text-only commands
- Pipe through `cat` or `strings` to strip control codes

---

## Security Considerations

⚠️ **WARNING**: Console exec grants significant access to containers!

### Current Security
- Commands run with **container's default user** (usually root)
- No command whitelisting or filtering
- No rate limiting on requests
- Full shell access to container filesystem

### Recommendations for Production
1. **Authentication**: Ensure admin panel is properly secured
2. **Audit Logging**: All commands should be logged with user context
3. **Command Whitelisting**: Restrict to safe, read-only commands
4. **Rate Limiting**: Prevent DoS via rapid exec calls
5. **User Context**: Run commands as non-root user where possible

---

## Future Enhancements

Potential improvements for advanced console functionality:

1. **WebSocket Terminal**: Full terminal emulation with `xterm.js`
2. **Interactive Shell**: Persistent shell sessions with stdin support
3. **Command History**: Arrow keys to navigate previous commands
4. **Auto-complete**: Suggest commands and paths
5. **File Browser**: Visual file explorer with download/upload
6. **Multi-line Editor**: Better input for complex commands
7. **Output Formatting**: Syntax highlighting for JSON, logs, etc.

---

## Testing Checklist

✅ Execute simple command (`ls`, `pwd`)  
✅ Execute command with arguments (`ls -la`)  
✅ Execute command that fails (`invalid-command`)  
✅ Try to execute when container is stopped  
✅ Execute command with output > 1KB  
✅ Clear console output  
✅ Execute multiple commands in sequence  
✅ Verify exit codes appear for non-zero exits  

---

## Implementation Details

### Files Modified

**Backend**:
- `application-manager/src/api/server.ts` - Added `/api/v1/containers/:containerId/exec` endpoint

**Frontend**:
- `admin/src/data/pages/applications.ts` - Added `executeContainerCommand()` API function
- `admin/src/pages/applications/ApplicationsPage.vue` - Updated `executeConsoleCommand()` to call real API

### Technology Stack
- **Docker API**: `dockerode` library for exec operations
- **Backend**: Express REST API with TypeScript
- **Frontend**: Vue 3 Composition API with async/await
- **Error Handling**: Try-catch blocks with user-friendly messages

---

## Example Session

```
$ ls
bin  etc  lib  usr  var

$ pwd
/app

$ ps aux
PID   USER     TIME  COMMAND
1     root     0:00  node server.js
15    root     0:00  ps aux

$ env | grep NODE
NODE_ENV=production
NODE_VERSION=18.17.0

$ df -h
Filesystem      Size  Used Avail Use% Mounted on
overlay         100G   15G   80G  16% /
```

---

## Support

For issues or questions:
- Check backend logs: `docker-compose logs -f application-manager`
- Check browser console for frontend errors
- Verify Docker socket is mounted: `/var/run/docker.sock`
- Ensure `USE_REAL_DOCKER=true` in application-manager

---

**Implementation Date**: October 4, 2025  
**Version**: 1.0 (Phase 1 - HTTP Exec)
