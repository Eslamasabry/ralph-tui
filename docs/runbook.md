# Ralph TUI Runbook

Recovery procedures for Ralph TUI operations. This document provides step-by-step instructions for common recovery scenarios.

## Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| "Ralph already running" error | See [Stale Lock Cleanup](#stale-lock-cleanup) |
| Worktree errors | See [Prune Stale Worktrees](#prune-stale-worktrees) |
| Need to restore previous state | See [Restore from Snapshot](#restore-from-snapshot) |
| Lock file corruption | See [Lock File Recovery](#lock-file-recovery) |

---

## Stale Lock Cleanup

### Problem
Ralph reports "Ralph already running in this repo (PID: X)" but the process is not actually running.

### Detection
Ralph automatically detects stale locks when:
1. The PID in the lock file is not a running process
2. The lock is older than `staleLockTimeoutMinutes` (default: 30 minutes)

### Recovery Methods

#### Method 1: Automatic (Recommended)
Run any Ralph command in the repository:
```bash
ralph-tui status
```

Ralph will detect the stale lock and prompt:
```
⚠️  Stale lock detected

A previous Ralph session did not exit cleanly:
  PID:      <pid> (no longer running)
  Started:  <timestamp>
  Host:     <hostname>

Remove the stale lock and continue? [Y/n]
```
Press `Y` to automatically clean up.

#### Method 2: Non-Interactive
Use the `--force` flag to auto-clean in headless mode:
```bash
ralph-tui run --prd ./prd.json --force
```

Or set `nonInteractive: true` in config:
```toml
# .ralph-tui/config.toml
staleLockTimeoutMinutes = 30
```

#### Method 3: Manual Lock File Removal
If automatic methods fail, manually remove the lock file:
```bash
# View lock file contents first (for debugging)
cat .ralph-tui/ralph.lock

# Remove the lock file
rm .ralph-tui/ralph.lock

# Verify removal
ls -la .ralph-tui/ralph.lock  # Should show "No such file"
```

### Lock File Format
```
.ralph-tui/ralph.lock
{
  "pid": 12345,
  "sessionId": "ses_abc123...",
  "acquiredAt": "2026-01-24T10:00:00.000Z",
  "cwd": "/path/to/repo",
  "hostname": "machine-name"
}
```

### Related Configuration

| Config Option | Default | Description |
|---------------|---------|-------------|
| `staleLockTimeoutMinutes` | 30 | Minutes after which a lock is considered stale |
| (automatic check interval) | 60s | How often Ralph checks for stale locks |

---

## Prune Stale Worktrees

### Problem
Git worktree references accumulate for deleted worktrees, causing confusion in worktree listing.

### Detection
Check worktree health:
```bash
# List all worktrees
git worktree list

# Look for "prunable" entries
git worktree list --porcelain
```

### Recovery Methods

#### Method 1: Via TUI
1. Press `d` to show dashboard
2. Look for prune hint: `[X] Prune` indicator
3. Press `p` to trigger manual prune
4. Observe feedback message

#### Method 2: Via Cleanup Config
Enable automatic prune on completion:
```toml
# .ralph-tui/config.toml
[cleanup]
mode = "auto"
[cleanup.pruneWorktrees]
enabled = true
```

#### Method 3: Manual Git Command
```bash
# Prune stale worktree references
git worktree prune

# Verify cleanup
git worktree list --porcelain
```

### What Prune Does
- Removes worktree entries where the directory was manually deleted
- Cleans up git's internal tracking of worktrees
- Does NOT delete directories - only removes git references

### Related Configuration

| Config Option | Default | Description |
|---------------|---------|-------------|
| `cleanup.mode` | "manual" | When cleanup runs: "off", "auto", "manual" |
| `cleanup.pruneWorktrees.enabled` | false | Prune worktrees on cleanup |

---

## Restore from Snapshot

### Problem
Ralph crashed or was killed, and you need to recover the worktree state to resume.

### Detection
Snapshots are automatically created every 5 minutes (configurable) when backup is enabled.

Check for existing snapshots:
```bash
ls -la .ralph-tui/backups/
```

### Recovery Methods

#### Method 1: Via TUI (When Available)
1. Look for restore option in dashboard
2. Select the snapshot to restore
3. Confirm restoration

#### Method 2: Manual Restoration
```bash
# List available snapshots
ls -la .ralph-tui/backups/

# Choose the latest snapshot (or a specific one)
# Snapshot filename format: snapshot-YYYY-MM-DDTHH-MM-SS-mmmZ.json

# Restore worktrees from snapshot
# This requires the worktree manager - run Ralph to trigger restoration
ralph-tui run --prd ./prd.json
```

#### Method 3: Programmatic Restoration
```bash
# Using the snapshot CLI (if available)
ralph-tui restore --snapshot .ralph-tui/backups/snapshot-<timestamp>.json
```

### Snapshot Contents
Each snapshot contains:
```json
{
  "version": 1,
  "createdAt": "2026-01-24T10:05:00.000Z",
  "repoRoot": "/path/to/repo",
  "branch": "main",
  "commit": "abc123...",
  "worktrees": [
    {
      "relativePath": "worker-1",
      "path": "/path/to/repo/.git/worktrees/worker-1",
      "branch": "ralph/worker-1",
      "commit": "def456...",
      "locked": true,
      "lockReason": "Worker 1 task",
      "status": "locked"
    }
  ],
  "locks": [
    {
      "lockPath": "/path/to/repo/.ralph-tui/ralph.lock",
      "pid": 12345,
      "acquiredAt": "2026-01-24T10:00:00.000Z",
      "isStale": true
    }
  ]
}
```

### What Restore Does
1. Reads the snapshot metadata
2. Creates missing worktrees from snapshot
3. Re-locks worktrees that were locked
4. Does NOT delete existing worktrees

### Related Configuration

| Config Option | Default | Description |
|---------------|---------|-------------|
| `backup.enabled` | true | Enable periodic snapshots |
| `backup.intervalMinutes` | 5 | Snapshot frequency |
| `backup.maxSnapshots` | 10 | Maximum snapshots to keep |
| `backup.dir` | ".ralph-tui/backups" | Backup directory |

---

## Lock File Recovery

### Problem
Lock file is corrupted or in an invalid state.

### Symptoms
- "Error reading lock file" warnings
- Unable to acquire or release lock
- Invalid JSON errors

### Recovery Steps

1. **Backup the corrupted lock file:**
   ```bash
   cp .ralph-tui/ralph.lock .ralph-tui/ralph.lock.corrupted.$(date +%Y%m%d-%H%M%S)
   ```

2. **Remove the corrupted lock:**
   ```bash
   rm .ralph-tui/ralph.lock
   ```

3. **Verify removal:**
   ```bash
   cat .ralph-tui/ralph.lock
   # Should show: No such file or directory
   ```

4. **Start Ralph normally:**
   ```bash
   ralph-tui run --prd ./prd.json
   ```

### Manual Lock Acquisition (Emergency)
If you need to force acquire a lock for recovery:
```bash
# Remove existing lock
rm .ralph-tui/ralph.lock

# Create a new lock manually (JSON must be valid)
cat > .ralph-tui/ralph.lock << 'EOF'
{
  "pid": 99999,
  "sessionId": "emergency-recovery",
  "acquiredAt": "$(date -Iseconds)",
  "cwd": "$(pwd)",
  "hostname": "$(hostname)"
}
EOF
```

---

## Complete Recovery Workflow

When Ralph crashes and you need full recovery:

### Step 1: Assess State
```bash
# Check lock status
cat .ralph-tui/ralph.lock 2>/dev/null || echo "No lock file"

# List worktrees
git worktree list --porcelain

# Check for snapshots
ls -la .ralph-tui/backups/

# Check git status
git status
```

### Step 2: Clean Stale Locks
```bash
# Option A: Let Ralph handle it
ralph-tui status

# Option B: Manual removal
rm -f .ralph-tui/ralph.lock
```

### Step 3: Prune Worktrees
```bash
git worktree prune
```

### Step 4: Restore from Snapshot (if needed)
```bash
# Choose latest snapshot
LATEST=$(ls -t .ralph-tui/backups/snapshot-*.json | head -1)
echo "Restoring from: $LATEST"

# Start Ralph - it will attempt restoration
ralph-tui run --prd ./prd.json
```

### Step 5: Verify Recovery
```bash
# Check lock is acquired
cat .ralph-tui/ralph.lock

# Verify worktrees
git worktree list

# Check for active Ralph process
ps aux | grep ralph-tui
```

---

## Configuration Reference

### Full Configuration Example
```toml
# .ralph-tui/config.toml

# Session lock settings
staleLockTimeoutMinutes = 30

# Backup/snapshot settings
[backup]
enabled = true
intervalMinutes = 5
maxSnapshots = 10
dir = ".ralph-tui/backups"

# Cleanup settings
[cleanup]
mode = "auto"  # "off", "auto", "manual"

[cleanup.pruneWorktrees]
enabled = true

[cleanup.syncMain]
enabled = true

[cleanup.deleteBranches]
enabled = false

[cleanup.push]
enabled = false
```

### Configuration Precedence
1. CLI arguments (highest)
2. Project config: `.ralph-tui/config.toml`
3. Global config: `~/.config/ralph-tui/config.toml`
4. Default values (lowest)

---

## Emergency Commands Reference

| Command | Purpose |
|---------|---------|
| `rm .ralph-tui/ralph.lock` | Remove lock file |
| `git worktree prune` | Clean worktree references |
| `git worktree list` | List all worktrees |
| `git worktree remove <path>` | Remove specific worktree |
| `ralph-tui config show` | View current configuration |
| `ralph-tui run --force` | Force run, ignore locks |
| `bun run build` | Rebuild after config changes |

---

## Log Files

| Log | Location | Purpose |
|-----|----------|---------|
| Session lock | `.ralph-tui/ralph.lock` | Single instance control |
| Backups | `.ralph-tui/backups/` | Snapshot storage |
| Audit (remote) | `~/.config/ralph-tui/audit.log` | Remote actions |
| Iteration logs | `.ralph-tui/logs/` | Per-task execution logs |

---

## Getting Help

- **Documentation**: https://ralph-tui.com/docs/
- **Issues**: https://github.com/subsy/ralph-tui/issues
- **CLI Help**: `ralph-tui --help`
- **Run Help**: `ralph-tui run --help`
