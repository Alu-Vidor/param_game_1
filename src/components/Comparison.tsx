import { useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, Info, Plus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Model } from "../lib/workspace";
import {
  actionDifferences,
  commonPoints,
  comparisonIssue,
  number,
  status,
} from "../lib/workspace";

export default function Comparison({
  models,
  currentId,
  onCopy,
}: {
  models: Model[];
  currentId: string;
  onCopy: () => void;
}) {
  const [baseId, setBaseId] = useState(
    models.find((m) => m.id !== currentId && status(m) === "ready")?.id ?? "",
  );
  const [variantId, setVariantId] = useState(currentId);
  const [index, setIndex] = useState(0);
  const ready = models.filter((m) => status(m) === "ready");
  const base = models.find((m) => m.id === baseId),
    variant = models.find((m) => m.id === variantId);
  const points = useMemo(
    () => (base && variant ? commonPoints(base, variant) : []),
    [base, variant],
  );
  const issue =
    base && variant
      ? comparisonIssue(base, variant)
      : "Выберите базовую модель и вариант для сравнения.";
  const point = points[Math.min(index, points.length - 1)],
    c = base?.context;
  return (
    <div className="comparison-body">
      <p className="secondary-text">
        Сопоставляйте выигрыш и вероятности при одинаковых условиях. В сравнении
        участвуют актуальные расчёты.
      </p>
      {ready.length < 2 ? (
        <div className="comparison-empty">
          <GitCompareArrows size={32} />
          <h3>Нужны два актуальных расчёта</h3>
          <p>
            Создайте копию модели, измените условия и выполните расчёт. Обе
            модели останутся в рабочем пространстве.
          </p>
          <button className="button primary" onClick={onCopy}>
            <Plus size={16} />
            Создать вариант модели
          </button>
        </div>
      ) : (
        <>
          <div className="comparison-selectors">
            <label className="field">
              Базовая модель
              <select
                value={baseId}
                onChange={(e) => {
                  setBaseId(e.target.value);
                  setIndex(0);
                }}
              >
                <option value="">Выберите модель</option>
                {ready.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={19} />
            <label className="field">
              Вариант для сравнения
              <select
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  setIndex(0);
                }}
              >
                {ready.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {issue ? (
            <div className="notice warning">
              <Info size={18} />
              <p>{issue}</p>
            </div>
          ) : (
            point &&
            base &&
            variant &&
            c && (
              <>
                <div className="comparison-point">
                  <label className="field">
                    {c.parameter} {c.parameterUnit && `(${c.parameterUnit})`}
                    <select
                      value={Math.min(index, points.length - 1)}
                      onChange={(e) => setIndex(Number(e.target.value))}
                    >
                      {points.map((p, i) => (
                        <option key={i} value={i}>
                          {number(p.t, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    {points.length} общих расчётных точек. Сравнение использует
                    решения ЛП при одном и том же значении параметра.
                  </p>
                </div>
                <div className="comparison-values">
                  <div>
                    <span>{base.name}</span>
                    <strong>
                      {number(point.base.v)} <small>{c.unit}</small>
                    </strong>
                  </div>
                  <div>
                    <span>{variant.name}</span>
                    <strong>
                      {number(point.variant.v)} <small>{c.unit}</small>
                    </strong>
                  </div>
                  <div className="delta-card">
                    <span>Изменение выигрыша</span>
                    <strong>
                      {point.variant.v - point.base.v > 1e-9 ? "+" : ""}
                      {number(point.variant.v - point.base.v)}{" "}
                      <small>{c.unit}</small>
                    </strong>
                  </div>
                </div>
                <div className="comparison-plot">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={points.map((p) => ({
                        t: p.t,
                        base: p.base.v,
                        variant: p.variant.v,
                      }))}
                      margin={{ top: 15, right: 15, left: -5, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="#edf0f5" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "#7a8799" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => number(v)}
                        tick={{ fontSize: 11, fill: "#7a8799" }}
                      />
                      <Tooltip
                        labelFormatter={(v) =>
                          `${c.parameter} = ${number(Number(v))}`
                        }
                        formatter={(v) => number(Number(v), 6)}
                      />
                      <Line
                        dataKey="base"
                        name={base.name}
                        stroke="#8b7cc1"
                        strokeWidth={2}
                        dot={points.length < 30 ? { r: 2 } : false}
                        isAnimationActive={false}
                      />
                      <Line
                        dataKey="variant"
                        name={variant.name}
                        stroke="#496fdf"
                        strokeWidth={2}
                        dot={points.length < 30 ? { r: 2 } : false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: "#8b7cc1" }} />
                      {base.name}
                    </span>
                    <span>
                      <i style={{ background: "#496fdf" }} />
                      {variant.name}
                    </span>
                  </div>
                </div>
                <h3 className="comparison-subtitle">
                  Как изменилось распределение действий
                </h3>
                {([0, 1] as const).map((p) => (
                  <div className="comparison-actions" key={p}>
                    <h4>{c.parties[p]}</h4>
                    <div className="data-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Действие</th>
                            <th>Базовая модель</th>
                            <th>Вариант</th>
                            <th>Изменение</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actionDifferences(
                            c.actions[p],
                            point.base[p ? "y" : "x"],
                            variant.context.actions[p],
                            point.variant[p ? "y" : "x"],
                          ).map((row) => (
                            <tr key={row.name}>
                              <td>{row.name}</td>
                              <td>
                                {row.base === null
                                  ? "Нет действия"
                                  : `${number(row.base * 100, 2)}%`}
                              </td>
                              <td>
                                {row.variant === null
                                  ? "Нет действия"
                                  : `${number(row.variant * 100, 2)}%`}
                              </td>
                              <td>
                                {row.delta === null
                                  ? "—"
                                  : `${row.delta > 1e-9 ? "+" : ""}${number(row.delta * 100, 2)} п. п.`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                <details className="advanced">
                  <summary>
                    <span>Что отличается в исходных условиях</span>
                    <Plus size={15} />
                  </summary>
                  <div className="advanced-body">
                    <ul className="condition-differences">
                      {inputDifferences(base, variant).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </details>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function inputDifferences(a: Model, b: Model) {
  const x = a.snapshot!.config,
    y = b.snapshot!.config,
    out: string[] = [];
  if (
    x.matrix.length !== y.matrix.length ||
    x.matrix[0].length !== y.matrix[0].length
  )
    out.push(
      `Размер матрицы: ${x.matrix.length} × ${x.matrix[0].length} → ${y.matrix.length} × ${y.matrix[0].length}.`,
    );
  else {
    const count = x.coefficients
      .flatMap((r, i) =>
        r.map(
          (v, j) => JSON.stringify(v) !== JSON.stringify(y.coefficients[i][j]),
        ),
      )
      .filter(Boolean).length;
    if (count)
      out.push(
        `Различаются коэффициенты в ${count} ячейках матрицы (по позиции строки и столбца).`,
      );
  }
  if (JSON.stringify(a.context.actions) !== JSON.stringify(b.context.actions))
    out.push(
      "Названия или порядок действий различаются. Вероятности сопоставлены по названиям действий.",
    );
  if (x.tMin !== y.tMin || x.tMax !== y.tMax || x.step !== y.step)
    out.push(
      `Сетка параметра: ${x.tMin}…${x.tMax}, шаг ${x.step} → ${y.tMin}…${y.tMax}, шаг ${y.step}.`,
    );
  if (JSON.stringify(x.weights) !== JSON.stringify(y.weights))
    out.push(
      `Веса ошибок: ${x.weights.map((v) => number(v, 3)).join(" / ")} → ${y.weights.map((v) => number(v, 3)).join(" / ")}.`,
    );
  return out.length ? out : ["Числовые условия и действия совпадают."];
}
