/**
 * AstroChronoscope Synchronous Operation Monitor
 *
 * Tracks the real-time lifecycle of synchronous API requests initiated by the frontend:
 * IDLE → RUNNING → COMPLETED (or FAILED)
 *
 * Operates without fictitious background queues, fake polling, or fabricated percentages.
 */

import { useSyncExternalStore } from "react";

export type OperationStatus = "running" | "completed" | "failed";

export type OperationCategory =
  | "discovery"
  | "explorer"
  | "differential"
  | "timedomain"
  | "telemetry"
  | "reports";

export type WorkspaceTab =
  | "discovery"
  | "explorer"
  | "differential"
  | "timedomain"
  | "reports"
  | "jobs";

export interface OperationTargetContext {
  ra?: number | string | null;
  dec?: number | string | null;
  radius?: number | string | null;
  observationId?: string | null;
  sourceId?: string | null;
  spectrumId?: string | null;
  label?: string | null;
}

export interface CreateOperationInput {
  name: string;
  category: OperationCategory;
  workspace: WorkspaceTab;
  context?: OperationTargetContext;
  dedupKey?: string;
}

export interface OperationErrorDetails {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface MonitoredOperation {
  id: string;
  name: string;
  category: OperationCategory;
  workspace: WorkspaceTab;
  context?: OperationTargetContext;
  status: OperationStatus;
  startTime: string; // UTC ISO string
  startTimestamp: number; // performance.now()
  endTime?: string | null;
  durationMs?: number | null;
  error?: OperationErrorDetails | null;
  dedupKey?: string;
}

export class DuplicateOperationError extends Error {
  code = "DUPLICATE_OPERATION";
  constructor(message: string) {
    super(message);
    this.name = "DuplicateOperationError";
  }
}

type Listener = (operations: MonitoredOperation[]) => void;

class OperationMonitorStore {
  private operations: MonitoredOperation[] = [];
  private cachedSnapshot: MonitoredOperation[] = [];
  private listeners: Set<Listener> = new Set();
  private nextOpNumber: number = 1;
  private readonly maxHistory: number = 100;

  constructor() {
    this.cachedSnapshot = [];
  }

  /**
   * Subscribe to operation state updates. Returns an unsubscribe function.
   */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    // Immediately emit current state to new listener
    listener(this.cachedSnapshot);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.cachedSnapshot = [...this.operations];
    for (const listener of this.listeners) {
      listener(this.cachedSnapshot);
    }
  }

  /**
   * Get an immutable snapshot of all tracked operations.
   */
  getOperations = (): MonitoredOperation[] => {
    return this.cachedSnapshot;
  };

  /**
   * Get currently running operations.
   */
  getRunningOperations(): MonitoredOperation[] {
    return this.operations.filter((op) => op.status === "running");
  }

  /**
   * Check whether an active operation with the given deduplication key is running.
   */
  isDuplicateRunning(dedupKey?: string): boolean {
    if (!dedupKey) return false;
    return this.operations.some(
      (op) => op.status === "running" && op.dedupKey === dedupKey
    );
  }

  /**
   * Register a new operation right before the API request initiates.
   */
  registerOperation(input: CreateOperationInput): MonitoredOperation {
    if (input.dedupKey && this.isDuplicateRunning(input.dedupKey)) {
      throw new DuplicateOperationError(
        `Operation '${input.name}' is already running.`
      );
    }

    const id = `OP-${String(this.nextOpNumber++).padStart(4, "0")}`;
    const now = new Date();
    const utcString = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";

    const operation: MonitoredOperation = {
      id,
      name: input.name,
      category: input.category,
      workspace: input.workspace,
      context: input.context,
      status: "running",
      startTime: utcString,
      startTimestamp: performance.now(),
      endTime: null,
      durationMs: null,
      error: null,
      dedupKey: input.dedupKey,
    };

    // Prepend new operation to top of ledger
    this.operations = [operation, ...this.operations];
    this.enforceHistoryLimit();
    this.notify();
    return operation;
  }

  /**
   * Mark an operation as completed upon successful API return.
   */
  completeOperation(operationId: string): void {
    const op = this.operations.find((o) => o.id === operationId);
    if (!op || op.status !== "running") return;

    const now = new Date();
    const duration = Math.round(performance.now() - op.startTimestamp);

    op.status = "completed";
    op.endTime = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    op.durationMs = Math.max(0, duration);
    this.notify();
  }

  /**
   * Mark an operation as failed when an API request throws.
   */
  failOperation(operationId: string, err: unknown): void {
    const op = this.operations.find((o) => o.id === operationId);
    if (!op || op.status !== "running") return;

    const now = new Date();
    const duration = Math.round(performance.now() - op.startTimestamp);

    const errorDetails: OperationErrorDetails = {
      message: err instanceof Error ? err.message : String(err),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      code: (err as any)?.code,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: (err as any)?.status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: (err as any)?.details,
    };

    op.status = "failed";
    op.endTime = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    op.durationMs = Math.max(0, duration);
    op.error = errorDetails;
    this.notify();
  }

  /**
   * Reusable wrapper tracking any synchronous API request lifecycle.
   */
  async executeOperation<T>(
    input: CreateOperationInput,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const operation = this.registerOperation(input);
    try {
      const result = await requestFn();
      this.completeOperation(operation.id);
      return result;
    } catch (error) {
      this.failOperation(operation.id, error);
      throw error; // Never swallow exceptions
    }
  }

  /**
   * Clear completed records.
   */
  clearCompleted(): void {
    this.operations = this.operations.filter((op) => op.status !== "completed");
    this.notify();
  }

  /**
   * Clear failed records.
   */
  clearFailed(): void {
    this.operations = this.operations.filter((op) => op.status !== "failed");
    this.notify();
  }

  /**
   * Clear all non-running records.
   */
  clearAllHistory(): void {
    this.operations = this.operations.filter((op) => op.status === "running");
    this.notify();
  }

  /**
   * Reset store entirely (useful for tests).
   */
  reset(): void {
    this.operations = [];
    this.cachedSnapshot = [];
    this.nextOpNumber = 1;
    this.listeners.clear();
  }

  private enforceHistoryLimit(): void {
    if (this.operations.length <= this.maxHistory) return;
    // Retain all running operations, evict oldest finished ones
    const running = this.operations.filter((op) => op.status === "running");
    const finished = this.operations.filter((op) => op.status !== "running");
    const allowedFinished = Math.max(0, this.maxHistory - running.length);
    this.operations = [...running, ...finished.slice(0, allowedFinished)];
  }
}

export const operationMonitor = new OperationMonitorStore();

/**
 * React hook to subscribe to synchronous operation monitor state.
 */
export function useOperationMonitor() {
  const operations = useSyncExternalStore(
    operationMonitor.subscribe,
    operationMonitor.getOperations
  );

  const running = operations.filter((op) => op.status === "running");
  const completed = operations.filter((op) => op.status === "completed");
  const failed = operations.filter((op) => op.status === "failed");

  return {
    operations,
    running,
    completed,
    failed,
    runningCount: running.length,
    completedCount: completed.length,
    failedCount: failed.length,
    totalCount: operations.length,
    clearCompleted: () => operationMonitor.clearCompleted(),
    clearFailed: () => operationMonitor.clearFailed(),
    clearAllHistory: () => operationMonitor.clearAllHistory(),
  };
}
