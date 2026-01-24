/**
 * ABOUTME: Worktree manager types for parallel execution.
 */

export type WorktreeHealthStatus = 'active' | 'locked' | 'stale' | 'prunable';

export interface WorktreeStatus {
  path: string;
  relativePath: string;
  commit: string;
  branch: string;
  locked: boolean;
  lockReason?: string;
  prunableReason?: string;
  status: WorktreeHealthStatus;
  bare?: boolean;
}

export interface WorktreeHealthSummary {
  total: number;
  active: number;
  locked: number;
  stale: number;
  prunable: number;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface WorktreeManagerOptions {
  repoRoot: string;
  worktreesDir?: string;
  maxConcurrency?: number;
  gitTimeoutMs?: number;
  ephemeralBranchPrefixes?: string[];
  lockOnCreate?: boolean;
}

export interface CreateWorktreeOptions {
  workerId: string;
  branchName: string;
  baseRef?: string;
  lockReason?: string;
}

export interface WorktreeValidationResult {
  valid: boolean;
  currentBranch?: string;
  currentCommit?: string;
  expectedBranch?: string;
  expectedCommit?: string;
  error?: string;
}

export interface ManagedMetadataV1 {
  schemaVersion: 1;
  tool: string;
  repoRoot: string;
  worktreePath: string;
  workerId: string;
  branchName: string;
  baseRef: string;
  expectedCommit: string;
  createdAt: string;
  host: string;
  pid: number;
}
