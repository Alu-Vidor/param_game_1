import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileJson,
  GitCompareArrows,
  Info,
  Play,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import type { RationalFunction } from "../engine/types";
import type { Model } from "../lib/workspace";
import {
  download,
  errorNumber,
  exportModel,
  number,
  status,
} from "../lib/workspace";
import StrategyChart, { STRATEGY_COLORS } from "./StrategyChart";

type Props = {
  model: Model;
  busy: boolean;
  onRun: () => void;
  onEdit: () => void;
  onCompare: () => void;
};
function polynomial(c: number[]) {
  return (
    c
      .reduceRight<string[]>((terms, v, i) => {
        if (v === 0) return terms;
        const coefficient = Number(Math.abs(v).toPrecision(6)).toString();
        const term = `${i && Math.abs(v) === 1 ? "" : coefficient}${i && Math.abs(v) !== 1 ? "·" : ""}${i ? (i === 1 ? "t" : `t^${i}`) : ""}`;
        terms.push(`${v < 0 ? "− " : terms.length ? "+ " : ""}${term}`);
        return terms;
      }, [])
      .join(" ") || "0"
  );
}
function Formula({ label, model }: { label: string; model: RationalFunction }) {
  return (
    <div className="formula-row">
      <span>{label} =</span>
      <span className="fraction">
        <span>{polynomial(model.num)}</span>
        <span>{polynomial(model.den)}</span>
      </span>
    </div>
  );
}
function csvCell(value: string | number) {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export default function Results({
  model,
  busy,
  onRun,
  onEdit,
  onCompare,
}: Props) {
  const [tab, setTab] = useState<"charts" | "table" | "formulas" | "accuracy">(
    "charts",
  );
  const [index, setIndex] = useState(0);
  const snapshot = model.snapshot;
  useEffect(() => {
    setIndex(
      snapshot ? Math.floor((snapshot.result.samples.length - 1) / 2) : 0,
    );
  }, [snapshot]);
  if (!snapshot)
    return (
      <div className="panel result-empty">
        <span className="empty-symbol">
          <TrendingUp size={32} />
        </span>
        <h2>
          {busy ? "Готовим результат модели" : "Сначала рассчитайте модель"}
        </h2>
        <p>
          {busy
            ? "После завершения здесь появятся распределение действий, выигрыш и зависимость от условий."
            : "Задайте выигрыши и диапазон параметра. Программа найдёт оптимальные стратегии обеих сторон."}
        </p>
        <div className="button-row">
          <button className="button secondary" onClick={onEdit}>
            <ArrowLeft size={16} />К условиям
          </button>
          <button className="button primary" disabled={busy} onClick={onRun}>
            <Play size={15} />
            Рассчитать модель
          </button>
        </div>
      </div>
    );
  const r = snapshot.result,
    stale = status(model) !== "ready",
    c = stale ? snapshot.context : model.context;
  const chosen = r.samples[Math.min(index, r.samples.length - 1)];
  const first = r.samples[0],
    last = r.samples.at(-1)!;
  function csv() {
    const header = [
      "t",
      "v",
      ...c.actions[0].map((n) => `${c.parties[0]}: ${n}`),
      ...c.actions[1].map((n) => `${c.parties[1]}: ${n}`),
      "h",
    ];
    const rows = [
      header.map(csvCell).join(";"),
      ...r.samples.map((p) =>
        [p.t, p.v, ...p.x, ...p.y, p.h].map(csvCell).join(";"),
      ),
    ];
    download(
      "\uFEFF" + rows.join("\r\n"),
      "strategy-results.csv",
      "text/csv;charset=utf-8",
    );
  }
  return (
    <div className="results-stack">
      {stale && (
        <div className="notice warning">
          <Info size={18} />
          <div>
            <strong>Условия изменены</strong>
            <p>
              Ниже показан предыдущий расчёт и его обозначения. Обновите
              результат, чтобы использовать новые условия.
            </p>
          </div>
          <button className="button small" disabled={busy} onClick={onRun}>
            Пересчитать
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {snapshot.source === "example" && !stale && (
        <div className="example-strip">
          <Info size={15} />
          <span>
            Сохранённый расчёт исходного примера. Создайте копию, чтобы
            проверить свои условия.
          </span>
        </div>
      )}
      <section className="parameter-bar panel">
        <div className="parameter-label">
          <span>Условия просмотра</span>
          <strong>{c.parameter}</strong>
          <small>{c.parameterUnit || "без единиц"}</small>
        </div>
        <div className="parameter-control">
          <div className="parameter-value">
            <button
              aria-label="Предыдущая расчётная точка"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <select
              aria-label="Значение параметра для просмотра результата"
              value={Math.min(index, r.samples.length - 1)}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {r.samples.map((p, i) => (
                <option key={i} value={i}>
                  {number(p.t, 8)}
                </option>
              ))}
            </select>
            <button
              aria-label="Следующая расчётная точка"
              disabled={index >= r.samples.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(r.samples.length - 1, i + 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="parameter-range">
            <input
              aria-label="Выбор расчётной точки"
              type="range"
              min={0}
              max={r.samples.length - 1}
              value={Math.min(index, r.samples.length - 1)}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
            <div className="range-ends">
              <span>{number(first.t)}</span>
              <span>{number(last.t)}</span>
            </div>
          </div>
        </div>
        <span className="tag exact-tag">
          <Check size={13} />
          Расчётная точка
        </span>
      </section>
      <div className="recommendation-layout">
        <section className="panel allocation-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                РЕШЕНИЕ ПРИ t = {number(chosen.t)}
              </span>
              <h2>Оптимальное распределение действий</h2>
            </div>
          </div>
          <div className="allocation-grid">
            {([0, 1] as const).map((p) => (
              <div className="allocation-party" key={p}>
                <div className="allocation-party-title">
                  <span className={`party-number side-${p}`}>{p + 1}</span>
                  <div>
                    <h3>{c.parties[p]}</h3>
                    <span>
                      {p
                        ? "Минимизирует выигрыш первой стороны"
                        : "Максимизирует свой выигрыш"}
                    </span>
                  </div>
                </div>
                {chosen[p ? "y" : "x"].map((value, i) => (
                  <div
                    className={`allocation-row ${value < 1e-8 ? "unused" : ""}`}
                    key={i}
                  >
                    <div>
                      <span>{c.actions[p][i]}</span>
                      <strong>
                        {number(value * 100, 2)}
                        <small>%</small>
                      </strong>
                    </div>
                    <div className="probability-track">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, value * 100))}%`,
                          background: STRATEGY_COLORS[p],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="allocation-note">
            <CircleHelp size={17} />
            <p>
              Вероятности задают смешанную стратегию. При повторяющихся решениях
              используйте всё распределение: выбор только самого частого
              действия не сохраняет гарантию модели.
            </p>
          </div>
        </section>
        <aside className="outcome-panel">
          <div>
            <span className="section-kicker">РЕЗУЛЬТАТ ПО МОДЕЛИ</span>
            <h3>{c.metric}</h3>
            <p>для стороны «{c.parties[0]}»</p>
          </div>
          <div className="outcome-number">
            {number(chosen.v)}
            <span>{c.unit}</span>
          </div>
          <p className="outcome-explanation">
            Гарантированный средний результат при оптимальных стратегиях и
            заданных оценках выигрышей.
          </p>
          <div className="outcome-footer">
            <span>{c.parameter}</span>
            <strong>
              {number(chosen.t)} {c.parameterUnit}
            </strong>
          </div>
          <button
            className="button outcome-compare"
            onClick={onCompare}
            disabled={stale || busy}
          >
            <GitCompareArrows size={16} />
            Сравнить с другой моделью
          </button>
        </aside>
      </div>
      <section className="panel analysis-panel">
        <div className="analysis-toolbar">
          <div
            className="analysis-tabs"
            role="tablist"
            aria-label="Подробности результата"
          >
            {(
              [
                { id: "charts", label: "Динамика" },
                { id: "table", label: "Таблица" },
                { id: "formulas", label: "Формулы" },
                { id: "accuracy", label: "Точность" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`detail-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="analysis-content"
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            className="button text export-csv"
            aria-label="Скачать таблицу CSV"
            onClick={csv}
          >
            <ArrowDownToLine size={15} />
            <span>Скачать CSV</span>
          </button>
        </div>
        <div
          className="analysis-content"
          id="analysis-content"
          role="tabpanel"
          aria-labelledby={`detail-${tab}`}
        >
          {tab === "charts" && (
            <>
              <div className="chart-title">
                <div>
                  <h3>Как меняется {c.metric.toLocaleLowerCase("ru-RU")}</h3>
                  <p>
                    Расчётные точки и непрерывное приближение на выбранном
                    диапазоне.
                  </p>
                </div>
                <span className="axis-unit">{c.unit}</span>
              </div>
              <StrategyChart
                result={r}
                kind="value"
                height={280}
                selectedT={chosen.t}
              />
              <div className="chart-legend">
                <span>
                  <i className="legend-line" />
                  Приближение
                </span>
                <span>
                  <i className="legend-dot" />
                  Решение ЛП
                </span>
                <span className="axis-label">
                  {c.parameter}
                  {c.parameterUnit ? `, ${c.parameterUnit}` : ""} →
                </span>
              </div>
              <div className="strategy-chart-grid">
                {(["x", "y"] as const).map((kind, p) => (
                  <div key={kind}>
                    <div className="chart-title">
                      <h3>{c.parties[p]}</h3>
                      <span className="axis-unit">Вероятности</span>
                    </div>
                    <StrategyChart
                      result={r}
                      kind={kind}
                      height={210}
                      labels={c.actions[p]}
                      selectedT={chosen.t}
                    />
                    <div className="chart-legend actions-legend">
                      {c.actions[p].map((name, i) => (
                        <span key={i}>
                          <i
                            style={{
                              background:
                                STRATEGY_COLORS[i % STRATEGY_COLORS.length],
                            }}
                          />
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "table" && (
            <>
              <div className="chart-title">
                <div>
                  <h3>Решения в расчётных точках</h3>
                  <p>
                    Вероятности указаны от 0 до 1. Ноль означает, что действие
                    не используется.
                  </p>
                </div>
                <span className="tag">{r.sampleCount} строк</span>
              </div>
              <div className="data-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{c.parameter}</th>
                      <th>{c.metric}</th>
                      {c.actions[0].map((n, i) => (
                        <th key={`x${i}`}>
                          <small>{c.parties[0]}</small>
                          {n}
                        </th>
                      ))}
                      {c.actions[1].map((n, i) => (
                        <th key={`y${i}`}>
                          <small>{c.parties[1]}</small>
                          {n}
                        </th>
                      ))}
                      <th>Сдвиг h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.samples.map((s, i) => (
                      <tr className={i === index ? "selected-row" : ""} key={i}>
                        <td>{number(s.t, 8)}</td>
                        <td className="emphasis">{number(s.v, 6)}</td>
                        {[...s.x, ...s.y].map((v, j) => (
                          <td key={j}>{number(v, 6)}</td>
                        ))}
                        <td>{number(s.h, 6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "formulas" && (
            <>
              <div className="chart-title">
                <div>
                  <h3>Дробно-рациональные модели</h3>
                  <p>Степень числителя и знаменателя u = {r.degree}.</p>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => exportModel(model)}
                >
                  <FileJson size={16} />
                  Полный JSON
                </button>
              </div>
              <div className="inline-note">
                <Info size={16} />
                <p>
                  Для стратегий показаны исходные дробные функции. Их значения
                  делятся на сумму функций соответствующей стороны. Коэффициенты
                  округлены до шести значащих цифр; в JSON сохраняется полная
                  точность.
                </p>
              </div>
              {(["x", "y"] as const).map((kind, p) => (
                <div className="formula-group" key={kind}>
                  <h4>{c.parties[p]}</h4>
                  {r.models[kind].map((m, i) => (
                    <div key={i}>
                      <p className="formula-action">{c.actions[p][i]}</p>
                      <Formula label={`r${kind}${i + 1}(t)`} model={m} />
                    </div>
                  ))}
                </div>
              ))}
              <div className="formula-group">
                <h4>{c.metric}</h4>
                <Formula label="ṽ(t)" model={r.models.value} />
              </div>
            </>
          )}
          {tab === "accuracy" && (
            <>
              <div className="chart-title">
                <div>
                  <h3>Точность приближения</h3>
                  <p>
                    Отклонения приближённых функций от решений ЛП в расчётных
                    точках.
                  </p>
                </div>
                <span className="tag">u = {r.degree}</span>
              </div>
              <div className="residual-cards">
                {[
                  { label: c.parties[0], name: "Rx", value: r.residuals.x },
                  { label: c.parties[1], name: "Ry", value: r.residuals.y },
                  { label: c.metric, name: "Rv", value: r.residuals.value },
                  {
                    label: "Взвешенный критерий",
                    name: "S",
                    value: r.residuals.total,
                  },
                ].map((v) => (
                  <div key={v.name}>
                    <span>{v.label}</span>
                    <strong>{errorNumber(v.value)}</strong>
                    <small>{v.name}</small>
                  </div>
                ))}
              </div>
              <div className="inline-note">
                <Info size={16} />
                <p>
                  Это точность математического приближения. Она не оценивает
                  достоверность исходных предположений и не гарантирует такую же
                  точность между точками или за пределами диапазона.
                </p>
              </div>
              <dl className="calculation-facts">
                <div>
                  <dt>Метод расчёта</dt>
                  <dd>Двойственные задачи ЛП · HiGHS</dd>
                </div>
                <div>
                  <dt>Аппроксимация</dt>
                  <dd>Отношения многочленов · наименьшие квадраты</dd>
                </div>
                <div>
                  <dt>Время расчёта</dt>
                  <dd>{number(r.durationMs / 1000, 2)} с</dd>
                </div>
                <div>
                  <dt>Расчётная сетка</dt>
                  <dd>
                    {r.sampleCount} точек · шаг{" "}
                    {number(snapshot.config.step, 8)}
                  </dd>
                </div>
                <div>
                  <dt>Веса ошибок</dt>
                  <dd>
                    {snapshot.config.weights
                      .map((w) => number(w, 4))
                      .join(" / ")}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </section>
      {r.warnings.length > 0 && (
        <div className="notice warning">
          <Info size={19} />
          <div>
            <strong>Проверьте качество приближения</strong>
            {r.warnings.map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
          </div>
        </div>
      )}
      <div className="results-footnote">
        <span>
          {snapshot.at
            ? `Рассчитано ${new Date(snapshot.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}`
            : "Сохранённый расчёт"}{" "}
          · {r.samples[0].x.length} × {r.samples[0].y.length}
        </span>
        <button className="button text" onClick={onEdit}>
          <SlidersHorizontal size={14} />
          Изменить условия
        </button>
      </div>
    </div>
  );
}
