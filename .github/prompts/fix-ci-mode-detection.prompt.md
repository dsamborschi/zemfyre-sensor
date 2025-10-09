---
mode: agent
---

# Fix CI Mode Detection and Interactive Prompts

## Context
The install.sh script runs in both CI (GitHub Actions) and on real hardware. Interactive prompts using `gum` fail in CI with errors like "'unknown'" because CI environments don't support TTY interaction.

## Common Issues

1. **gum commands fail in CI**
   - `gum format`, `gum confirm`, `gum input` require TTY
   - CI mode should skip interactive prompts and use defaults
   - Script should detect CI environment early

2. **Reboot prompts block CI**
   - CI can't handle interactive reboot confirmation
   - Should skip reboot in CI mode

3. **Branch detection fails on non-master/main**
   - Custom version prompts cause issues in CI
   - Should use branch argument directly in CI

## Solution Pattern

### 1. Early CI Detection
```bash
IS_CI_MODE=false
if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    IS_CI_MODE=true
fi
```

### 2. Wrapper Function for gum
```bash
function gum() {
    if [ "$IS_CI_MODE" = true ]; then
        case "$1" in
            format|style) shift; echo "$@" | sed 's/\*\*//g' | sed 's/`//g' ;;
            confirm) return 1 ;;  # Auto-decline in CI
            input) echo "$2" ;;   # Use default value
            *) shift; echo "$@" ;;
        esac
    else
        command gum "$@"
    fi
}
```

### 3. Skip Reboot in CI
```bash
if [ "${CI:-false}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "CI Mode - Skipping reboot"
else
    gum confirm "Do you want to reboot now?" && sudo reboot
fi
```

## Task

Fix CI mode detection and interactive prompts:
1. Add IS_CI_MODE detection at top of install.sh
2. Create gum wrapper function to handle CI mode
3. Skip gum installation in CI (only install jq)
4. Skip reboot confirmation in CI
5. Use default values for all interactive prompts in CI
6. Fix main() to accept arguments properly: `main "$@"`
7. Test in GitHub Actions workflow

## Key Files
- `bin/install.sh` (top section, gum usage throughout)
- `.github/workflows/test-full-installation.yml`

## Success Criteria
- install.sh runs successfully in GitHub Actions CI
- No "'unknown'" errors from gum
- No interactive prompts block CI
- Script uses default values in CI mode
- Reboot is skipped in CI
- All CI tests pass
