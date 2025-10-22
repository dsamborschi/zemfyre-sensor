---
mode: agent
---

# Fix Multi-Architecture Docker Build Issues

## Context
The Iotistic Sensor project supports multiple architectures: Raspberry Pi (ARMv6/7/64) and x86_64. Docker images are tagged by device type (pi3, pi4, x86) rather than generic architecture names.

## Common Issues

1. **Wrong architecture image being pulled**
   - Check `DEVICE_TYPE` environment variable is set correctly
   - Verify `TARGET_ARCH` flows through CI pipeline
   - Inspect `bin/install.sh::set_device_type()` function

2. **Manifest not found errors** (e.g., `manifest for iotistic/agent:latest-x86 not found`)
   - Ensure `DEVICE_TYPE` is passed to `upgrade_containers.sh`
   - Check `envsubst` is substituting variables in `docker-compose.yml.tmpl`
   - Verify Docker image tags match pattern: `iotistic/<service>:${DOCKER_TAG}-${DEVICE_TYPE}`

3. **CI builds wrong architecture**
   - Set `TARGET_ARCH` environment variable in GitHub Actions
   - Don't rely on `uname -m` in CI (always returns x86_64)
   - Map `TARGET_ARCH` to `DEVICE_TYPE` in `set_device_type()` function

## Task

Analyze the architecture detection and Docker image tagging flow:
1. Check how `TARGET_ARCH` is set in CI workflows
2. Verify `set_device_type()` function maps architectures correctly
3. Confirm `DEVICE_TYPE` is passed through to `upgrade_containers.sh`
4. Validate `envsubst` substitution in docker-compose template
5. Test that Docker pulls correct architecture-specific images

## Key Files
- `bin/install.sh` (lines ~51-58, ~245-300)
- `bin/upgrade_containers.sh` (lines ~15-70)
- `docker-compose.yml.tmpl`
- `.github/workflows/test-full-installation.yml`
- `.github/workflows/build-device-agent.yml`

## Success Criteria
- Correct DEVICE_TYPE determined for target architecture
- Docker images pulled with correct tags (latest-pi3, latest-pi4, latest-x86)
- CI builds and tests pass for all target architectures
- No "manifest not found" errors
