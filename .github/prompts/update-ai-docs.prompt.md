---
mode: agent
---

# Update or Generate AI Coding Agent Documentation

## Context
The project has comprehensive AI agent instructions in:
- `.github/copilot-instructions.md` - Quick reference for GitHub Copilot
- `docs/AI-AGENT-GUIDE.md` - Comprehensive architecture guide

## Task

Analyze the codebase and update AI agent documentation to reflect current patterns and workflows.

## Analysis Areas

### 1. Architecture Patterns
- Multi-architecture build system (TARGET_ARCH → DEVICE_TYPE → Docker tags)
- Template-based Docker Compose with envsubst
- Device agent as container orchestrator (Balena-style)
- Service communication patterns (container names vs localhost)

### 2. Critical Workflows
- Installation script flow (bin/install.sh)
- CI mode detection and non-interactive operation
- Ansible deployment patterns
- Docker image builds and multi-arch support

### 3. Development Patterns
- TypeScript build system
- Database migrations with Knex
- Job system for async operations
- Device API endpoints

### 4. Common Issues
- Architecture detection in CI
- Docker image tag mismatches
- Ansible Docker installation problems
- Service connectivity issues

## Documentation Structure

### Quick Reference (`.github/copilot-instructions.md`)
- 30-60 lines
- Essential patterns and commands
- Links to detailed documentation
- Quick troubleshooting tips

### Comprehensive Guide (`docs/AI-AGENT-GUIDE.md`)
- Architecture deep dives
- Detailed workflow explanations
- Code examples with file locations
- Common pitfalls with solutions
- Command reference

## Update Process

1. Search for existing docs: `**/{.github/copilot-instructions.md,docs/AI-AGENT-GUIDE.md,README.md}`
2. Analyze current codebase patterns
3. Review recent changes and workflows
4. Identify missing or outdated information
5. Update documentation intelligently
6. Preserve valuable existing content
7. Add specific examples from codebase

## Success Criteria
- Documentation reflects current architecture
- Includes specific file paths and line numbers
- Has actionable examples from the codebase
- Covers common development workflows
- Documents known issues and solutions
- Quick reference fits on one screen
- Comprehensive guide is well-organized and searchable
