import type { GameConfig, GameResult, GameSample } from "../engine/types";
import { parseMatrix } from "./polynomial";
import example from "../engine/example-result.json";

export type Draft = {
  matrix: string[][];
  tMin: string;
  tMax: string;
  step: string;
  weights: [string, string, string];
};
export type ModelContext = {
  parties: [string, string];
  actions: [string[], string[]];
  parameter: string;
  parameterUnit: string;
  metric: string;
  unit: string;
};
export type Snapshot = {
  config: GameConfig;
  context: ModelContext;
  result: GameResult;
  at: string | null;
  source: "example" | "calculated";
};
export type Model = {
  id: string;
  name: string;
  description: string;
  context: ModelContext;
  draft: Draft;
  createdAt: string;
  updatedAt: string;
  snapshot?: Snapshot;
  error?: string;
};
export type Status = "ready" | "draft" | "stale" | "error";
export const STORAGE_KEY = "strategy-workspace-v2";
export const original: Draft = {
  matrix: [
    ["2 + 0.1*t", "1 - 0.05*t", "3 + 0.2*t"],
    ["1 + 0.15*t", "4 - 0.1*t", "2 + 0.05*t"],
    ["3 - 0.05*t", "2 + 0.1*t", "1 + 0.15*t"],
  ],
  tMin: "20",
  tMax: "40",
  step: "1",
  weights: ["1", "1", "1"],
};
export const presets = [
  {
    key: "blank",
    name: "Своя модель",
    description: "Задайте участников и оценки выигрышей.",
    draft: {
      matrix: [
        ["", ""],
        ["", ""],
      ],
      tMin: "0",
      tMax: "10",
      step: "1",
      weights: ["1", "1", "1"],
    } as Draft,
  },
  {
    key: "linear",
    name: "Линейный пример",
    description: "Исходная модель 3 × 3 с готовым расчётом.",
    draft: original,
  },
  {
    key: "quadratic",
    name: "Квадратичный пример",
    description: "Матрица 2 × 2 с зависимостью от t².",
    draft: {
      matrix: [
        ["2 + 0.02*t^2", "1 + 0.1*t"],
        ["3 - 0.05*t", "4 + 0.01*t^2"],
      ],
      tMin: "0",
      tMax: "10",
      step: "0.5",
      weights: ["1", "1", "1"],
    } as Draft,
  },
  {
    key: "constant",
    name: "Постоянные условия",
    description: "Матрица 3 × 3 без изменения выигрышей.",
    draft: {
      matrix: [
        ["2", "1", "3"],
        ["1", "4", "2"],
        ["3", "2", "1"],
      ],
      tMin: "0",
      tMax: "10",
      step: "1",
      weights: ["1", "1", "1"],
    } as Draft,
  },
];
export const number = (n: number, digits = 4) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
export const errorNumber = (n: number) =>
  n === 0 ? "0" : Math.abs(n) < 0.0001 ? n.toExponential(2) : number(n, 6);
export const normalizeLabel = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
export const samePoint = (a: number, b: number) =>
  a === b ||
  Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(Math.abs(a), Math.abs(b));
export const pointCount = (config: GameConfig) =>
  Math.floor((config.tMax - config.tMin) / config.step + 1e-9) + 1;

export function defaultContext(n: number, m: number): ModelContext {
  return {
    parties: ["Наша сторона", "Другая сторона"],
    actions: [
      Array.from({ length: n }, (_, i) => `Действие ${i + 1}`),
      Array.from({ length: m }, (_, i) => `Действие ${i + 1}`),
    ],
    parameter: "Параметр",
    parameterUnit: "",
    metric: "Выигрыш",
    unit: "ед.",
  };
}

export function makeConfig(draft: Draft): GameConfig {
  const { coefficients, maxDegree } = parseMatrix(draft.matrix);
  if (
    [draft.tMin, draft.tMax, draft.step, ...draft.weights].some(
      (v) => !v.trim(),
    )
  )
    throw new Error("Заполните диапазон, шаг и все три веса.");
  const [tMin, tMax, step] = [draft.tMin, draft.tMax, draft.step].map((v) =>
    Number(v.replace(",", ".")),
  );
  if (![tMin, tMax, step].every(Number.isFinite))
    throw new Error("Границы диапазона и шаг должны быть конечными числами.");
  if (tMax <= tMin)
    throw new Error("Конец диапазона должен быть больше начала.");
  if (step <= 0 || step > tMax - tMin)
    throw new Error(
      "Шаг должен быть положительным и не больше длины диапазона.",
    );
  if (Math.floor((tMax - tMin) / step + 1e-9) + 1 > 501)
    throw new Error("Увеличьте шаг: поддерживается до 501 расчётной точки.");
  const raw = draft.weights.map((v) => Number(v.replace(",", "."))),
    sum = raw.reduce((a, b) => a + b, 0);
  if (
    raw.some((v) => !Number.isFinite(v) || v < 0) ||
    !Number.isFinite(sum) ||
    sum <= 0
  )
    throw new Error(
      "Веса должны быть неотрицательными; хотя бы один — больше нуля.",
    );
  return {
    matrix: structuredClone(draft.matrix),
    coefficients,
    tMin,
    tMax,
    step,
    weights: raw.map((v) => v / sum) as GameConfig["weights"],
    degree:
      maxDegree * (Math.max(draft.matrix.length, draft.matrix[0].length) - 1),
  };
}

export function configKey(config: GameConfig) {
  return JSON.stringify([
    config.coefficients,
    config.tMin,
    config.tMax,
    config.step,
    config.weights,
    config.degree,
  ]);
}
export function validate(model: Model): {
  config: GameConfig | null;
  error: string;
} {
  try {
    const c = model.context;
    if (
      ![
        model.name,
        ...c.parties,
        c.parameter,
        c.metric,
        ...c.actions.flat(),
      ].every((v) => v.trim())
    )
      throw new Error(
        "Укажите название модели, сторон, действий, параметра и показателя.",
      );
    if (normalizeLabel(c.parties[0]) === normalizeLabel(c.parties[1]))
      throw new Error("Названия сторон должны различаться.");
    if (
      c.actions.some(
        (actions) =>
          new Set(actions.map(normalizeLabel)).size !== actions.length,
      )
    )
      throw new Error("Действия одной стороны должны иметь разные названия.");
    return { config: makeConfig(model.draft), error: "" };
  } catch (e) {
    return {
      config: null,
      error: e instanceof Error ? e.message : "Проверьте условия модели.",
    };
  }
}
export function status(model: Model): Status {
  if (model.error) return "error";
  if (!model.snapshot) return "draft";
  try {
    return configKey(makeConfig(model.draft)) ===
      configKey(model.snapshot.config) && !validate(model).error
      ? "ready"
      : "stale";
  } catch {
    return "stale";
  }
}
export const statusText: Record<Status, string> = {
  ready: "Результат актуален",
  draft: "Не рассчитано",
  stale: "Условия изменены",
  error: "Ошибка расчёта",
};

export function createModel(presetKey = "blank", name?: string): Model {
  const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
  const draft = structuredClone(preset.draft),
    context = defaultContext(draft.matrix.length, draft.matrix[0].length);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name:
      name?.trim() || (presetKey === "blank" ? "Новая модель" : preset.name),
    description: "",
    draft,
    context,
    createdAt: now,
    updatedAt: now,
    ...(presetKey === "linear"
      ? {
          snapshot: {
            config: makeConfig(draft),
            context: structuredClone(context),
            result: structuredClone(example) as GameResult,
            at: null,
            source: "example" as const,
          },
        }
      : {}),
  };
}
export function copyModel(model: Model): Model {
  const now = new Date().toISOString();
  return {
    ...structuredClone(model),
    id: crypto.randomUUID(),
    name: `${model.name} — копия`.slice(0, 90),
    createdAt: now,
    updatedAt: now,
    error: undefined,
  };
}
export function resize(model: Model, n: number, m: number): Model {
  return {
    ...model,
    draft: {
      ...model.draft,
      matrix: Array.from({ length: n }, (_, i) =>
        Array.from({ length: m }, (_, j) => model.draft.matrix[i]?.[j] ?? ""),
      ),
    },
    context: {
      ...model.context,
      actions: [
        Array.from(
          { length: n },
          (_, i) => model.context.actions[0][i] ?? `Действие ${i + 1}`,
        ),
        Array.from(
          { length: m },
          (_, i) => model.context.actions[1][i] ?? `Действие ${i + 1}`,
        ),
      ],
    },
  };
}

export function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const d = value as Draft;
  return (
    Array.isArray(d.matrix) &&
    d.matrix.length >= 1 &&
    d.matrix.length <= 8 &&
    d.matrix.every(
      (row) =>
        Array.isArray(row) &&
        row.length === d.matrix[0].length &&
        row.length >= 1 &&
        row.length <= 8 &&
        row.every((v) => typeof v === "string" && v.length <= 2000),
    ) &&
    [d.tMin, d.tMax, d.step].every(
      (v) => typeof v === "string" && v.length <= 100,
    ) &&
    Array.isArray(d.weights) &&
    d.weights.length === 3 &&
    d.weights.every((v) => typeof v === "string" && v.length <= 100)
  );
}
function isContext(value: unknown, draft: Draft): value is ModelContext {
  if (!value || typeof value !== "object") return false;
  const c = value as ModelContext;
  const text = (v: unknown) => typeof v === "string" && v.length <= 100;
  return (
    Array.isArray(c.parties) &&
    c.parties.length === 2 &&
    c.parties.every(text) &&
    [c.parameter, c.parameterUnit, c.metric, c.unit].every(text) &&
    Array.isArray(c.actions) &&
    c.actions.length === 2 &&
    c.actions.every(
      (a, i) =>
        Array.isArray(a) &&
        a.length === (i ? draft.matrix[0].length : draft.matrix.length) &&
        a.every(text),
    )
  );
}
function validResult(value: unknown, config: GameConfig): value is GameResult {
  if (!value || typeof value !== "object") return false;
  const r = value as GameResult,
    n = config.matrix.length,
    m = config.matrix[0].length;
  const nums = (a: unknown, length?: number) =>
    Array.isArray(a) &&
    (length === undefined || a.length === length) &&
    a.every((v) => typeof v === "number" && Number.isFinite(v));
  const points = (a: unknown) =>
    Array.isArray(a) &&
    a.length > 0 &&
    a.length <= 1001 &&
    a.every(
      (p) =>
        p &&
        Number.isFinite(p.t) &&
        Number.isFinite(p.v) &&
        nums(p.x, n) &&
        nums(p.y, m),
    );
  const rational = (v: unknown) => {
    const f = v as { num?: unknown; den?: unknown };
    return f && nums(f.num) && nums(f.den);
  };
  return (
    points(r.samples) &&
    r.samples.length === pointCount(config) &&
    r.samples.every(
      (s, i) =>
        Number.isFinite(s.h) && samePoint(s.t, config.tMin + i * config.step),
    ) &&
    points(r.curves) &&
    points(r.fittedSamples) &&
    r.fittedSamples.length === r.samples.length &&
    r.models &&
    Array.isArray(r.models.x) &&
    r.models.x.length === n &&
    r.models.x.every(rational) &&
    Array.isArray(r.models.y) &&
    r.models.y.length === m &&
    r.models.y.every(rational) &&
    rational(r.models.value) &&
    !!r.residuals &&
    [
      r.residuals.x,
      r.residuals.y,
      r.residuals.value,
      r.residuals.total,
      r.durationMs,
    ].every((v) => Number.isFinite(v)) &&
    r.degree === config.degree &&
    r.sampleCount === r.samples.length &&
    Array.isArray(r.warnings) &&
    r.warnings.every((v) => typeof v === "string")
  );
}

function cleanModel(value: unknown): Model | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Model;
  if (
    !isDraft(raw.draft) ||
    !isContext(raw.context, raw.draft) ||
    typeof raw.name !== "string" ||
    raw.name.length > 90
  )
    return null;
  const now = new Date().toISOString();
  const model: Model = {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    name: raw.name,
    description:
      typeof raw.description === "string" ? raw.description.slice(0, 500) : "",
    draft: raw.draft,
    context: raw.context,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
  if (raw.snapshot) {
    try {
      const config = makeConfig(configToDraft(raw.snapshot.config));
      // Preserve the exact normalized weights used by the saved calculation.
      // Normalizing them again can change the last bit and falsely mark a result stale.
      const savedWeights = raw.snapshot.config.weights;
      if (
        Math.abs(savedWeights.reduce((sum, value) => sum + value, 0) - 1) <
        1e-14
      )
        config.weights = [...savedWeights];
      if (
        isContext(raw.snapshot.context, configToDraft(config)) &&
        validResult(raw.snapshot.result, config)
      )
        model.snapshot = {
          config,
          context: raw.snapshot.context,
          result: raw.snapshot.result,
          at: typeof raw.snapshot.at === "string" ? raw.snapshot.at : null,
          source: raw.snapshot.source === "example" ? "example" : "calculated",
        };
    } catch {
      /* A malformed result never invalidates a recoverable draft. */
    }
  }
  return model;
}
export function configToDraft(c: GameConfig): Draft {
  return {
    matrix: c.matrix,
    tMin: String(c.tMin),
    tMax: String(c.tMax),
    step: String(c.step),
    weights: c.weights.map(String) as Draft["weights"],
  };
}

export function importModel(value: unknown): Model {
  const raw = value as Record<string, unknown>;
  if (!raw || typeof raw !== "object")
    throw new Error("Выберите JSON-файл модели или настроек приложения.");
  let model: Model | null = null;
  if (raw.version === 2) model = cleanModel(raw.model);
  else if (raw.version === 1 && isDraft(raw.draft)) {
    model = createModel();
    model.name = "Импортированная модель";
    model.draft = raw.draft;
    model.context = defaultContext(
      raw.draft.matrix.length,
      raw.draft.matrix[0].length,
    );
  } else if (raw.config && typeof raw.config === "object") {
    try {
      const draft = configToDraft(raw.config as GameConfig);
      if (isDraft(draft)) {
        const config = makeConfig(draft);
        model = createModel();
        model.name = "Импортированный расчёт";
        model.draft = draft;
        model.context = defaultContext(
          draft.matrix.length,
          draft.matrix[0].length,
        );
        if (validResult(raw.result, config))
          model.snapshot = {
            config,
            context: structuredClone(model.context),
            result: raw.result,
            at: null,
            source: "calculated",
          };
      }
    } catch {
      /* Fall through to a readable import error. */
    }
  }
  if (!model)
    throw new Error(
      "Не удалось прочитать модель. Поддерживаются файлы текущей и предыдущей версии приложения.",
    );
  return {
    ...model,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadWorkspace(storage: Pick<Storage, "getItem">): Model[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.models))
        return data.models
          .map(cleanModel)
          .filter((m: Model | null): m is Model => !!m);
    }
  } catch {
    /* Retain legacy storage as a recoverable fallback. */
  }
  const models: Model[] = [];
  try {
    const draft = JSON.parse(storage.getItem("parametr-draft-v1") || "null");
    if (isDraft(draft)) {
      const model = createModel("linear", "Модель из предыдущей версии");
      model.draft = draft;
      model.context = defaultContext(
        draft.matrix.length,
        draft.matrix[0].length,
      );
      try {
        if (configKey(makeConfig(draft)) !== configKey(makeConfig(original)))
          model.snapshot = undefined;
      } catch {
        model.snapshot = undefined;
      }
      models.push(model);
    }
    const runs = JSON.parse(storage.getItem("parametr-runs-v1") || "[]");
    if (Array.isArray(runs))
      for (const run of runs.slice(0, 6)) {
        try {
          const model = importModel(run);
          model.name =
            typeof run.name === "string" ? run.name.slice(0, 90) : model.name;
          models.push(model);
        } catch {
          /* Skip malformed legacy entries. */
        }
      }
  } catch {
    /* A fresh workspace still contains a working example. */
  }
  return models.length ? models : [createModel("linear", "Базовая модель")];
}

export function comparisonIssue(a: Model, b: Model): string {
  if (a.id === b.id) return "Выберите две разные модели.";
  if (status(a) !== "ready" || status(b) !== "ready")
    return "Для сравнения нужны актуальные результаты обеих моделей.";
  for (const key of ["parameter", "parameterUnit", "metric", "unit"] as const) {
    if (normalizeLabel(a.context[key]) !== normalizeLabel(b.context[key]))
      return "Названия параметра и показателя, а также их единицы должны совпадать. Проверьте описание моделей.";
  }
  if (
    a.context.parties.some(
      (p, i) => normalizeLabel(p) !== normalizeLabel(b.context.parties[i]),
    )
  )
    return "Стороны и их порядок должны совпадать: сравнивается выигрыш одной и той же стороны.";
  if (!commonPoints(a, b).length)
    return "У моделей нет общих расчётных точек. Задайте пересекающийся диапазон и согласованный шаг, затем пересчитайте модели.";
  return "";
}
export function commonPoints(
  a: Model,
  b: Model,
): { t: number; base: GameSample; variant: GameSample }[] {
  if (!a.snapshot || !b.snapshot) return [];
  return a.snapshot.result.samples.flatMap((base) => {
    const variant = b.snapshot!.result.samples.find((p) =>
      samePoint(base.t, p.t),
    );
    return variant ? [{ t: base.t, base, variant }] : [];
  });
}
export function actionDifferences(
  namesA: string[],
  valuesA: number[],
  namesB: string[],
  valuesB: number[],
) {
  const labels = [
    ...namesA,
    ...namesB.filter(
      (b) => !namesA.some((a) => normalizeLabel(a) === normalizeLabel(b)),
    ),
  ];
  return labels.map((name) => {
    const i = namesA.findIndex(
        (n) => normalizeLabel(n) === normalizeLabel(name),
      ),
      j = namesB.findIndex((n) => normalizeLabel(n) === normalizeLabel(name));
    return {
      name,
      base: i < 0 ? null : valuesA[i],
      variant: j < 0 ? null : valuesB[j],
      delta: i < 0 || j < 0 ? null : valuesB[j] - valuesA[i],
    };
  });
}
export function download(
  contents: string,
  name: string,
  mime = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportModel(model: Model) {
  download(
    JSON.stringify({ version: 2, application: "Стратегия", model }, null, 2),
    "strategy-model.json",
  );
}
