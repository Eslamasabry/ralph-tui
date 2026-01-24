# Worktree Management Production Plan - Detailed
Generated: 2026-01-24
Scope: Production readiness for worktree lifecycle, locking, UI, and recovery.
Target: At least 2000 lines with exhaustive operational detail.
Audience: Maintainers, operators, and release engineers.
Style: One action per line, explicit preconditions and recovery paths.

## Conventions
Each step is encoded as S001..S200.
Each step has exactly 10 lines: Title, Preconditions, Inputs, Actions, Outputs, Logs, Metrics, Failures, Recovery, Tests.
Use these steps as a checklist during implementation and verification.
All lines are ASCII-only for portability.

## Scope and Assumptions
Assume git worktrees are the isolation mechanism.
Assume parallel workers are coordinated by a central scheduler.
Assume worktree health is reported in TUI and logs.
Assume cleanup should never block shutdown.
Assume stale lock detection is configurable and periodic.

## Detailed Execution Plan
S001 Title: Resolve runtime configuration from CLI and stored config.
S001 Preconditions: Working directory exists and is readable.
S001 Inputs: CLI args, stored config, defaults.
S001 Actions: Parse args, load config, merge with precedence.
S001 Outputs: RalphConfig with resolved fields.
S001 Logs: Record config source selection at debug.
S001 Metrics: config.build.count increment.
S001 Failures: Parse error or invalid config values.
S001 Recovery: Print error and exit with nonzero status.
S001 Tests: Unit test config precedence matrix.
S002 Title: Validate config schema before engine initialization.
S002 Preconditions: RalphConfig built.
S002 Inputs: RalphConfig.
S002 Actions: Validate against schema and runtime rules.
S002 Outputs: Validation result with errors and warnings.
S002 Logs: Log warnings with config key paths.
S002 Metrics: config.validation.failures count.
S002 Failures: Schema violation or missing required fields.
S002 Recovery: Abort run and show actionable messages.
S002 Tests: Negative tests for each invalid config case.
S003 Title: Resolve repo root and verify git availability.
S003 Preconditions: cwd exists.
S003 Inputs: cwd path.
S003 Actions: Run git rev-parse and check exit code.
S003 Outputs: repoRoot path or error.
S003 Logs: Log repoRoot on success.
S003 Metrics: repo.detect.success count.
S003 Failures: git missing or not a repo.
S003 Recovery: Show error with expected commands.
S003 Tests: Integration test with temp repo.
S004 Title: Determine worktrees directory location.
S004 Preconditions: repoRoot resolved.
S004 Inputs: repoRoot and config override.
S004 Actions: Compute worktrees directory path.
S004 Outputs: worktreesDir absolute path.
S004 Logs: Log worktreesDir at debug.
S004 Metrics: worktree.dir.set count.
S004 Failures: Invalid path or permission denied.
S004 Recovery: Prompt user to fix permissions.
S004 Tests: Unit test for override and default paths.
S005 Title: Ensure worktrees directory exists.
S005 Preconditions: worktreesDir computed.
S005 Inputs: worktreesDir path.
S005 Actions: Create directory if missing.
S005 Outputs: Directory ready for use.
S005 Logs: Log created or existing state.
S005 Metrics: worktree.dir.created count.
S005 Failures: mkdir error or permission denied.
S005 Recovery: Abort with actionable path info.
S005 Tests: Integration test with read-only path.
S006 Title: Load persisted session state if present.
S006 Preconditions: repoRoot resolved.
S006 Inputs: session file path.
S006 Actions: Read and parse persisted session.
S006 Outputs: Persisted session state or null.
S006 Logs: Log session id if loaded.
S006 Metrics: session.load.success count.
S006 Failures: Parse error or missing file.
S006 Recovery: Continue with new session.
S006 Tests: Unit test for corrupted session file.
S007 Title: Initialize tracker and load tasks.
S007 Preconditions: Config validated.
S007 Inputs: tracker config and credentials.
S007 Actions: Instantiate tracker, fetch tasks.
S007 Outputs: Task list and tracker metadata.
S007 Logs: Log tracker id and task count.
S007 Metrics: tracker.fetch.count, tracker.fetch.latency.
S007 Failures: Network or auth errors.
S007 Recovery: Retry with backoff and show instructions.
S007 Tests: Integration test with mock tracker.
S008 Title: Initialize agent registry and resolve agent plugin.
S008 Preconditions: Config validated.
S008 Inputs: agent plugin name.
S008 Actions: Register plugins and resolve agent.
S008 Outputs: Agent plugin instance.
S008 Logs: Log agent plugin selection.
S008 Metrics: agent.load.count.
S008 Failures: Missing plugin.
S008 Recovery: Show available agents and exit.
S008 Tests: Unit tests for registry selection.
S009 Title: Initialize engine controller and event listeners.
S009 Preconditions: Agent and tracker ready.
S009 Inputs: config, agent, tracker.
S009 Actions: Construct engine and subscribe to events.
S009 Outputs: EngineController instance.
S009 Logs: Log engine initialization.
S009 Metrics: engine.init.duration.
S009 Failures: Engine initialization error.
S009 Recovery: Abort with error trace.
S009 Tests: Unit test engine init and event subscription.
S010 Title: Initialize TUI renderer if interactive.
S010 Preconditions: showTui true.
S010 Inputs: renderer options.
S010 Actions: createCliRenderer and createRoot.
S010 Outputs: renderer and root.
S010 Logs: Log TUI initialization.
S010 Metrics: tui.init.duration.
S010 Failures: Renderer initialization failure.
S010 Recovery: Fall back to headless mode.
S010 Tests: Integration test of renderer creation.
S011 Title: Set up structured logging for headless mode.
S011 Preconditions: showTui false.
S011 Inputs: log config.
S011 Actions: initialize structured logger.
S011 Outputs: logger instance.
S011 Logs: Log logger readiness.
S011 Metrics: logger.init.count.
S011 Failures: Logger IO failure.
S011 Recovery: Continue with console logging.
S011 Tests: Unit test logger formatting.
S012 Title: Initialize notification configuration.
S012 Preconditions: Config validated.
S012 Inputs: notification config.
S012 Actions: resolve notifications enabled and sound mode.
S012 Outputs: notification options.
S012 Logs: Log resolved options.
S012 Metrics: notifications.configured count.
S012 Failures: invalid config values.
S012 Recovery: default to notifications disabled.
S012 Tests: Unit tests for config parsing.
S013 Title: Prepare output directories.
S013 Preconditions: Config validated.
S013 Inputs: outputDir path.
S013 Actions: create directory and verify write access.
S013 Outputs: outputDir ready.
S013 Logs: Log outputDir path.
S013 Metrics: outputdir.ready count.
S013 Failures: permission errors.
S013 Recovery: show error and exit.
S013 Tests: integration tests with temp dir.
S014 Title: Start engine in ready state for TUI.
S014 Preconditions: TUI initialized.
S014 Inputs: initial tasks and callbacks.
S014 Actions: render RunApp with ready state.
S014 Outputs: TUI shows ready status.
S014 Logs: Log ready state.
S014 Metrics: tui.ready.count.
S014 Failures: render error.
S014 Recovery: terminate and show error.
S014 Tests: TUI snapshot test for ready state.
S015 Title: Preflight workspace cleanliness for auto-commit.
S015 Preconditions: autoCommit true.
S015 Inputs: git status.
S015 Actions: detect uncommitted changes.
S015 Outputs: decision to continue or warn.
S015 Logs: warn if dirty.
S015 Metrics: git.dirty.count.
S015 Failures: git status command failure.
S015 Recovery: continue without auto-commit.
S015 Tests: integration tests with dirty repo.
S016 Title: Initialize worktree manager instance.
S016 Preconditions: repoRoot resolved.
S016 Inputs: repoRoot and worktreesDir.
S016 Actions: construct WorktreeManager.
S016 Outputs: worktree manager instance.
S016 Logs: log manager config.
S016 Metrics: worktree.manager.init count.
S016 Failures: invalid repoRoot.
S016 Recovery: abort with error.
S016 Tests: unit tests for constructor.
S017 Title: Seed worktree health summary for UI.
S017 Preconditions: TUI initialized.
S017 Inputs: worktree manager.
S017 Actions: fetch health summary and set state.
S017 Outputs: initial health state.
S017 Logs: log health summary at debug.
S017 Metrics: worktree.health.fetch.count.
S017 Failures: list worktrees error.
S017 Recovery: default health counts to zero.
S017 Tests: unit tests with mocked manager.
S018 Title: Schedule periodic health refresh.
S018 Preconditions: TUI running.
S018 Inputs: refresh interval.
S018 Actions: setInterval refreshWorktreeHealth.
S018 Outputs: periodic UI updates.
S018 Logs: log refresh failures only.
S018 Metrics: worktree.health.refresh.count.
S018 Failures: refresh exceptions.
S018 Recovery: swallow and continue.
S018 Tests: unit test timer cleanup on unmount.
S019 Title: Configure parallel worker pool size.
S019 Preconditions: config loaded.
S019 Inputs: maxParallel.
S019 Actions: initialize pool with size.
S019 Outputs: worker pool ready.
S019 Logs: log pool size.
S019 Metrics: worker.pool.size.
S019 Failures: invalid size.
S019 Recovery: default to safe value.
S019 Tests: unit test pool size constraints.
S020 Title: Initialize activity event buffer.
S020 Preconditions: TUI running.
S020 Inputs: buffer size config.
S020 Actions: create event buffer and flush timer.
S020 Outputs: activity stream ready.
S020 Logs: log buffer settings.
S020 Metrics: activity.buffer.size.
S020 Failures: timer creation failure.
S020 Recovery: disable activity stream.
S020 Tests: unit test event buffering.
S021 Title: Acquire session lock before run.
S021 Preconditions: repoRoot resolved.
S021 Inputs: sessionId and lock options.
S021 Actions: call acquireLockWithPrompt.
S021 Outputs: lock acquired or error.
S021 Logs: log lock acquisition.
S021 Metrics: lock.acquire.count.
S021 Failures: lock held by live process.
S021 Recovery: show error and exit or force.
S021 Tests: integration test lock contention.
S022 Title: Initialize lock cleanup handlers.
S022 Preconditions: lock acquired.
S022 Inputs: repoRoot and stale timeout.
S022 Actions: registerLockCleanupHandlers with interval.
S022 Outputs: cleanup handler function.
S022 Logs: log handler registration.
S022 Metrics: lock.cleanup.registered.
S022 Failures: interval setup error.
S022 Recovery: log error and continue.
S022 Tests: unit test cleanup handler removal.
S023 Title: Start periodic stale lock check.
S023 Preconditions: lock cleanup handlers active.
S023 Inputs: timeout minutes.
S023 Actions: startPeriodicStaleLockCheck.
S023 Outputs: interval id.
S023 Logs: log stale lock cleanup events.
S023 Metrics: lock.stale.cleaned.
S023 Failures: check errors.
S023 Recovery: continue with next interval.
S023 Tests: unit test stale lock check.
S024 Title: Ensure lock file includes timestamp.
S024 Preconditions: lock created.
S024 Inputs: process id and session id.
S024 Actions: write lock file with acquiredAt.
S024 Outputs: lock file content.
S024 Logs: log lock file path.
S024 Metrics: lock.file.created.
S024 Failures: write failure.
S024 Recovery: abort with error.
S024 Tests: unit test lock file schema.
S025 Title: Clean stale lock on startup if process dead.
S025 Preconditions: existing lock file present.
S025 Inputs: lock file content.
S025 Actions: check process and lock age.
S025 Outputs: lock removed or kept.
S025 Logs: log stale lock removal.
S025 Metrics: lock.stale.detected.
S025 Failures: unable to read lock.
S025 Recovery: prompt user to remove.
S025 Tests: integration test stale lock removal.
S026 Title: Handle lock override with --force.
S026 Preconditions: lock exists and process running.
S026 Inputs: force flag.
S026 Actions: override lock and warn user.
S026 Outputs: lock acquired.
S026 Logs: log forced acquisition.
S026 Metrics: lock.force.count.
S026 Failures: unable to delete lock.
S026 Recovery: instruct manual cleanup.
S026 Tests: unit test force path.
S027 Title: Release lock on graceful exit.
S027 Preconditions: engine stopped.
S027 Inputs: repoRoot.
S027 Actions: delete lock file.
S027 Outputs: lock removed.
S027 Logs: log lock release.
S027 Metrics: lock.release.count.
S027 Failures: delete error.
S027 Recovery: log warning and continue.
S027 Tests: integration test release path.
S028 Title: Release lock on SIGTERM.
S028 Preconditions: signal received.
S028 Inputs: repoRoot.
S028 Actions: call cleanup handler.
S028 Outputs: lock removed.
S028 Logs: log termination cleanup.
S028 Metrics: lock.release.sigterm.
S028 Failures: delete error.
S028 Recovery: log warning.
S028 Tests: integration test SIGTERM.
S029 Title: Release lock on uncaught exception.
S029 Preconditions: exception thrown.
S029 Inputs: error object.
S029 Actions: call cleanup handler.
S029 Outputs: lock removed.
S029 Logs: log exception cleanup.
S029 Metrics: lock.release.exception.
S029 Failures: delete error.
S029 Recovery: log warning.
S029 Tests: chaos test with thrown error.
S030 Title: Stop stale lock check on shutdown.
S030 Preconditions: cleanup handler invoked.
S030 Inputs: stop function.
S030 Actions: clear interval.
S030 Outputs: no further stale lock checks.
S030 Logs: log stop.
S030 Metrics: lock.stale.stop.count.
S030 Failures: clear interval error.
S030 Recovery: ignore.
S030 Tests: unit test cleanup handler.
S031 Title: Validate lock file schema during read.
S031 Preconditions: lock file exists.
S031 Inputs: lock file contents.
S031 Actions: parse and validate fields.
S031 Outputs: lock object or error.
S031 Logs: log malformed lock.
S031 Metrics: lock.schema.invalid.
S031 Failures: parse error.
S031 Recovery: treat as stale and delete.
S031 Tests: unit test malformed lock.
S032 Title: Ensure lock file is unique per repo.
S032 Preconditions: repoRoot resolved.
S032 Inputs: lock path logic.
S032 Actions: compute lock path with repoRoot.
S032 Outputs: lock path.
S032 Logs: log lock path.
S032 Metrics: lock.path.count.
S032 Failures: invalid path.
S032 Recovery: abort.
S032 Tests: unit test path computation.
S033 Title: Record lock reason for worktree locks.
S033 Preconditions: lock worktree requested.
S033 Inputs: lockReason.
S033 Actions: git worktree lock with reason.
S033 Outputs: locked worktree.
S033 Logs: log lock reason.
S033 Metrics: worktree.lock.reason.count.
S033 Failures: git lock error.
S033 Recovery: retry with cleanup.
S033 Tests: integration test lock reason.
S034 Title: Validate lock reason format.
S034 Preconditions: lockReason provided.
S034 Inputs: string reason.
S034 Actions: sanitize and trim.
S034 Outputs: safe reason.
S034 Logs: log sanitized reason.
S034 Metrics: lock.reason.sanitized.
S034 Failures: empty reason.
S034 Recovery: default to worker id.
S034 Tests: unit tests for sanitization.
S035 Title: Prevent double lock registration.
S035 Preconditions: lock already registered.
S035 Inputs: cleanup handler.
S035 Actions: avoid duplicate registration.
S035 Outputs: single handler active.
S035 Logs: log duplicate attempt.
S035 Metrics: lock.cleanup.duplicate.
S035 Failures: none.
S035 Recovery: no-op.
S035 Tests: unit test multiple registration.
S036 Title: Handle lock cleanup in headless mode.
S036 Preconditions: headless run.
S036 Inputs: cleanup handler.
S036 Actions: register and ensure exit path uses it.
S036 Outputs: lock cleanup on exit.
S036 Logs: log headless cleanup.
S036 Metrics: lock.cleanup.headless.
S036 Failures: none.
S036 Recovery: no-op.
S036 Tests: headless integration test.
S037 Title: Handle lock cleanup in TUI mode.
S037 Preconditions: TUI run.
S037 Inputs: cleanup handler.
S037 Actions: register and use on quit.
S037 Outputs: lock cleanup on quit.
S037 Logs: log TUI cleanup.
S037 Metrics: lock.cleanup.tui.
S037 Failures: none.
S037 Recovery: no-op.
S037 Tests: TUI integration test.
S038 Title: Persist lock cleanup events to log.
S038 Preconditions: log system available.
S038 Inputs: cleanup result.
S038 Actions: emit structured log entry.
S038 Outputs: log entry.
S038 Logs: record lock cleanup status.
S038 Metrics: lock.cleanup.log.count.
S038 Failures: logger IO error.
S038 Recovery: fallback to console.warn.
S038 Tests: unit test log format.
S039 Title: Ensure lock cleanup does not block exit.
S039 Preconditions: shutdown initiated.
S039 Inputs: cleanup function.
S039 Actions: call cleanup with try/catch.
S039 Outputs: exit proceeds regardless.
S039 Logs: log failure but continue.
S039 Metrics: lock.cleanup.failure.
S039 Failures: cleanup errors.
S039 Recovery: ignore and continue.
S039 Tests: simulate cleanup failure.
S040 Title: Update lock cleanup handler API docs.
S040 Preconditions: code updated.
S040 Inputs: documentation.
S040 Actions: add docs for new parameter.
S040 Outputs: updated docs.
S040 Logs: none.
S040 Metrics: docs.update.count.
S040 Failures: none.
S040 Recovery: none.
S040 Tests: doc lint if present.
S041 Title: Clean stale worktrees before new creation.
S041 Preconditions: worktree manager ready.
S041 Inputs: worker ids.
S041 Actions: cleanupWorktree per worker.
S041 Outputs: clean paths.
S041 Logs: log cleanup results.
S041 Metrics: worktree.cleanup.pre.count.
S041 Failures: cleanup errors.
S041 Recovery: continue with retries.
S041 Tests: integration test cleanup.
S042 Title: Detect existing worktree path conflicts.
S042 Preconditions: worktree path computed.
S042 Inputs: worktree path.
S042 Actions: check for existing path.
S042 Outputs: conflict flag.
S042 Logs: log conflict details.
S042 Metrics: worktree.path.conflict.
S042 Failures: stat error.
S042 Recovery: treat as conflict and clean.
S042 Tests: unit test path conflict.
S043 Title: Remove stale worktree references from git.
S043 Preconditions: stale path detected.
S043 Inputs: worktree path.
S043 Actions: git worktree remove --force.
S043 Outputs: removed entry.
S043 Logs: log force removal.
S043 Metrics: worktree.remove.force.
S043 Failures: git error.
S043 Recovery: attempt prune.
S043 Tests: integration test stale entry removal.
S044 Title: Prune worktrees via git when needed.
S044 Preconditions: cleanup request.
S044 Inputs: repoRoot.
S044 Actions: git worktree prune.
S044 Outputs: pruned list.
S044 Logs: log prune result.
S044 Metrics: worktree.prune.count.
S044 Failures: git error.
S044 Recovery: log and continue.
S044 Tests: integration test prune.
S045 Title: Detect and handle prunable entries.
S045 Preconditions: listWorktrees output.
S045 Inputs: prunable flag.
S045 Actions: mark status prunable.
S045 Outputs: health summary includes prunable.
S045 Logs: log prunable count.
S045 Metrics: worktree.prunable.count.
S045 Failures: parsing error.
S045 Recovery: default to non-prunable.
S045 Tests: unit test porcelain parsing.
S046 Title: Ensure worktree list parsing is robust.
S046 Preconditions: git output available.
S046 Inputs: porcelain output.
S046 Actions: parse line by line with guards.
S046 Outputs: WorktreeStatus list.
S046 Logs: log malformed lines.
S046 Metrics: worktree.parse.error.
S046 Failures: unexpected format.
S046 Recovery: skip malformed entries.
S046 Tests: unit test malformed output.
S047 Title: Exclude main repo from health summary.
S047 Preconditions: WorktreeStatus list.
S047 Inputs: relativePath.
S047 Actions: filter relativePath == '.'.
S047 Outputs: filtered list.
S047 Logs: log excluded count.
S047 Metrics: worktree.health.filtered.
S047 Failures: missing relativePath.
S047 Recovery: derive relativePath.
S047 Tests: unit test filter.
S048 Title: Guarantee worktree status is computed with access check.
S048 Preconditions: WorktreeStatus partial.
S048 Inputs: path.
S048 Actions: access path to determine stale.
S048 Outputs: status active or stale.
S048 Logs: log access failures.
S048 Metrics: worktree.access.fail.
S048 Failures: access error.
S048 Recovery: mark stale.
S048 Tests: unit test with missing path.
S049 Title: Mark locked status based on porcelain data.
S049 Preconditions: locked flag in data.
S049 Inputs: lock reason string.
S049 Actions: set locked and lockReason.
S049 Outputs: locked status.
S049 Logs: log lock reason if present.
S049 Metrics: worktree.locked.count.
S049 Failures: missing lock reason.
S049 Recovery: leave reason undefined.
S049 Tests: unit test lock parsing.
S050 Title: Compute worktree health summary counts.
S050 Preconditions: WorktreeStatus list.
S050 Inputs: statuses.
S050 Actions: count by status type.
S050 Outputs: WorktreeHealthSummary.
S050 Logs: log summary snapshot.
S050 Metrics: worktree.health.summary.
S050 Failures: none.
S050 Recovery: default counts to zero on error.
S050 Tests: unit test summary counts.
S051 Title: Ensure cleanupWorktree is idempotent.
S051 Preconditions: workerId known.
S051 Inputs: worktreePath.
S051 Actions: remove path and references if present.
S051 Outputs: cleaned state regardless of prior state.
S051 Logs: log cleanup attempt.
S051 Metrics: worktree.cleanup.idempotent.
S051 Failures: git errors.
S051 Recovery: log and continue.
S051 Tests: repeated cleanup test.
S052 Title: Enforce consistent worktree path naming.
S052 Preconditions: workerId known.
S052 Inputs: workerId.
S052 Actions: compute worktree path.
S052 Outputs: canonical worktree path.
S052 Logs: log path.
S052 Metrics: worktree.path.computed.
S052 Failures: invalid workerId.
S052 Recovery: sanitize workerId.
S052 Tests: unit test naming scheme.
S053 Title: Ensure baseRef resolution before creation.
S053 Preconditions: baseRef provided.
S053 Inputs: baseRef.
S053 Actions: resolveRef(baseRef) to commit hash.
S053 Outputs: expectedCommit string.
S053 Logs: log resolved commit.
S053 Metrics: worktree.base.resolve.
S053 Failures: invalid ref.
S053 Recovery: abort worktree creation.
S053 Tests: unit test invalid ref.
S054 Title: Ensure branch existence detection.
S054 Preconditions: branchName provided.
S054 Inputs: branchName.
S054 Actions: check git rev-parse --verify.
S054 Outputs: branchExists boolean.
S054 Logs: log branchExists.
S054 Metrics: worktree.branch.exists.
S054 Failures: git error.
S054 Recovery: treat as not exists.
S054 Tests: unit test branchExists.
S055 Title: Create worktrees in parallel with bounded concurrency.
S055 Preconditions: options list built.
S055 Inputs: list of worktree options.
S055 Actions: Promise.all with concurrency guard if needed.
S055 Outputs: Map workerId -> path.
S055 Logs: log per-worktree creation.
S055 Metrics: worktree.create.batch.count.
S055 Failures: any creation failure.
S055 Recovery: fail batch with error context.
S055 Tests: concurrency test with multiple workers.
S056 Title: Use branch reuse when branch exists.
S056 Preconditions: branchExists true.
S056 Inputs: branchName.
S056 Actions: git worktree add path branch.
S056 Outputs: worktree on existing branch.
S056 Logs: log branch reuse.
S056 Metrics: worktree.branch.reuse.
S056 Failures: git add error.
S056 Recovery: retry with force.
S056 Tests: integration test for reuse.
S057 Title: Create new branch when missing.
S057 Preconditions: branchExists false.
S057 Inputs: baseRef, branchName.
S057 Actions: git worktree add -b branch baseRef.
S057 Outputs: worktree on new branch.
S057 Logs: log branch creation.
S057 Metrics: worktree.branch.create.
S057 Failures: git add error.
S057 Recovery: retry with force.
S057 Tests: integration test for branch creation.
S058 Title: Retry worktree add on failure.
S058 Preconditions: initial add failed.
S058 Inputs: worktreePath.
S058 Actions: cleanupWorktree then add with -f.
S058 Outputs: worktree or error.
S058 Logs: log retry attempt.
S058 Metrics: worktree.create.retry.
S058 Failures: retry fails.
S058 Recovery: force cleanup and retry.
S058 Tests: integration test for retry path.
S059 Title: Force cleanup stale worktree path.
S059 Preconditions: retry failed.
S059 Inputs: worktreePath.
S059 Actions: git worktree remove -f and prune.
S059 Outputs: stale path removed.
S059 Logs: log forced cleanup.
S059 Metrics: worktree.cleanup.force.
S059 Failures: git error.
S059 Recovery: abort with error.
S059 Tests: integration test with stale path.
S060 Title: Validate worktree after creation.
S060 Preconditions: worktree created.
S060 Inputs: worktreePath, branchName, expectedCommit.
S060 Actions: validateWorktree; compare branch and commit.
S060 Outputs: validation result.
S060 Logs: log validation failure details.
S060 Metrics: worktree.validation.fail.
S060 Failures: mismatch.
S060 Recovery: cleanup and fail creation.
S060 Tests: unit test validation mismatch.
S061 Title: Create worktree shims after creation.
S061 Preconditions: worktree exists.
S061 Inputs: worktreePath.
S061 Actions: ensureWorktreeShims.
S061 Outputs: shims created.
S061 Logs: log shim creation.
S061 Metrics: worktree.shims.created.
S061 Failures: fs errors.
S061 Recovery: retry or warn.
S061 Tests: integration test shim creation.
S062 Title: Lock worktree with reason after creation.
S062 Preconditions: worktree ready.
S062 Inputs: lockReason.
S062 Actions: git worktree lock -r.
S062 Outputs: worktree locked.
S062 Logs: log lock action.
S062 Metrics: worktree.lock.count.
S062 Failures: lock command fails.
S062 Recovery: cleanup and abort.
S062 Tests: integration test lock.
S063 Title: Verify lock status in listWorktrees.
S063 Preconditions: worktree locked.
S063 Inputs: porcelain output.
S063 Actions: parse locked line with reason.
S063 Outputs: locked status true.
S063 Logs: log lock reason in debug.
S063 Metrics: worktree.lock.detected.
S063 Failures: parse error.
S063 Recovery: mark as locked without reason.
S063 Tests: unit test lock parsing.
S064 Title: Unlock worktree after worker completes.
S064 Preconditions: worker finished.
S064 Inputs: worktreePath.
S064 Actions: git worktree unlock.
S064 Outputs: unlocked worktree.
S064 Logs: log unlock action.
S064 Metrics: worktree.unlock.count.
S064 Failures: unlock error.
S064 Recovery: log warning and continue.
S064 Tests: integration test unlock.
S065 Title: Validate HEAD inside worktree.
S065 Preconditions: worktree path exists.
S065 Inputs: worktreePath.
S065 Actions: git -C path rev-parse HEAD.
S065 Outputs: commit hash.
S065 Logs: log commit hash.
S065 Metrics: worktree.head.check.
S065 Failures: git error.
S065 Recovery: mark validation failed.
S065 Tests: unit test invalid worktree path.
S066 Title: Validate branch inside worktree.
S066 Preconditions: worktree exists.
S066 Inputs: worktreePath.
S066 Actions: git -C path rev-parse --abbrev-ref.
S066 Outputs: branch name.
S066 Logs: log branch name.
S066 Metrics: worktree.branch.check.
S066 Failures: git error.
S066 Recovery: mark validation failed.
S066 Tests: unit test invalid branch.
S067 Title: Validate worktree matches expected commit.
S067 Preconditions: expectedCommit known.
S067 Inputs: actual commit.
S067 Actions: compare commit hashes.
S067 Outputs: boolean match.
S067 Logs: log mismatch details.
S067 Metrics: worktree.commit.mismatch.
S067 Failures: mismatch.
S067 Recovery: cleanup worktree.
S067 Tests: unit test mismatch handling.
S068 Title: Validate worktree matches expected branch.
S068 Preconditions: expected branch.
S068 Inputs: actual branch.
S068 Actions: compare branch names.
S068 Outputs: boolean match.
S068 Logs: log mismatch details.
S068 Metrics: worktree.branch.mismatch.
S068 Failures: mismatch.
S068 Recovery: cleanup worktree.
S068 Tests: unit test branch mismatch.
S069 Title: Validate clean state before task starts.
S069 Preconditions: worktree ready.
S069 Inputs: git status.
S069 Actions: ensure clean or allow configured dirty.
S069 Outputs: readiness flag.
S069 Logs: log dirty status.
S069 Metrics: worktree.dirty.count.
S069 Failures: dirty state not allowed.
S069 Recovery: cleanup and recreate.
S069 Tests: integration test dirty state.
S070 Title: Preload dependencies in worktree if configured.
S070 Preconditions: worktree created.
S070 Inputs: install config.
S070 Actions: run dependency install if enabled.
S070 Outputs: dependencies ready.
S070 Logs: log install start and end.
S070 Metrics: worktree.install.time.
S070 Failures: install error.
S070 Recovery: mark worker failed.
S070 Tests: integration test with mock install.
S071 Title: Assign worker to task with lock.
S071 Preconditions: worker idle.
S071 Inputs: task id.
S071 Actions: lock worktree and assign task.
S071 Outputs: worker running state.
S071 Logs: log task assignment.
S071 Metrics: worker.assign.count.
S071 Failures: lock failure.
S071 Recovery: requeue task.
S071 Tests: unit test assignment.
S072 Title: Track worker-to-task mapping.
S072 Preconditions: assignment done.
S072 Inputs: workerId, taskId.
S072 Actions: update mapping.
S072 Outputs: map updated.
S072 Logs: log mapping change.
S072 Metrics: worker.map.update.
S072 Failures: map update error.
S072 Recovery: log and continue.
S072 Tests: unit test mapping.
S073 Title: Record task start time per worker.
S073 Preconditions: task assigned.
S073 Inputs: timestamp.
S073 Actions: store timing.
S073 Outputs: timing map updated.
S073 Logs: log timing.
S073 Metrics: worker.start.count.
S073 Failures: none.
S073 Recovery: none.
S073 Tests: unit test timing update.
S074 Title: Stream output from worker to UI buffer.
S074 Preconditions: worker running.
S074 Inputs: output chunks.
S074 Actions: append to per-worker output buffer.
S074 Outputs: UI updated on flush.
S074 Logs: log output size for debug.
S074 Metrics: output.bytes.count.
S074 Failures: buffer overflow.
S074 Recovery: truncate with warning.
S074 Tests: unit test buffer management.
S075 Title: Handle worker completion event.
S075 Preconditions: worker done.
S075 Inputs: result status.
S075 Actions: update task status and timing.
S075 Outputs: task marked complete or failed.
S075 Logs: log completion summary.
S075 Metrics: worker.complete.count.
S075 Failures: result missing.
S075 Recovery: mark task failed.
S075 Tests: integration test completion path.
S076 Title: Unlock worktree after task completion.
S076 Preconditions: worker done.
S076 Inputs: worktreePath.
S076 Actions: git worktree unlock.
S076 Outputs: worktree unlocked.
S076 Logs: log unlock.
S076 Metrics: worktree.unlock.after.count.
S076 Failures: unlock error.
S076 Recovery: log and continue.
S076 Tests: integration test unlock after completion.
S077 Title: Update worktree health after task completion.
S077 Preconditions: health refresh scheduled.
S077 Inputs: worktree manager.
S077 Actions: refreshWorktreeHealth.
S077 Outputs: updated summary.
S077 Logs: log summary if debug.
S077 Metrics: worktree.health.update.
S077 Failures: refresh error.
S077 Recovery: ignore and continue.
S077 Tests: unit test refresh logic.
S078 Title: Handle worker failure due to execution error.
S078 Preconditions: worker failed.
S078 Inputs: error details.
S078 Actions: mark task failed and store error.
S078 Outputs: error summary for UI.
S078 Logs: log failure details.
S078 Metrics: worker.failure.count.
S078 Failures: missing error.
S078 Recovery: use generic error.
S078 Tests: unit test error capture.
S079 Title: Handle worker failure due to merge conflict.
S079 Preconditions: merge conflict detected.
S079 Inputs: conflict files list.
S079 Actions: emit merge-failed event with files.
S079 Outputs: run summary includes conflicts.
S079 Logs: log conflict list.
S079 Metrics: merge.conflict.count.
S079 Failures: conflict files unavailable.
S079 Recovery: log unknown conflicts.
S079 Tests: integration test conflict path.
S080 Title: Handle worker retry logic.
S080 Preconditions: retryable error.
S080 Inputs: retry policy.
S080 Actions: schedule retry or skip.
S080 Outputs: task requeued or failed.
S080 Logs: log retry attempt.
S080 Metrics: worker.retry.count.
S080 Failures: retry scheduling failure.
S080 Recovery: mark task failed.
S080 Tests: unit test retry policy.
S081 Title: Track merge queue count.
S081 Preconditions: merge queued.
S081 Inputs: event data.
S081 Actions: increment mergeStats.queued.
S081 Outputs: UI shows merge queue.
S081 Logs: log queued merge.
S081 Metrics: merge.queue.count.
S081 Failures: state update error.
S081 Recovery: ignore and continue.
S081 Tests: unit test merge queue updates.
S082 Title: Start merge process for worker output.
S082 Preconditions: worker completed.
S082 Inputs: worktreePath and commit.
S082 Actions: attempt merge or cherry-pick to main.
S082 Outputs: merged commit or failure.
S082 Logs: log merge attempt.
S082 Metrics: merge.attempt.count.
S082 Failures: merge conflict.
S082 Recovery: trigger conflict resolution path.
S082 Tests: integration test merge path.
S083 Title: Attempt simple conflict resolution.
S083 Preconditions: conflict detected.
S083 Inputs: conflict files.
S083 Actions: resolveSimpleConflict on each file.
S083 Outputs: conflict resolved or fallback.
S083 Logs: log auto-resolve decision.
S083 Metrics: merge.auto.resolve.count.
S083 Failures: conflict complexity too high.
S083 Recovery: fall back to LLM or manual.
S083 Tests: unit tests for simple conflicts.
S084 Title: Ensure auto-resolve does not emit markers.
S084 Preconditions: auto-resolve running.
S084 Inputs: file contents.
S084 Actions: validate output for conflict markers.
S084 Outputs: safe merged content.
S084 Logs: log validation failure.
S084 Metrics: merge.marker.detected.
S084 Failures: markers found.
S084 Recovery: fall back to LLM or abort.
S084 Tests: unit test marker detection.
S085 Title: Validate conflict resolution writes to disk.
S085 Preconditions: resolved content produced.
S085 Inputs: file path and content.
S085 Actions: write file and stage.
S085 Outputs: staged resolved file.
S085 Logs: log file resolved.
S085 Metrics: merge.resolve.write.count.
S085 Failures: write error.
S085 Recovery: abort merge.
S085 Tests: integration test file write.
S086 Title: Attempt LLM conflict resolution when enabled.
S086 Preconditions: auto-resolve failed.
S086 Inputs: conflict file context.
S086 Actions: call LLM resolver.
S086 Outputs: resolved content or failure.
S086 Logs: log LLM resolution attempt.
S086 Metrics: merge.llm.resolve.count.
S086 Failures: LLM error or timeout.
S086 Recovery: mark merge failed.
S086 Tests: mock LLM tests.
S087 Title: Stage resolved files after LLM resolution.
S087 Preconditions: LLM result available.
S087 Inputs: file content.
S087 Actions: write and git add.
S087 Outputs: staged files.
S087 Logs: log staged files.
S087 Metrics: merge.llm.stage.count.
S087 Failures: git add error.
S087 Recovery: abort merge.
S087 Tests: integration test for git add.
S088 Title: Continue merge after successful resolution.
S088 Preconditions: conflicts resolved.
S088 Inputs: git state.
S088 Actions: git merge --continue or cherry-pick --continue.
S088 Outputs: merge commit.
S088 Logs: log merge success.
S088 Metrics: merge.success.count.
S088 Failures: continue error.
S088 Recovery: abort merge and mark failed.
S088 Tests: integration test continue path.
S089 Title: Abort merge on unrecoverable conflict.
S089 Preconditions: resolution failed.
S089 Inputs: git state.
S089 Actions: git merge --abort or reset.
S089 Outputs: clean main state.
S089 Logs: log merge abort.
S089 Metrics: merge.abort.count.
S089 Failures: abort error.
S089 Recovery: hard reset with caution.
S089 Tests: integration test abort path.
S090 Title: Emit merge-failed event with conflict files.
S090 Preconditions: merge failure.
S090 Inputs: task and conflict files.
S090 Actions: emit event with details.
S090 Outputs: UI shows conflict details.
S090 Logs: log failure event.
S090 Metrics: merge.failure.count.
S090 Failures: missing conflict list.
S090 Recovery: include generic reason.
S090 Tests: unit test event shape.
S091 Title: Update merge stats on success.
S091 Preconditions: merge succeeded.
S091 Inputs: merge event.
S091 Actions: increment merged count and decrement queued.
S091 Outputs: UI updated.
S091 Logs: log merge stats.
S091 Metrics: merge.stats.updated.
S091 Failures: state update error.
S091 Recovery: ignore and continue.
S091 Tests: unit test stats update.
S092 Title: Update merge stats on failure.
S092 Preconditions: merge failed.
S092 Inputs: failure event.
S092 Actions: increment failed count and decrement queued.
S092 Outputs: UI updated.
S092 Logs: log failure stats.
S092 Metrics: merge.stats.failed.
S092 Failures: state update error.
S092 Recovery: ignore and continue.
S092 Tests: unit test stats failure update.
S093 Title: Record merge conflict files for summary overlay.
S093 Preconditions: merge failed.
S093 Inputs: conflict files list.
S093 Actions: store in runFailures state.
S093 Outputs: summary overlay displays list.
S093 Logs: log summary update.
S093 Metrics: run.summary.conflicts.count.
S093 Failures: state update error.
S093 Recovery: ignore.
S093 Tests: UI test for overlay list.
S094 Title: Manage main sync operations with retries.
S094 Preconditions: merge completed.
S094 Inputs: main sync policy.
S094 Actions: attempt sync with retries.
S094 Outputs: main sync success or fail.
S094 Logs: log each retry.
S094 Metrics: main.sync.retry.count.
S094 Failures: repeated sync failure.
S094 Recovery: emit main sync alert.
S094 Tests: integration test sync retry.
S095 Title: Persist pending main tasks list.
S095 Preconditions: sync pending.
S095 Inputs: pending tasks.
S095 Actions: update pending list state.
S095 Outputs: UI indicates pending.
S095 Logs: log pending count.
S095 Metrics: main.sync.pending.count.
S095 Failures: state update error.
S095 Recovery: ignore.
S095 Tests: unit test pending list.
S096 Title: Emit main sync alert for repeated failures.
S096 Preconditions: retries exhausted.
S096 Inputs: affected task list.
S096 Actions: emit alert event.
S096 Outputs: UI alert displayed.
S096 Logs: log alert details.
S096 Metrics: main.sync.alert.count.
S096 Failures: event emit error.
S096 Recovery: log warning.
S096 Tests: unit test alert event.
S097 Title: Provide actionable merge failure messages.
S097 Preconditions: merge failure.
S097 Inputs: conflict files and reason.
S097 Actions: build enhanced error message.
S097 Outputs: message shown in summary.
S097 Logs: log message.
S097 Metrics: merge.failure.message.count.
S097 Failures: message build error.
S097 Recovery: default to reason only.
S097 Tests: unit test message format.
S098 Title: Ensure activity log uses consistent merge failure format.
S098 Preconditions: merge failed event.
S098 Inputs: event data.
S098 Actions: formatMergeFailedDescription.
S098 Outputs: activity log line.
S098 Logs: log formatted message in debug.
S098 Metrics: activity.merge.failed.count.
S098 Failures: formatting error.
S098 Recovery: fallback to generic format.
S098 Tests: unit test formatting.
S099 Title: Track per-worker output buffers for UI.
S099 Preconditions: worker started.
S099 Inputs: output chunks.
S099 Actions: append and flush on timer.
S099 Outputs: UI updates with output.
S099 Logs: log output buffer sizes.
S099 Metrics: output.buffer.bytes.
S099 Failures: buffer overflow.
S099 Recovery: truncate with warning.
S099 Tests: unit test buffer size limits.
S100 Title: Persist iteration logs per task.
S100 Preconditions: iteration completed.
S100 Inputs: task id, output, timing.
S100 Actions: write to logs directory.
S100 Outputs: log file on disk.
S100 Logs: log file path.
S100 Metrics: logs.write.count.
S100 Failures: write error.
S100 Recovery: log warning and continue.
S100 Tests: integration test log write.
S101 Title: Record worker idle state after task done.
S101 Preconditions: task finished.
S101 Inputs: worker id.
S101 Actions: mark worker idle.
S101 Outputs: worker available.
S101 Logs: log idle event.
S101 Metrics: worker.idle.count.
S101 Failures: state update error.
S101 Recovery: ignore.
S101 Tests: unit test idle state update.
S102 Title: Ensure task status transitions are valid.
S102 Preconditions: task update.
S102 Inputs: previous status, new status.
S102 Actions: validate transition.
S102 Outputs: applied status or error.
S102 Logs: log invalid transition.
S102 Metrics: task.status.invalid.
S102 Failures: invalid transition.
S102 Recovery: ignore update.
S102 Tests: unit test transition table.
S103 Title: Reset in-progress tasks on shutdown.
S103 Preconditions: shutdown initiated.
S103 Inputs: active tasks list.
S103 Actions: reset tasks to open.
S103 Outputs: tasks reopened.
S103 Logs: log reset count.
S103 Metrics: task.reset.count.
S103 Failures: reset error.
S103 Recovery: warn and continue.
S103 Tests: integration test shutdown reset.
S104 Title: Persist session state after each iteration.
S104 Preconditions: iteration completed.
S104 Inputs: session state.
S104 Actions: save persisted session.
S104 Outputs: session file updated.
S104 Logs: log save success.
S104 Metrics: session.save.count.
S104 Failures: write error.
S104 Recovery: log warning.
S104 Tests: unit test persistence.
S105 Title: Persist session state on pause.
S105 Preconditions: pause event.
S105 Inputs: session state.
S105 Actions: mark paused and save.
S105 Outputs: session paused.
S105 Logs: log pause.
S105 Metrics: session.pause.count.
S105 Failures: save error.
S105 Recovery: warn.
S105 Tests: unit test pause persistence.
S106 Title: Resume session with saved state.
S106 Preconditions: resume requested.
S106 Inputs: persisted state.
S106 Actions: load state and resume engine.
S106 Outputs: session resumed.
S106 Logs: log resume.
S106 Metrics: session.resume.count.
S106 Failures: load error.
S106 Recovery: fallback to new session.
S106 Tests: integration test resume.
S107 Title: Update subagent tree during execution.
S107 Preconditions: subagent data available.
S107 Inputs: subagent tree snapshot.
S107 Actions: update UI state.
S107 Outputs: tree panel updated.
S107 Logs: log update count.
S107 Metrics: subagent.tree.update.
S107 Failures: update error.
S107 Recovery: ignore.
S107 Tests: UI test tree updates.
S108 Title: Flush output parser state on timer.
S108 Preconditions: output parser active.
S108 Inputs: parsed segments.
S108 Actions: update output and segments state.
S108 Outputs: UI output updated.
S108 Logs: log flush rate.
S108 Metrics: output.flush.count.
S108 Failures: parser error.
S108 Recovery: reset parser.
S108 Tests: unit test flush.
S109 Title: Enforce output size limits.
S109 Preconditions: output buffer grows.
S109 Inputs: output size.
S109 Actions: truncate when limit exceeded.
S109 Outputs: bounded output size.
S109 Logs: log truncation.
S109 Metrics: output.truncate.count.
S109 Failures: none.
S109 Recovery: none.
S109 Tests: unit test truncation.
S110 Title: Keep worker output per task stable.
S110 Preconditions: output streaming.
S110 Inputs: workerId, taskId.
S110 Actions: map output to task.
S110 Outputs: output visible for selected task.
S110 Logs: log mapping changes.
S110 Metrics: output.mapping.count.
S110 Failures: missing taskId.
S110 Recovery: route to main output.
S110 Tests: unit test mapping.
S111 Title: Update run summary after completion.
S111 Preconditions: run ended.
S111 Inputs: run failures and stats.
S111 Actions: build summary and render overlay.
S111 Outputs: summary overlay visible.
S111 Logs: log summary creation.
S111 Metrics: run.summary.count.
S111 Failures: summary error.
S111 Recovery: show generic summary.
S111 Tests: UI test summary overlay.
S112 Title: Include conflict files in summary overlay.
S112 Preconditions: merge failures exist.
S112 Inputs: conflict files per failure.
S112 Actions: render list with truncation.
S112 Outputs: conflict list visible.
S112 Logs: log list length.
S112 Metrics: run.summary.conflicts.rendered.
S112 Failures: render error.
S112 Recovery: fallback to reason only.
S112 Tests: UI test conflict rendering.
S113 Title: Provide restore snapshot action.
S113 Preconditions: snapshot tag exists.
S113 Inputs: snapshot tag.
S113 Actions: restore tracker state.
S113 Outputs: tasks reset to open.
S113 Logs: log restore action.
S113 Metrics: snapshot.restore.count.
S113 Failures: restore error.
S113 Recovery: show error message.
S113 Tests: integration test restore.
S114 Title: Manage pending main tasks for restore overlay.
S114 Preconditions: pending tasks list.
S114 Inputs: list of pending tasks.
S114 Actions: render pending tasks in overlay.
S114 Outputs: list visible.
S114 Logs: log list size.
S114 Metrics: pending.tasks.rendered.
S114 Failures: render error.
S114 Recovery: hide list.
S114 Tests: UI test pending list.
S115 Title: Ensure worker processes exit cleanly.
S115 Preconditions: engine stopped.
S115 Inputs: worker pool.
S115 Actions: stop workers and release resources.
S115 Outputs: workers terminated.
S115 Logs: log worker shutdown.
S115 Metrics: worker.shutdown.count.
S115 Failures: worker refuses to stop.
S115 Recovery: force terminate after timeout.
S115 Tests: integration test shutdown.
S116 Title: Ensure worktree cleanup on TUI quit.
S116 Preconditions: user quits.
S116 Inputs: repoRoot.
S116 Actions: cleanupAllWorktrees.
S116 Outputs: worktrees removed.
S116 Logs: log cleanup result.
S116 Metrics: worktree.cleanup.onquit.
S116 Failures: cleanup errors.
S116 Recovery: log warnings.
S116 Tests: integration test quit cleanup.
S117 Title: Ensure worktree cleanup on headless stop.
S117 Preconditions: headless stop.
S117 Inputs: repoRoot.
S117 Actions: cleanupAllWorktrees.
S117 Outputs: worktrees removed.
S117 Logs: log cleanup result.
S117 Metrics: worktree.cleanup.headless.
S117 Failures: cleanup errors.
S117 Recovery: log warnings.
S117 Tests: headless integration test.
S118 Title: Cleanup worktrees on engine dispose.
S118 Preconditions: engine dispose called.
S118 Inputs: repoRoot.
S118 Actions: cleanupAllWorktrees.
S118 Outputs: cleanup results.
S118 Logs: log cleanup result.
S118 Metrics: worktree.cleanup.dispose.
S118 Failures: cleanup errors.
S118 Recovery: log warnings.
S118 Tests: unit test cleanup call.
S119 Title: Ensure cleanup is idempotent.
S119 Preconditions: cleanup called multiple times.
S119 Inputs: repoRoot.
S119 Actions: allow repeat cleanup with no errors.
S119 Outputs: stable no-op on repeats.
S119 Logs: log repeated cleanup.
S119 Metrics: worktree.cleanup.repeat.
S119 Failures: none.
S119 Recovery: none.
S119 Tests: integration test repeated cleanup.
S120 Title: Ensure cleanup does not remove main repo.
S120 Preconditions: cleanup running.
S120 Inputs: repoRoot.
S120 Actions: skip worktree path that is repoRoot.
S120 Outputs: main repo untouched.
S120 Logs: log skip for repoRoot.
S120 Metrics: worktree.cleanup.skip.main.
S120 Failures: none.
S120 Recovery: none.
S120 Tests: unit test skip main.
S121 Title: Show worktree counts in dashboard banner.
S121 Preconditions: dashboard visible.
S121 Inputs: worktreeHealthSummary.
S121 Actions: render active, locked, stale counts.
S121 Outputs: counts visible.
S121 Logs: none.
S121 Metrics: ui.worktree.counts.render.
S121 Failures: render error.
S121 Recovery: hide counts.
S121 Tests: UI snapshot for banner.
S122 Title: Show prune availability indicator.
S122 Preconditions: stale or prunable > 0.
S122 Inputs: worktreeHealthSummary.
S122 Actions: show prune hint in dashboard.
S122 Outputs: hint visible.
S122 Logs: none.
S122 Metrics: ui.prune.hint.shown.
S122 Failures: render error.
S122 Recovery: omit hint.
S122 Tests: UI test for prune hint.
S123 Title: Trigger manual prune via key binding.
S123 Preconditions: dashboard visible.
S123 Inputs: key event 'p'.
S123 Actions: call handlePruneWorktrees.
S123 Outputs: prune started.
S123 Logs: log prune start.
S123 Metrics: ui.prune.triggered.
S123 Failures: prune error.
S123 Recovery: show error message.
S123 Tests: UI input test.
S124 Title: Display prune progress indicator.
S124 Preconditions: pruning true.
S124 Inputs: pruning state.
S124 Actions: render spinner or text.
S124 Outputs: user sees pruning state.
S124 Logs: none.
S124 Metrics: ui.prune.indicator.
S124 Failures: render error.
S124 Recovery: hide indicator.
S124 Tests: UI snapshot with pruning state.
S125 Title: Display prune result in info feedback.
S125 Preconditions: prune completed.
S125 Inputs: result success or error.
S125 Actions: set info feedback text.
S125 Outputs: feedback visible.
S125 Logs: log feedback message.
S125 Metrics: ui.prune.feedback.count.
S125 Failures: state update error.
S125 Recovery: ignore.
S125 Tests: UI test feedback.
S126 Title: Render merge queue stats in dashboard.
S126 Preconditions: merge stats available.
S126 Inputs: mergeStats.
S126 Actions: render queue and merged counts.
S126 Outputs: stats visible.
S126 Logs: none.
S126 Metrics: ui.merge.stats.render.
S126 Failures: render error.
S126 Recovery: hide stats.
S126 Tests: UI snapshot.
S127 Title: Display main sync pending count.
S127 Preconditions: pendingMainCount updated.
S127 Inputs: pendingMainCount.
S127 Actions: render in dashboard.
S127 Outputs: count visible.
S127 Logs: none.
S127 Metrics: ui.main.sync.pending.render.
S127 Failures: render error.
S127 Recovery: hide count.
S127 Tests: UI snapshot.
S128 Title: Display worktree health in ProgressDashboard.
S128 Preconditions: showDashboard true.
S128 Inputs: worktreeHealth.
S128 Actions: render stale and prunable summary.
S128 Outputs: status text visible.
S128 Logs: none.
S128 Metrics: ui.worktree.health.render.
S128 Failures: render error.
S128 Recovery: hide summary.
S128 Tests: UI snapshot.
S129 Title: Ensure dashboard toggles do not break pruning.
S129 Preconditions: showDashboard toggled.
S129 Inputs: showDashboard state.
S129 Actions: enable or disable prune actions.
S129 Outputs: prune disabled when hidden.
S129 Logs: none.
S129 Metrics: ui.prune.disabled.count.
S129 Failures: none.
S129 Recovery: none.
S129 Tests: UI test toggle.
S130 Title: Show worktree health after prune refresh.
S130 Preconditions: prune succeeded.
S130 Inputs: refreshWorktreeHealth.
S130 Actions: update health summary.
S130 Outputs: new counts displayed.
S130 Logs: log refresh.
S130 Metrics: ui.health.refresh.after.prune.
S130 Failures: refresh error.
S130 Recovery: ignore.
S130 Tests: UI test prune refresh.
S131 Title: Provide detailed merge failure in ActivityLog.
S131 Preconditions: merge failed.
S131 Inputs: event with conflict files.
S131 Actions: formatMergeFailedDescription.
S131 Outputs: detailed log line.
S131 Logs: none.
S131 Metrics: ui.activity.merge.fail.render.
S131 Failures: formatting error.
S131 Recovery: fallback to simple format.
S131 Tests: UI snapshot of activity log.
S132 Title: Ensure activity log handles missing conflict files.
S132 Preconditions: conflict list empty.
S132 Inputs: event reason.
S132 Actions: format without conflicts.
S132 Outputs: log line without list.
S132 Logs: none.
S132 Metrics: ui.activity.merge.fail.noconflict.
S132 Failures: none.
S132 Recovery: none.
S132 Tests: unit test formatting.
S133 Title: Expose worktree health in run summary overlay.
S133 Preconditions: summary overlay open.
S133 Inputs: worktreeHealthSummary.
S133 Actions: display stale/prunable counts.
S133 Outputs: overlay shows counts.
S133 Logs: none.
S133 Metrics: ui.summary.health.render.
S133 Failures: render error.
S133 Recovery: hide summary counts.
S133 Tests: UI test overlay.
S134 Title: Provide clear UI for manual prune command.
S134 Preconditions: dashboard visible.
S134 Inputs: key mapping.
S134 Actions: show hint for prune.
S134 Outputs: hint visible.
S134 Logs: none.
S134 Metrics: ui.prune.hint.render.
S134 Failures: render error.
S134 Recovery: hide hint.
S134 Tests: UI hint test.
S135 Title: Provide UI guard when prune not available.
S135 Preconditions: no stale/prunable.
S135 Inputs: worktreeHealthSummary.
S135 Actions: disable prune actions.
S135 Outputs: prune key ignored.
S135 Logs: none.
S135 Metrics: ui.prune.disabled.
S135 Failures: none.
S135 Recovery: none.
S135 Tests: UI test prune disabled.
S136 Title: Maintain UI responsiveness during prune.
S136 Preconditions: prune running.
S136 Inputs: pruning state.
S136 Actions: avoid blocking UI thread.
S136 Outputs: UI remains interactive.
S136 Logs: none.
S136 Metrics: ui.prune.latency.
S136 Failures: UI freeze.
S136 Recovery: abort prune.
S136 Tests: UI responsiveness test.
S137 Title: Keep worktree health refresh independent of dashboard visibility.
S137 Preconditions: showDashboard false.
S137 Inputs: refreshWorktreeHealth.
S137 Actions: still refresh on schedule.
S137 Outputs: health kept current.
S137 Logs: none.
S137 Metrics: ui.health.refresh.hidden.
S137 Failures: none.
S137 Recovery: none.
S137 Tests: unit test hidden refresh.
S138 Title: Provide UI error feedback on prune failure.
S138 Preconditions: prune failed.
S138 Inputs: error message.
S138 Actions: set info feedback.
S138 Outputs: error message shown.
S138 Logs: log failure.
S138 Metrics: ui.prune.error.count.
S138 Failures: state update error.
S138 Recovery: ignore.
S138 Tests: UI test prune failure message.
S139 Title: Update activity log on prune action.
S139 Preconditions: prune requested.
S139 Inputs: success or failure.
S139 Actions: append activity event.
S139 Outputs: activity line.
S139 Logs: log event.
S139 Metrics: activity.prune.event.
S139 Failures: event append error.
S139 Recovery: ignore.
S139 Tests: unit test activity event.
S140 Title: Ensure UI displays current worktree counts after refresh.
S140 Preconditions: refresh done.
S140 Inputs: worktreeHealthSummary.
S140 Actions: update relevant UI state.
S140 Outputs: counts updated.
S140 Logs: none.
S140 Metrics: ui.health.update.count.
S140 Failures: state update error.
S140 Recovery: ignore.
S140 Tests: UI snapshot after refresh.
S141 Title: Establish backup strategy for worktree metadata.
S141 Preconditions: config available.
S141 Inputs: worktree list and lock info.
S141 Actions: persist metadata to backup file.
S141 Outputs: backup file created.
S141 Logs: log backup creation.
S141 Metrics: backup.worktree.meta.count.
S141 Failures: write error.
S141 Recovery: log warning and continue.
S141 Tests: integration test backup file creation.
S142 Title: Backup lock state before shutdown.
S142 Preconditions: shutdown initiated.
S142 Inputs: lock status.
S142 Actions: write lock backup snapshot.
S142 Outputs: backup of lock state.
S142 Logs: log backup path.
S142 Metrics: backup.lock.count.
S142 Failures: backup error.
S142 Recovery: log warning.
S142 Tests: unit test backup writing.
S143 Title: Provide recovery step from backup.
S143 Preconditions: backup file exists.
S143 Inputs: backup file.
S143 Actions: restore metadata and reconcile.
S143 Outputs: restored state.
S143 Logs: log restore action.
S143 Metrics: backup.restore.count.
S143 Failures: restore error.
S143 Recovery: manual instructions.
S143 Tests: integration test restore.
S144 Title: Contingency for failed cleanup after crash.
S144 Preconditions: crash detected.
S144 Inputs: worktree list.
S144 Actions: run cleanupAllWorktrees on next startup.
S144 Outputs: cleaned worktrees.
S144 Logs: log cleanup after crash.
S144 Metrics: cleanup.after.crash.count.
S144 Failures: cleanup errors.
S144 Recovery: manual prune instruction.
S144 Tests: integration test crash recovery.
S145 Title: Contingency for repeated main sync failures.
S145 Preconditions: retries exhausted.
S145 Inputs: pending tasks list.
S145 Actions: mark tasks pending and alert.
S145 Outputs: user notified.
S145 Logs: log alert.
S145 Metrics: sync.alert.count.
S145 Failures: alert not shown.
S145 Recovery: log warning.
S145 Tests: unit test alert emission.
S146 Title: Contingency for persistent conflicts.
S146 Preconditions: conflicts repeated.
S146 Inputs: conflict files.
S146 Actions: stop auto-resolve and require manual.
S146 Outputs: merge failure with instructions.
S146 Logs: log manual intervention required.
S146 Metrics: merge.manual.required.
S146 Failures: none.
S146 Recovery: manual cleanup steps in log.
S146 Tests: integration test persistent conflict.
S147 Title: Contingency for corrupted worktree directory.
S147 Preconditions: file IO errors.
S147 Inputs: worktree path.
S147 Actions: remove and recreate worktree.
S147 Outputs: fresh worktree.
S147 Logs: log corruption recovery.
S147 Metrics: worktree.corrupt.recovered.
S147 Failures: recreate error.
S147 Recovery: abort worker.
S147 Tests: integration test corrupted dir.
S148 Title: Contingency for missing git binary.
S148 Preconditions: git commands fail.
S148 Inputs: error output.
S148 Actions: abort with guidance.
S148 Outputs: user action required.
S148 Logs: log missing git.
S148 Metrics: git.missing.count.
S148 Failures: none.
S148 Recovery: instruct to install git.
S148 Tests: unit test error messaging.
S149 Title: Contingency for disk full during worktree create.
S149 Preconditions: disk full errors.
S149 Inputs: error output.
S149 Actions: abort create and log.
S149 Outputs: task failed with reason.
S149 Logs: log disk full.
S149 Metrics: worktree.diskfull.count.
S149 Failures: none.
S149 Recovery: instruct to free space.
S149 Tests: integration test with full disk simulation.
S150 Title: Contingency for permission errors.
S150 Preconditions: permission error encountered.
S150 Inputs: error output.
S150 Actions: abort and provide path info.
S150 Outputs: actionable error message.
S150 Logs: log permission error.
S150 Metrics: worktree.permission.error.
S150 Failures: none.
S150 Recovery: instruct to adjust permissions.
S150 Tests: integration test with read-only dir.
S151 Title: Contingency for network loss during tracker updates.
S151 Preconditions: network error.
S151 Inputs: tracker error.
S151 Actions: retry with backoff and cache changes.
S151 Outputs: eventual success or abort.
S151 Logs: log retry attempts.
S151 Metrics: tracker.retry.count.
S151 Failures: retries exhausted.
S151 Recovery: mark tasks pending sync.
S151 Tests: integration test network failure.
S152 Title: Contingency for agent crash mid-task.
S152 Preconditions: agent process exits.
S152 Inputs: worker id.
S152 Actions: mark task failed and cleanup worktree.
S152 Outputs: worker freed.
S152 Logs: log agent crash.
S152 Metrics: agent.crash.count.
S152 Failures: cleanup error.
S152 Recovery: manual cleanup recommendation.
S152 Tests: integration test agent crash.
S153 Title: Contingency for merge tool failure.
S153 Preconditions: git merge returns error.
S153 Inputs: error output.
S153 Actions: abort merge and capture conflict files.
S153 Outputs: merge failure event.
S153 Logs: log merge tool error.
S153 Metrics: merge.tool.error.
S153 Failures: conflict file parse error.
S153 Recovery: log unknown conflict.
S153 Tests: unit test error parsing.
S154 Title: Contingency for stale worktree count mismatch.
S154 Preconditions: health summary inconsistent.
S154 Inputs: worktree list.
S154 Actions: recompute health with fresh git query.
S154 Outputs: corrected health summary.
S154 Logs: log mismatch correction.
S154 Metrics: health.recompute.count.
S154 Failures: git query error.
S154 Recovery: keep previous summary.
S154 Tests: integration test recompute.
S155 Title: Backup worktree changes before force cleanup.
S155 Preconditions: force cleanup needed.
S155 Inputs: worktree path.
S155 Actions: copy worktree to backup location.
S155 Outputs: backup snapshot.
S155 Logs: log backup path.
S155 Metrics: backup.worktree.snapshot.
S155 Failures: backup error.
S155 Recovery: warn and continue.
S155 Tests: integration test backup snapshot.
S156 Title: Provide operator command to inspect backups.
S156 Preconditions: backups exist.
S156 Inputs: backup directory.
S156 Actions: expose CLI or docs to list backups.
S156 Outputs: user can locate backups.
S156 Logs: log backup list requests.
S156 Metrics: backup.list.count.
S156 Failures: none.
S156 Recovery: none.
S156 Tests: manual check.
S157 Title: Provide operator command to restore backup.
S157 Preconditions: backup selected.
S157 Inputs: backup path.
S157 Actions: restore to new branch or worktree.
S157 Outputs: restored worktree.
S157 Logs: log restore action.
S157 Metrics: backup.restore.worktree.count.
S157 Failures: restore error.
S157 Recovery: log and abort.
S157 Tests: integration test restore.
S158 Title: Provide emergency disable for auto-merge.
S158 Preconditions: repeated failures.
S158 Inputs: config flag.
S158 Actions: skip merge and leave tasks pending.
S158 Outputs: safer mode activated.
S158 Logs: log disable flag.
S158 Metrics: merge.auto.disabled.
S158 Failures: none.
S158 Recovery: manual merge.
S158 Tests: unit test config behavior.
S159 Title: Provide emergency disable for parallelism.
S159 Preconditions: system unstable.
S159 Inputs: config flag.
S159 Actions: run with single worker.
S159 Outputs: serial execution.
S159 Logs: log parallel disabled.
S159 Metrics: parallel.disabled.count.
S159 Failures: none.
S159 Recovery: none.
S159 Tests: unit test config behavior.
S160 Title: Provide recovery script for operators.
S160 Preconditions: failure scenario.
S160 Inputs: repoRoot.
S160 Actions: document recovery commands.
S160 Outputs: runbook steps.
S160 Logs: none.
S160 Metrics: docs.recovery.updated.
S160 Failures: none.
S160 Recovery: none.
S160 Tests: doc review.
S161 Title: UI: Show worktree health summary in banner.
S161 Preconditions: dashboard visible.
S161 Inputs: worktreeHealthSummary.
S161 Actions: render active/locked/stale counts.
S161 Outputs: health visible.
S161 Logs: none.
S161 Metrics: ui.banner.health.count.
S161 Failures: render error.
S161 Recovery: hide health row.
S161 Tests: UI snapshot test.
S162 Title: UI: Show prune button state.
S162 Preconditions: pruning or not.
S162 Inputs: pruning flag.
S162 Actions: show busy indicator.
S162 Outputs: user sees pruning state.
S162 Logs: none.
S162 Metrics: ui.prune.busy.count.
S162 Failures: render error.
S162 Recovery: hide indicator.
S162 Tests: UI test for pruning state.
S163 Title: UI: Disable prune when no stale/prunable.
S163 Preconditions: health summary.
S163 Inputs: stale and prunable counts.
S163 Actions: ignore prune key.
S163 Outputs: no action.
S163 Logs: none.
S163 Metrics: ui.prune.disabled.count.
S163 Failures: none.
S163 Recovery: none.
S163 Tests: UI key test.
S164 Title: UI: Display main sync pending tasks count.
S164 Preconditions: pendingMainCount available.
S164 Inputs: pendingMainCount.
S164 Actions: render count in dashboard.
S164 Outputs: visible count.
S164 Logs: none.
S164 Metrics: ui.pending.count.
S164 Failures: render error.
S164 Recovery: hide count.
S164 Tests: UI snapshot.
S165 Title: UI: Show merge failure details with conflict files.
S165 Preconditions: runFailures list.
S165 Inputs: conflict files.
S165 Actions: render summary overlay.
S165 Outputs: conflict list visible.
S165 Logs: none.
S165 Metrics: ui.summary.conflicts.count.
S165 Failures: render error.
S165 Recovery: render reason only.
S165 Tests: UI snapshot.
S166 Title: UI: Show pruning hint in footer.
S166 Preconditions: pruning available.
S166 Inputs: health summary.
S166 Actions: display hint text.
S166 Outputs: hint visible.
S166 Logs: none.
S166 Metrics: ui.footer.prune.hint.
S166 Failures: render error.
S166 Recovery: hide hint.
S166 Tests: UI snapshot.
S167 Title: UI: Show lock status in task list.
S167 Preconditions: task list visible.
S167 Inputs: lock status or mapping.
S167 Actions: render indicator per task.
S167 Outputs: lock status visible.
S167 Logs: none.
S167 Metrics: ui.task.lock.indicator.
S167 Failures: render error.
S167 Recovery: hide indicator.
S167 Tests: UI snapshot.
S168 Title: UI: Show stale worktree warning banner.
S168 Preconditions: stale count > 0.
S168 Inputs: stale count.
S168 Actions: render warning line.
S168 Outputs: warning visible.
S168 Logs: none.
S168 Metrics: ui.stale.warning.count.
S168 Failures: render error.
S168 Recovery: ignore.
S168 Tests: UI snapshot.
S169 Title: UI: Ensure worktree counts update on interval.
S169 Preconditions: refresh running.
S169 Inputs: refresh interval.
S169 Actions: update UI state.
S169 Outputs: updated counts.
S169 Logs: none.
S169 Metrics: ui.health.refresh.tick.
S169 Failures: none.
S169 Recovery: none.
S169 Tests: unit test timer update.
S170 Title: UI: Provide manual refresh action.
S170 Preconditions: user requests refresh.
S170 Inputs: key binding or button.
S170 Actions: call refreshWorktreeHealth.
S170 Outputs: updated summary.
S170 Logs: log manual refresh.
S170 Metrics: ui.refresh.manual.count.
S170 Failures: refresh error.
S170 Recovery: show error feedback.
S170 Tests: UI key test.
S171 Title: UI: Provide safe messaging for cleanup failures.
S171 Preconditions: cleanup error list.
S171 Inputs: error list.
S171 Actions: show warnings in log or toast.
S171 Outputs: user informed.
S171 Logs: log cleanup errors.
S171 Metrics: ui.cleanup.error.count.
S171 Failures: render error.
S171 Recovery: log only.
S171 Tests: UI test for warning text.
S172 Title: UI: Keep key bindings consistent across views.
S172 Preconditions: multiple views.
S172 Inputs: key mapping config.
S172 Actions: enforce consistent mapping.
S172 Outputs: user experience consistent.
S172 Logs: none.
S172 Metrics: ui.keymap.validated.
S172 Failures: conflicting bindings.
S172 Recovery: show help with overrides.
S172 Tests: unit test keymap.
S173 Title: UI: Show worker assignment in task cards.
S173 Preconditions: workerTaskMap updated.
S173 Inputs: task and worker mapping.
S173 Actions: render worker id in card.
S173 Outputs: assignment visible.
S173 Logs: none.
S173 Metrics: ui.worker.assignment.render.
S173 Failures: render error.
S173 Recovery: hide assignment.
S173 Tests: UI snapshot.
S174 Title: UI: Display prune hotkey in help overlay.
S174 Preconditions: help overlay open.
S174 Inputs: help content.
S174 Actions: add prune hint.
S174 Outputs: help includes prune key.
S174 Logs: none.
S174 Metrics: ui.help.prune.hint.
S174 Failures: none.
S174 Recovery: none.
S174 Tests: UI snapshot.
S175 Title: UI: Provide feedback when prune not permitted in remote view.
S175 Preconditions: viewing remote.
S175 Inputs: key event.
S175 Actions: ignore or show message.
S175 Outputs: no local prune performed.
S175 Logs: log ignored prune.
S175 Metrics: ui.prune.remote.ignore.
S175 Failures: none.
S175 Recovery: none.
S175 Tests: UI test remote view.
S176 Title: UI: Show system health in activity timeline.
S176 Preconditions: activity view visible.
S176 Inputs: health events.
S176 Actions: append events to timeline.
S176 Outputs: health activity visible.
S176 Logs: none.
S176 Metrics: ui.activity.health.events.
S176 Failures: event append error.
S176 Recovery: ignore.
S176 Tests: UI test activity view.
S177 Title: UI: Ensure text nodes contain only valid children.
S177 Preconditions: OpenTUI rendering.
S177 Inputs: JSX content.
S177 Actions: enforce text child rules.
S177 Outputs: no runtime TextNodeRenderable errors.
S177 Logs: log lint warnings.
S177 Metrics: ui.text.validation.count.
S177 Failures: invalid child.
S177 Recovery: fix render code.
S177 Tests: lint rule and UI tests.
S178 Title: UI: Render worktree counts even when tasks list empty.
S178 Preconditions: no tasks.
S178 Inputs: worktree health summary.
S178 Actions: render counts in banner.
S178 Outputs: health still visible.
S178 Logs: none.
S178 Metrics: ui.banner.empty.tasks.
S178 Failures: render error.
S178 Recovery: hide counts.
S178 Tests: UI snapshot with empty tasks.
S179 Title: UI: Show prune success in activity log.
S179 Preconditions: prune success.
S179 Inputs: activity events.
S179 Actions: append success event.
S179 Outputs: activity line visible.
S179 Logs: none.
S179 Metrics: ui.activity.prune.success.
S179 Failures: append error.
S179 Recovery: ignore.
S179 Tests: unit test activity event.
S180 Title: UI: Show prune failure in activity log.
S180 Preconditions: prune failure.
S180 Inputs: error message.
S180 Actions: append failure event.
S180 Outputs: activity line visible.
S180 Logs: none.
S180 Metrics: ui.activity.prune.failure.
S180 Failures: append error.
S180 Recovery: ignore.
S180 Tests: unit test activity event.
S181 Title: Backup: create periodic snapshot of worktree list.
S181 Preconditions: runtime running.
S181 Inputs: worktree list.
S181 Actions: write snapshot to backup directory.
S181 Outputs: snapshot file.
S181 Logs: log snapshot path.
S181 Metrics: backup.snapshot.count.
S181 Failures: write error.
S181 Recovery: log warning and continue.
S181 Tests: integration test snapshot schedule.
S182 Title: Backup: rotate old snapshots.
S182 Preconditions: backup schedule active.
S182 Inputs: snapshot directory.
S182 Actions: keep last N snapshots.
S182 Outputs: old snapshots removed.
S182 Logs: log rotation.
S182 Metrics: backup.rotate.count.
S182 Failures: delete error.
S182 Recovery: log warning.
S182 Tests: unit test rotation.
S183 Title: Backup: include lock metadata in snapshots.
S183 Preconditions: lock file exists.
S183 Inputs: lock file content.
S183 Actions: embed in snapshot.
S183 Outputs: snapshot includes lock state.
S183 Logs: log lock metadata captured.
S183 Metrics: backup.lock.captured.
S183 Failures: read error.
S183 Recovery: proceed without lock data.
S183 Tests: unit test snapshot contents.
S184 Title: Backup: capture merge failure context.
S184 Preconditions: merge failure event.
S184 Inputs: event details.
S184 Actions: write failure context to backup.
S184 Outputs: failure record stored.
S184 Logs: log backup of failure.
S184 Metrics: backup.merge.failure.count.
S184 Failures: write error.
S184 Recovery: log warning.
S184 Tests: unit test failure backup.
S185 Title: Recovery: rebuild worktree health from backup.
S185 Preconditions: startup after crash.
S185 Inputs: latest backup.
S185 Actions: read snapshot and compare with git.
S185 Outputs: reconciliation report.
S185 Logs: log reconciliation.
S185 Metrics: recovery.reconcile.count.
S185 Failures: backup missing.
S185 Recovery: proceed with git only.
S185 Tests: integration test reconciliation.
S186 Title: Recovery: restore a single worktree from backup.
S186 Preconditions: backup available.
S186 Inputs: worktree snapshot.
S186 Actions: recreate worktree on new branch.
S186 Outputs: restored worktree.
S186 Logs: log restore details.
S186 Metrics: recovery.restore.count.
S186 Failures: recreate error.
S186 Recovery: abort and report.
S186 Tests: integration test restore.
S187 Title: Recovery: verify restored worktree integrity.
S187 Preconditions: restore completed.
S187 Inputs: worktree path.
S187 Actions: validate commit and branch.
S187 Outputs: integrity pass/fail.
S187 Logs: log validation result.
S187 Metrics: recovery.validate.count.
S187 Failures: validation error.
S187 Recovery: delete restored worktree.
S187 Tests: unit test validation path.
S188 Title: Recovery: clear orphaned locks from backup.
S188 Preconditions: backup shows dead PID.
S188 Inputs: lock metadata.
S188 Actions: remove lock file.
S188 Outputs: lock cleared.
S188 Logs: log lock removal.
S188 Metrics: recovery.lock.cleared.
S188 Failures: delete error.
S188 Recovery: warn.
S188 Tests: unit test lock removal.
S189 Title: Recovery: alert operator when cleanup fails repeatedly.
S189 Preconditions: repeated cleanup errors.
S189 Inputs: error count.
S189 Actions: emit alert log.
S189 Outputs: alert visible.
S189 Logs: log alert with errors.
S189 Metrics: recovery.cleanup.alert.
S189 Failures: logging error.
S189 Recovery: fallback to stderr.
S189 Tests: unit test alert emission.
S190 Title: Recovery: provide safe mode for manual repair.
S190 Preconditions: user opts in.
S190 Inputs: safe mode flag.
S190 Actions: disable parallel execution.
S190 Outputs: serial run mode.
S190 Logs: log safe mode enabled.
S190 Metrics: recovery.safe.mode.
S190 Failures: none.
S190 Recovery: none.
S190 Tests: unit test safe mode.
S191 Title: Recovery: export diagnostics bundle.
S191 Preconditions: error occurred.
S191 Inputs: logs and worktree list.
S191 Actions: package into archive.
S191 Outputs: diagnostics bundle.
S191 Logs: log bundle path.
S191 Metrics: recovery.diagnostics.count.
S191 Failures: archive error.
S191 Recovery: log warning.
S191 Tests: integration test diagnostics bundle.
S192 Title: Recovery: throttle repeated failure logs.
S192 Preconditions: repeated failures.
S192 Inputs: failure rate.
S192 Actions: rate limit logs.
S192 Outputs: reduced log spam.
S192 Logs: log throttling.
S192 Metrics: recovery.log.throttle.
S192 Failures: none.
S192 Recovery: none.
S192 Tests: unit test throttle.
S193 Title: Recovery: ensure cleanup does not run concurrently.
S193 Preconditions: cleanup in progress.
S193 Inputs: cleanup mutex.
S193 Actions: skip or queue subsequent cleanup.
S193 Outputs: single cleanup at a time.
S193 Logs: log skipped cleanup.
S193 Metrics: recovery.cleanup.concurrent.
S193 Failures: none.
S193 Recovery: none.
S193 Tests: unit test concurrent cleanup.
S194 Title: Recovery: validate worktree list after cleanup.
S194 Preconditions: cleanup complete.
S194 Inputs: listWorktrees.
S194 Actions: verify no stale/prunable.
S194 Outputs: verification report.
S194 Logs: log verification results.
S194 Metrics: recovery.cleanup.verify.
S194 Failures: stale remains.
S194 Recovery: run prune.
S194 Tests: integration test cleanup verify.
S195 Title: Recovery: enforce no conflict markers in repo after merge.
S195 Preconditions: merge completed.
S195 Inputs: git grep for markers.
S195 Actions: scan repo for markers.
S195 Outputs: pass or fail.
S195 Logs: log marker detection.
S195 Metrics: recovery.marker.scan.
S195 Failures: markers found.
S195 Recovery: abort run and alert.
S195 Tests: integration test marker scan.
S196 Title: Recovery: verify no untracked worktrees remain.
S196 Preconditions: cleanup done.
S196 Inputs: git worktree list.
S196 Actions: compare with expected workers.
S196 Outputs: verification result.
S196 Logs: log leftover worktrees.
S196 Metrics: recovery.worktree.leftover.
S196 Failures: leftovers found.
S196 Recovery: prune and remove.
S196 Tests: integration test leftover detection.
S197 Title: Recovery: enforce lock timeout default when missing.
S197 Preconditions: staleLockTimeoutMinutes undefined.
S197 Inputs: default value.
S197 Actions: use default timeout.
S197 Outputs: timeout set.
S197 Logs: log default usage.
S197 Metrics: recovery.lock.timeout.default.
S197 Failures: none.
S197 Recovery: none.
S197 Tests: unit test default behavior.
S198 Title: Recovery: ensure cleanup errors are visible to operator.
S198 Preconditions: cleanup errors exist.
S198 Inputs: error list.
S198 Actions: surface in logs and UI.
S198 Outputs: operator aware.
S198 Logs: log cleanup errors.
S198 Metrics: recovery.cleanup.visible.
S198 Failures: none.
S198 Recovery: none.
S198 Tests: UI test for cleanup warnings.
S199 Title: Recovery: keep worktree health consistent after recovery.
S199 Preconditions: recovery complete.
S199 Inputs: health summary.
S199 Actions: refresh and reconcile.
S199 Outputs: accurate counts.
S199 Logs: log health post recovery.
S199 Metrics: recovery.health.updated.
S199 Failures: refresh error.
S199 Recovery: log warning.
S199 Tests: integration test recovery health.
S200 Title: Recovery: document manual recovery commands.
S200 Preconditions: documentation updates needed.
S200 Inputs: runbook content.
S200 Actions: update docs with commands.
S200 Outputs: docs updated.
S200 Logs: none.
S200 Metrics: docs.recovery.updated.
S200 Failures: none.
S200 Recovery: none.
S200 Tests: doc review.

## Ownership, Timeline, and Location Ledger
Format: L### Step S### When: W#D# Who: ROLE Where: PATHS What: per S### title.
L001 Step S001 When: W1D1 Who: Core/Runtime Where: src/config/index.ts, src/config/types.ts, src/commands/run.tsx What: per S001 title.
L002 Step S002 When: W1D1 Who: Core/Runtime Where: src/config/schema.ts, src/config/index.ts What: per S002 title.
L003 Step S003 When: W1D1 Who: Core/Runtime Where: src/commands/run.tsx, src/utils/version.ts What: per S003 title.
L004 Step S004 When: W1D1 Who: Core/Runtime Where: src/engine/parallel/worktree-manager.ts What: per S004 title.
L005 Step S005 When: W1D1 Who: Core/Runtime Where: src/engine/parallel/worktree-manager.ts What: per S005 title.
L006 Step S006 When: W1D1 Who: Core/Runtime Where: src/session/index.ts What: per S006 title.
L007 Step S007 When: W1D1 Who: Core/Runtime Where: src/plugins/trackers/* What: per S007 title.
L008 Step S008 When: W1D1 Who: Core/Runtime Where: src/plugins/agents/* What: per S008 title.
L009 Step S009 When: W1D1 Who: Core/Runtime Where: src/engine/parallel/index.ts What: per S009 title.
L010 Step S010 When: W1D1 Who: Core/Runtime Where: src/commands/run.tsx, src/tui/components/RunApp.tsx What: per S010 title.
L011 Step S011 When: W1D2 Who: Core/Runtime Where: src/commands/run.tsx, src/logs/index.ts What: per S011 title.
L012 Step S012 When: W1D2 Who: Core/Runtime Where: src/notifications.ts What: per S012 title.
L013 Step S013 When: W1D2 Who: Core/Runtime Where: src/commands/run.tsx, src/logs/index.ts What: per S013 title.
L014 Step S014 When: W1D2 Who: Core/Runtime Where: src/tui/components/RunApp.tsx What: per S014 title.
L015 Step S015 When: W1D2 Who: Core/Runtime Where: src/commands/run.tsx What: per S015 title.
L016 Step S016 When: W1D2 Who: Core/Runtime Where: src/engine/parallel/worktree-manager.ts What: per S016 title.
L017 Step S017 When: W1D2 Who: Core/Runtime Where: src/tui/components/RunApp.tsx What: per S017 title.
L018 Step S018 When: W1D2 Who: Core/Runtime Where: src/tui/components/RunApp.tsx What: per S018 title.
L019 Step S019 When: W1D2 Who: Core/Runtime Where: src/engine/parallel/coordinator.ts What: per S019 title.
L020 Step S020 When: W1D2 Who: Core/Runtime Where: src/tui/components/RunApp.tsx What: per S020 title.
L021 Step S021 When: W1D3 Who: Core/Session Where: src/session/lock.ts, src/commands/run.tsx What: per S021 title.
L022 Step S022 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S022 title.
L023 Step S023 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S023 title.
L024 Step S024 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S024 title.
L025 Step S025 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S025 title.
L026 Step S026 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S026 title.
L027 Step S027 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S027 title.
L028 Step S028 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S028 title.
L029 Step S029 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S029 title.
L030 Step S030 When: W1D3 Who: Core/Session Where: src/session/lock.ts What: per S030 title.
L031 Step S031 When: W1D4 Who: Core/Session Where: src/session/lock.ts What: per S031 title.
L032 Step S032 When: W1D4 Who: Core/Session Where: src/session/lock.ts What: per S032 title.
L033 Step S033 When: W1D4 Who: Core/Session Where: src/engine/parallel/worktree-manager.ts What: per S033 title.
L034 Step S034 When: W1D4 Who: Core/Session Where: src/engine/parallel/worktree-manager.ts What: per S034 title.
L035 Step S035 When: W1D4 Who: Core/Session Where: src/session/lock.ts What: per S035 title.
L036 Step S036 When: W1D4 Who: Core/Session Where: src/commands/run.tsx What: per S036 title.
L037 Step S037 When: W1D4 Who: Core/Session Where: src/commands/run.tsx What: per S037 title.
L038 Step S038 When: W1D4 Who: Core/Session Where: src/session/lock.ts, src/logs/index.ts What: per S038 title.
L039 Step S039 When: W1D4 Who: Core/Session Where: src/commands/run.tsx, src/session/lock.ts What: per S039 title.
L040 Step S040 When: W1D4 Who: Core/Session Where: docs/* What: per S040 title.
L041 Step S041 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S041 title.
L042 Step S042 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S042 title.
L043 Step S043 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S043 title.
L044 Step S044 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S044 title.
L045 Step S045 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S045 title.
L046 Step S046 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S046 title.
L047 Step S047 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S047 title.
L048 Step S048 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S048 title.
L049 Step S049 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S049 title.
L050 Step S050 When: W1D5 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S050 title.
L051 Step S051 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S051 title.
L052 Step S052 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S052 title.
L053 Step S053 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S053 title.
L054 Step S054 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S054 title.
L055 Step S055 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S055 title.
L056 Step S056 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S056 title.
L057 Step S057 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S057 title.
L058 Step S058 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S058 title.
L059 Step S059 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S059 title.
L060 Step S060 When: W2D1 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S060 title.
L061 Step S061 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S061 title.
L062 Step S062 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S062 title.
L063 Step S063 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S063 title.
L064 Step S064 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S064 title.
L065 Step S065 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S065 title.
L066 Step S066 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S066 title.
L067 Step S067 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S067 title.
L068 Step S068 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S068 title.
L069 Step S069 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S069 title.
L070 Step S070 When: W2D2 Who: Core/Worktree Where: src/engine/parallel/worktree-manager.ts What: per S070 title.
L071 Step S071 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S071 title.
L072 Step S072 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S072 title.
L073 Step S073 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S073 title.
L074 Step S074 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts, src/tui/components/RunApp.tsx What: per S074 title.
L075 Step S075 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S075 title.
L076 Step S076 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/worktree-manager.ts What: per S076 title.
L077 Step S077 When: W2D3 Who: Core/Parallel Where: src/tui/components/RunApp.tsx What: per S077 title.
L078 Step S078 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S078 title.
L079 Step S079 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S079 title.
L080 Step S080 When: W2D3 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S080 title.
L081 Step S081 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S081 title.
L082 Step S082 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S082 title.
L083 Step S083 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S083 title.
L084 Step S084 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S084 title.
L085 Step S085 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S085 title.
L086 Step S086 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S086 title.
L087 Step S087 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S087 title.
L088 Step S088 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S088 title.
L089 Step S089 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S089 title.
L090 Step S090 When: W2D4 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S090 title.
L091 Step S091 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S091 title.
L092 Step S092 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S092 title.
L093 Step S093 When: W2D5 Who: Core/Parallel Where: src/tui/components/RunSummaryOverlay.tsx What: per S093 title.
L094 Step S094 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S094 title.
L095 Step S095 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts, src/tui/components/RunSummaryOverlay.tsx What: per S095 title.
L096 Step S096 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S096 title.
L097 Step S097 When: W2D5 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S097 title.
L098 Step S098 When: W2D5 Who: Core/Parallel Where: src/tui/components/ActivityLog.tsx What: per S098 title.
L099 Step S099 When: W2D5 Who: Core/Parallel Where: src/tui/components/RunApp.tsx What: per S099 title.
L100 Step S100 When: W2D5 Who: Core/Parallel Where: src/logs/index.ts What: per S100 title.
L101 Step S101 When: W3D1 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S101 title.
L102 Step S102 When: W3D1 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S102 title.
L103 Step S103 When: W3D1 Who: Core/Parallel Where: src/commands/run.tsx What: per S103 title.
L104 Step S104 When: W3D1 Who: Core/Parallel Where: src/session/index.ts What: per S104 title.
L105 Step S105 When: W3D1 Who: Core/Parallel Where: src/session/index.ts What: per S105 title.
L106 Step S106 When: W3D1 Who: Core/Parallel Where: src/session/index.ts What: per S106 title.
L107 Step S107 When: W3D1 Who: Core/Parallel Where: src/tui/components/SubagentTreePanel.tsx What: per S107 title.
L108 Step S108 When: W3D1 Who: Core/Parallel Where: src/tui/components/RunApp.tsx What: per S108 title.
L109 Step S109 When: W3D1 Who: Core/Parallel Where: src/tui/components/RunApp.tsx What: per S109 title.
L110 Step S110 When: W3D1 Who: Core/Parallel Where: src/tui/components/RunApp.tsx What: per S110 title.
L111 Step S111 When: W3D2 Who: Core/Parallel Where: src/logs/index.ts, src/tui/components/RunSummaryOverlay.tsx What: per S111 title.
L112 Step S112 When: W3D2 Who: Core/Parallel Where: src/tui/components/RunSummaryOverlay.tsx What: per S112 title.
L113 Step S113 When: W3D2 Who: Core/Parallel Where: src/engine/parallel/coordinator.ts What: per S113 title.
L114 Step S114 When: W3D2 Who: Core/Parallel Where: src/tui/components/RunSummaryOverlay.tsx What: per S114 title.
L115 Step S115 When: W3D2 Who: Core/Parallel Where: src/engine/parallel/index.ts What: per S115 title.
L116 Step S116 When: W3D2 Who: Core/Parallel Where: src/commands/run.tsx, src/worktree-cleanup/index.ts What: per S116 title.
L117 Step S117 When: W3D2 Who: Core/Parallel Where: src/commands/run.tsx, src/worktree-cleanup/index.ts What: per S117 title.
L118 Step S118 When: W3D2 Who: Core/Parallel Where: src/commands/run.tsx, src/worktree-cleanup/index.ts What: per S118 title.
L119 Step S119 When: W3D2 Who: Core/Parallel Where: src/worktree-cleanup/index.ts What: per S119 title.
L120 Step S120 When: W3D2 Who: Core/Parallel Where: src/worktree-cleanup/index.ts What: per S120 title.
L121 Step S121 When: W3D3 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S121 title.
L122 Step S122 When: W3D3 Who: TUI/UX Where: src/tui/components/ProgressDashboard.tsx What: per S122 title.
L123 Step S123 When: W3D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S123 title.
L124 Step S124 When: W3D3 Who: TUI/UX Where: src/tui/components/ProgressDashboard.tsx What: per S124 title.
L125 Step S125 When: W3D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S125 title.
L126 Step S126 When: W3D3 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S126 title.
L127 Step S127 When: W3D3 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S127 title.
L128 Step S128 When: W3D3 Who: TUI/UX Where: src/tui/components/ProgressDashboard.tsx What: per S128 title.
L129 Step S129 When: W3D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S129 title.
L130 Step S130 When: W3D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S130 title.
L131 Step S131 When: W3D4 Who: TUI/UX Where: src/tui/components/ActivityLog.tsx What: per S131 title.
L132 Step S132 When: W3D4 Who: TUI/UX Where: src/tui/components/ActivityLog.tsx What: per S132 title.
L133 Step S133 When: W3D4 Who: TUI/UX Where: src/tui/components/RunSummaryOverlay.tsx What: per S133 title.
L134 Step S134 When: W3D4 Who: TUI/UX Where: src/tui/components/Footer.tsx What: per S134 title.
L135 Step S135 When: W3D4 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S135 title.
L136 Step S136 When: W3D4 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S136 title.
L137 Step S137 When: W3D4 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S137 title.
L138 Step S138 When: W3D4 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S138 title.
L139 Step S139 When: W3D4 Who: TUI/UX Where: src/tui/components/ActivityView.tsx What: per S139 title.
L140 Step S140 When: W3D4 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S140 title.
L141 Step S141 When: W3D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts, docs/* What: per S141 title.
L142 Step S142 When: W3D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S142 title.
L143 Step S143 When: W3D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts, docs/* What: per S143 title.
L144 Step S144 When: W3D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S144 title.
L145 Step S145 When: W3D5 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S145 title.
L146 Step S146 When: W3D5 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S146 title.
L147 Step S147 When: W3D5 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S147 title.
L148 Step S148 When: W3D5 Who: Ops/Recovery Where: src/commands/run.tsx What: per S148 title.
L149 Step S149 When: W3D5 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S149 title.
L150 Step S150 When: W3D5 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S150 title.
L151 Step S151 When: W4D1 Who: Ops/Recovery Where: src/plugins/trackers/* What: per S151 title.
L152 Step S152 When: W4D1 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S152 title.
L153 Step S153 When: W4D1 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S153 title.
L154 Step S154 When: W4D1 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S154 title.
L155 Step S155 When: W4D1 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S155 title.
L156 Step S156 When: W4D1 Who: Ops/Recovery Where: docs/* What: per S156 title.
L157 Step S157 When: W4D1 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S157 title.
L158 Step S158 When: W4D1 Who: Ops/Recovery Where: src/config/types.ts What: per S158 title.
L159 Step S159 When: W4D1 Who: Ops/Recovery Where: src/config/types.ts What: per S159 title.
L160 Step S160 When: W4D1 Who: Ops/Recovery Where: docs/* What: per S160 title.
L161 Step S161 When: W4D2 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S161 title.
L162 Step S162 When: W4D2 Who: TUI/UX Where: src/tui/components/ProgressDashboard.tsx What: per S162 title.
L163 Step S163 When: W4D2 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S163 title.
L164 Step S164 When: W4D2 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S164 title.
L165 Step S165 When: W4D2 Who: TUI/UX Where: src/tui/components/RunSummaryOverlay.tsx What: per S165 title.
L166 Step S166 When: W4D2 Who: TUI/UX Where: src/tui/components/Footer.tsx What: per S166 title.
L167 Step S167 When: W4D2 Who: TUI/UX Where: src/tui/components/TaskCardsRow.tsx What: per S167 title.
L168 Step S168 When: W4D2 Who: TUI/UX Where: src/tui/components/ProgressDashboard.tsx What: per S168 title.
L169 Step S169 When: W4D2 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S169 title.
L170 Step S170 When: W4D2 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S170 title.
L171 Step S171 When: W4D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S171 title.
L172 Step S172 When: W4D3 Who: TUI/UX Where: src/tui/components/HelpOverlay.tsx What: per S172 title.
L173 Step S173 When: W4D3 Who: TUI/UX Where: src/tui/components/TaskCardsRow.tsx What: per S173 title.
L174 Step S174 When: W4D3 Who: TUI/UX Where: src/tui/components/HelpOverlay.tsx What: per S174 title.
L175 Step S175 When: W4D3 Who: TUI/UX Where: src/tui/components/RunApp.tsx What: per S175 title.
L176 Step S176 When: W4D3 Who: TUI/UX Where: src/tui/components/ActivityView.tsx What: per S176 title.
L177 Step S177 When: W4D3 Who: TUI/UX Where: src/tui/components/* What: per S177 title.
L178 Step S178 When: W4D3 Who: TUI/UX Where: src/tui/components/DashboardBanner.tsx What: per S178 title.
L179 Step S179 When: W4D3 Who: TUI/UX Where: src/tui/components/ActivityView.tsx What: per S179 title.
L180 Step S180 When: W4D3 Who: TUI/UX Where: src/tui/components/ActivityView.tsx What: per S180 title.
L181 Step S181 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S181 title.
L182 Step S182 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S182 title.
L183 Step S183 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts, src/session/lock.ts What: per S183 title.
L184 Step S184 When: W4D4 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S184 title.
L185 Step S185 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S185 title.
L186 Step S186 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S186 title.
L187 Step S187 When: W4D4 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S187 title.
L188 Step S188 When: W4D4 Who: Ops/Recovery Where: src/session/lock.ts What: per S188 title.
L189 Step S189 When: W4D4 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S189 title.
L190 Step S190 When: W4D4 Who: Ops/Recovery Where: src/config/types.ts What: per S190 title.
L191 Step S191 When: W4D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts, logs/* What: per S191 title.
L192 Step S192 When: W4D5 Who: Ops/Recovery Where: src/logs/index.ts What: per S192 title.
L193 Step S193 When: W4D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S193 title.
L194 Step S194 When: W4D5 Who: Ops/Recovery Where: src/worktree-cleanup/index.ts What: per S194 title.
L195 Step S195 When: W4D5 Who: Ops/Recovery Where: src/engine/parallel/coordinator.ts What: per S195 title.
L196 Step S196 When: W4D5 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S196 title.
L197 Step S197 When: W4D5 Who: Ops/Recovery Where: src/session/lock.ts What: per S197 title.
L198 Step S198 When: W4D5 Who: Ops/Recovery Where: src/tui/components/RunApp.tsx, src/logs/index.ts What: per S198 title.
L199 Step S199 When: W4D5 Who: Ops/Recovery Where: src/engine/parallel/worktree-manager.ts What: per S199 title.
L200 Step S200 When: W4D5 Who: Ops/Recovery Where: docs/* What: per S200 title.
