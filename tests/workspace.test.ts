import test from "node:test";
import assert from "node:assert/strict";
import {
  actionDifferences,
  commonPoints,
  comparisonIssue,
  configKey,
  copyModel,
  createModel,
  importModel,
  loadWorkspace,
  makeConfig,
  original,
  resize,
  samePoint,
  status,
  STORAGE_KEY,
} from "../src/lib/workspace.ts";

test("equivalent polynomial input retains an actual result, numerical changes invalidate it", () => {
  const m = createModel("linear");
  m.draft.matrix[0][0] = "0.1t + 2";
  assert.equal(status(m), "ready");
  m.draft.matrix[0][0] = "0.2t + 2";
  assert.equal(status(m), "stale");
});
test("copying creates an independent model and resizing keeps dimensions and labels aligned", () => {
  const a = createModel("linear"),
    b = copyModel(a);
  b.draft.matrix[0][0] = "9";
  assert.notEqual(a.id, b.id);
  assert.equal(a.draft.matrix[0][0], original.matrix[0][0]);
  const c = resize(b, 2, 4);
  assert.equal(c.draft.matrix.length, 2);
  assert.equal(c.draft.matrix[0].length, 4);
  assert.deepEqual(
    c.context.actions.map((v) => v.length),
    [2, 4],
  );
  assert.equal(status(c), "stale");
});
test("comparison rejects mismatched units and stale results", () => {
  const a = createModel("linear"),
    b = copyModel(a);
  assert.equal(comparisonIssue(a, b), "");
  assert.equal(commonPoints(a, b).length, 21);
  b.context.unit = "руб.";
  assert.match(comparisonIssue(a, b), /единицы/);
  b.context.unit = a.context.unit;
  b.draft.step = "2";
  assert.match(comparisonIssue(a, b), /актуальные/);
});
test("comparison uses common exact points, not nearest times or unrelated action indexes", () => {
  const a = createModel("linear"),
    b = copyModel(a);
  b.snapshot!.result.samples = b.snapshot!.result.samples.map((p) => ({
    ...p,
    t: p.t + 0.5,
  }));
  assert.equal(commonPoints(a, b).length, 0);
  assert.equal(samePoint(1e-10, 5e-10), false);
  assert.equal(samePoint(0.3, 0.1 + 0.2), true);
  const delta = actionDifferences(
    ["A", "B"],
    [0.2, 0.8],
    ["B", "A", "C"],
    [0.5, 0.4, 0.1],
  );
  assert.equal(delta[0].delta, 0.2);
  assert.equal(delta[2].base, null);
});

test("reloading preserves exact calculation weights and does not invalidate a current result", () => {
  const m = createModel("linear");
  m.draft.weights = ["0.1", "0.2", "0.3"];
  m.snapshot!.config = makeConfig(m.draft);
  const restored = importModel(
    JSON.parse(JSON.stringify({ version: 2, model: m })),
  );
  assert.equal(status(restored), "ready");
  assert.deepEqual(
    restored.snapshot!.config.weights,
    m.snapshot!.config.weights,
  );
});
test("workspace imports previous settings and results and retains intentionally empty libraries", () => {
  const old = importModel({ version: 1, draft: original });
  assert.equal(
    configKey(makeConfig(old.draft)),
    configKey(makeConfig(original)),
  );
  const m = createModel("linear"),
    restored = importModel({ version: 2, model: m });
  assert.equal(status(restored), "ready");
  assert.notEqual(restored.id, m.id);
  const migrated = loadWorkspace({
    getItem: (key) =>
      key === "parametr-draft-v1" ? JSON.stringify(original) : null,
  });
  assert.equal(migrated.length, 1);
  assert.equal(status(migrated[0]), "ready");
  assert.deepEqual(
    loadWorkspace({
      getItem: (key) =>
        key === STORAGE_KEY ? JSON.stringify({ models: [] }) : null,
    }),
    [],
  );
});
test("malformed imported result is discarded while its editable model is preserved", () => {
  const m = createModel("linear");
  m.snapshot!.result.samples[0].x = [1];
  const imported = importModel({ version: 2, model: m });
  assert.equal(imported.snapshot, undefined);
  assert.equal(imported.draft.matrix.length, 3);
});
