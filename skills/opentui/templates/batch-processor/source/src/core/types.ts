// CLI Options passed from command line
export interface CLIOptions {
  input?: string;
  recursive: boolean;
  concurrency: number;
  dryRun: boolean;
  verbose: boolean;
}

// Job Status
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// Job Definition
export interface Job {
  id: string;
  inputPath: string;
  outputPath?: string;
  status: JobStatus;
  progress: number;
  error?: string;
  startTime?: number;
  endTime?: number;
  outputSize?: number;
}

// Application Status
export type AppStatus = 'idle' | 'scanning' | 'processing' | 'completed' | 'cancelled' | 'error';

// Scan Result
export interface ScanResult {
  filesToProcess: string[];
  skipped: number;
  totalFound: number;
}
