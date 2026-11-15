import test from "node:test";
import assert from "node:assert/strict";

import {
  operationMonitor,
  DuplicateOperationError,
  type MonitoredOperation,
} from "../src/lib/operationMonitor.ts";

test.beforeEach(() => {
  operationMonitor.reset();
});

test("Synchronous Operation Monitor Store", async (t) => {
  await t.test("initial state is clean and empty", () => {
    assert.strictEqual(operationMonitor.getOperations().length, 0);
    assert.strictEqual(operationMonitor.getRunningOperations().length, 0);
  });

  await t.test("registerOperation creates running operation with sequential OP ID", () => {
    const op1 = operationMonitor.registerOperation({
      name: "SIA2 Query",
      category: "discovery",
      workspace: "discovery",
      context: { ra: 156.09, dec: -41.64 },
    });

    assert.strictEqual(op1.id, "OP-0001");
    assert.strictEqual(op1.status, "running");
    assert.strictEqual(op1.name, "SIA2 Query");
    assert.strictEqual(op1.category, "discovery");
    assert.strictEqual(op1.workspace, "discovery");
    assert.ok(op1.startTime.includes("UTC"));
    assert.ok(op1.startTimestamp > 0);
    assert.strictEqual(op1.endTime, null);
    assert.strictEqual(op1.durationMs, null);
    assert.strictEqual(op1.error, null);

    const op2 = operationMonitor.registerOperation({
      name: "Cutout Extraction",
      category: "explorer",
      workspace: "explorer",
    });

    assert.strictEqual(op2.id, "OP-0002");
    assert.strictEqual(operationMonitor.getOperations().length, 2);
    // Newest prepended
    assert.strictEqual(operationMonitor.getOperations()[0].id, "OP-0002");
    assert.strictEqual(operationMonitor.getOperations()[1].id, "OP-0001");
  });

  await t.test("completeOperation transitions status to completed with duration", async () => {
    const op = operationMonitor.registerOperation({
      name: "FITS Header Inspect",
      category: "explorer",
      workspace: "explorer",
    });

    // Small delay to ensure positive duration
    await new Promise((r) => setTimeout(r, 15));

    operationMonitor.completeOperation(op.id);

    const updated = operationMonitor.getOperations().find((o) => o.id === op.id);
    assert.ok(updated);
    assert.strictEqual(updated.status, "completed");
    assert.ok(updated.endTime);
    assert.ok(typeof updated.durationMs === "number" && updated.durationMs >= 10);
    assert.strictEqual(updated.error, null);
  });

  await t.test("failOperation transitions status to failed with error details", async () => {
    const op = operationMonitor.registerOperation({
      name: "Reprojection Diff",
      category: "differential",
      workspace: "differential",
    });

    await new Promise((r) => setTimeout(r, 10));

    const simulatedErr = new Error("WCS Distortion matrix singular");
    (simulatedErr as any).code = "ERR_WCS_SINGULAR";
    (simulatedErr as any).status = 422;

    operationMonitor.failOperation(op.id, simulatedErr);

    const updated = operationMonitor.getOperations().find((o) => o.id === op.id);
    assert.ok(updated);
    assert.strictEqual(updated.status, "failed");
    assert.ok(updated.endTime);
    assert.ok(typeof updated.durationMs === "number");
    assert.ok(updated.error);
    assert.strictEqual(updated.error?.message, "WCS Distortion matrix singular");
    assert.strictEqual(updated.error?.code, "ERR_WCS_SINGULAR");
    assert.strictEqual(updated.error?.status, 422);
  });

  await t.test("executeOperation tracks successful promise lifecycle and returns result", async () => {
    const result = await operationMonitor.executeOperation(
      {
        name: "Time-Domain Light Curve",
        category: "timedomain",
        workspace: "timedomain",
        context: { sourceId: "SRC-1049" },
      },
      async () => {
        await new Promise((r) => setTimeout(r, 15));
        return { source_id: "SRC-1049", points: 14 };
      }
    );

    assert.deepStrictEqual(result, { source_id: "SRC-1049", points: 14 });

    const ops = operationMonitor.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].status, "completed");
    assert.strictEqual(ops[0].name, "Time-Domain Light Curve");
    assert.ok(ops[0].durationMs != null && ops[0].durationMs >= 10);
  });

  await t.test("executeOperation tracks failure and rethrows exception without swallowing", async () => {
    const failingCall = () =>
      operationMonitor.executeOperation(
        {
          name: "Gaia DR3 Search",
          category: "timedomain",
          workspace: "timedomain",
        },
        async () => {
          await new Promise((r) => setTimeout(r, 10));
          throw new Error("HTTP 504 Gateway Timeout");
        }
      );

    await assert.rejects(failingCall, {
      message: "HTTP 504 Gateway Timeout",
    });

    const ops = operationMonitor.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].status, "failed");
    assert.strictEqual(ops[0].error?.message, "HTTP 504 Gateway Timeout");
  });

  await t.test("deduplication prevents concurrent identical operations", async () => {
    const dedupKey = "discovery:156.09:-41.64:0.05";

    // Start first running operation
    const op1 = operationMonitor.registerOperation({
      name: "SIA2 Query 1",
      category: "discovery",
      workspace: "discovery",
      dedupKey,
    });

    assert.strictEqual(operationMonitor.isDuplicateRunning(dedupKey), true);

    // Attempting to start second identical operation while first is running throws
    assert.throws(
      () =>
        operationMonitor.registerOperation({
          name: "SIA2 Query 2",
          category: "discovery",
          workspace: "discovery",
          dedupKey,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DuplicateOperationError);
        assert.strictEqual(err.code, "DUPLICATE_OPERATION");
        return true;
      }
    );

    // Once op1 completes, duplicate check clears
    operationMonitor.completeOperation(op1.id);
    assert.strictEqual(operationMonitor.isDuplicateRunning(dedupKey), false);

    // Registering with same dedupKey now succeeds
    const op2 = operationMonitor.registerOperation({
      name: "SIA2 Query 3",
      category: "discovery",
      workspace: "discovery",
      dedupKey,
    });
    assert.strictEqual(op2.id, "OP-0002");
  });

  await t.test("enforces history limit of 100 operations while retaining running ops", () => {
    // Register 105 operations
    for (let i = 0; i < 105; i++) {
      const op = operationMonitor.registerOperation({
        name: `Op ${i}`,
        category: "reports",
        workspace: "reports",
      });
      // Complete all but the last 3
      if (i < 102) {
        operationMonitor.completeOperation(op.id);
      }
    }

    const allOps = operationMonitor.getOperations();
    assert.strictEqual(allOps.length, 100, "Store length must not exceed maxHistory (100)");

    // The 3 running operations must be retained
    const running = operationMonitor.getRunningOperations();
    assert.strictEqual(running.length, 3);
  });

  await t.test("clearing operations filters correctly", () => {
    const op1 = operationMonitor.registerOperation({ name: "Running 1", category: "discovery", workspace: "discovery" });
    const op2 = operationMonitor.registerOperation({ name: "To Complete", category: "explorer", workspace: "explorer" });
    const op3 = operationMonitor.registerOperation({ name: "To Fail", category: "differential", workspace: "differential" });

    operationMonitor.completeOperation(op2.id);
    operationMonitor.failOperation(op3.id, new Error("Failed"));

    assert.strictEqual(operationMonitor.getOperations().length, 3);

    // Clear completed removes only op2
    operationMonitor.clearCompleted();
    let ops = operationMonitor.getOperations();
    assert.strictEqual(ops.length, 2);
    assert.ok(!ops.some((o) => o.id === op2.id));
    assert.ok(ops.some((o) => o.id === op1.id));
    assert.ok(ops.some((o) => o.id === op3.id));

    // Clear failed removes op3
    operationMonitor.clearFailed();
    ops = operationMonitor.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].id, op1.id);

    // Clear history on remaining running op preserves it
    operationMonitor.clearAllHistory();
    ops = operationMonitor.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].status, "running");
  });

  await t.test("subscriber receives live updates and unsubscribe halts notifications", () => {
    let callCount = 0;
    let latestSnapshot: MonitoredOperation[] = [];

    const unsubscribe = operationMonitor.subscribe((ops) => {
      callCount++;
      latestSnapshot = ops;
    });

    // Initial emission on subscribe
    assert.strictEqual(callCount, 1);
    assert.strictEqual(latestSnapshot.length, 0);

    const op = operationMonitor.registerOperation({
      name: "Subscribed Task",
      category: "telemetry",
      workspace: "jobs",
    });

    assert.strictEqual(callCount, 2);
    assert.strictEqual(latestSnapshot.length, 1);
    assert.strictEqual(latestSnapshot[0].id, op.id);

    operationMonitor.completeOperation(op.id);
    assert.strictEqual(callCount, 3);
    assert.strictEqual(latestSnapshot[0].status, "completed");

    // Unsubscribe
    unsubscribe();

    operationMonitor.registerOperation({
      name: "Ignored Task",
      category: "telemetry",
      workspace: "jobs",
    });

    // callCount must remain 3
    assert.strictEqual(callCount, 3);
  });
});

