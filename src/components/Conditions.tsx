import { useMemo, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  CircleHelp,
  Equal,
  Info,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { Model } from "../lib/workspace";
import { number, pointCount, resize, validate } from "../lib/workspace";
import { parsePolynomial, polynomialDegree } from "../lib/polynomial";

type Props = { model: Model; onChange: (model: Model) => void };
type Mode = "constant" | "linear" | "polynomial";

export default function Conditions({ model, onChange }: Props) {
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const [numeric, setNumeric] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const { context: c, draft: d } = model;
  const validation = useMemo(() => validate(model), [model]);
  const count = validation.config ? pointCount(validation.config) : 1;
  const previewT = validation.config
    ? validation.config.tMin +
      Math.min(previewIndex, count - 1) * validation.config.step
    : Number(d.tMin) || 0;
  const row = Math.min(selected[0], d.matrix.length - 1),
    col = Math.min(selected[1], d.matrix[0].length - 1);
  function context(patch: Partial<Model["context"]>) {
    onChange({ ...model, context: { ...c, ...patch } });
  }
  function draft(patch: Partial<Model["draft"]>) {
    onChange({ ...model, draft: { ...d, ...patch } });
  }
  function actionName(p: number, i: number, value: string) {
    context({
      actions: c.actions.map((names, side) =>
        side === p ? names.map((v, j) => (j === i ? value : v)) : names,
      ) as Model["context"]["actions"],
    });
  }
  function updateCell(value: string) {
    draft({
      matrix: d.matrix.map((r, i) =>
        i === row ? r.map((v, j) => (j === col ? value : v)) : r,
      ),
    });
  }

  return (
    <div className="conditions-stack">
      <section className="panel context-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">01 · КОНТЕКСТ</span>
            <h2>Что вы исследуете</h2>
            <p>
              Названия будут использоваться в результатах и при сравнении
              моделей.
            </p>
          </div>
          <span className="tag">Описание модели</span>
        </div>
        <div className="form-grid two">
          <label className="field">
            Название модели
            <input
              maxLength={90}
              value={model.name}
              onChange={(e) => onChange({ ...model, name: e.target.value })}
              placeholder="Например, базовые условия"
            />
          </label>
          <label className="field">
            Примечание <span className="optional">необязательно</span>
            <input
              maxLength={500}
              value={model.description}
              onChange={(e) =>
                onChange({ ...model, description: e.target.value })
              }
              placeholder="Какие предположения вы проверяете"
            />
          </label>
        </div>
        <div className="context-divider" />
        <div className="form-grid four">
          <label className="field">
            Показатель выигрыша
            <input
              maxLength={80}
              value={c.metric}
              onChange={(e) => context({ metric: e.target.value })}
              placeholder="Выигрыш"
            />
          </label>
          <label className="field">
            Единицы результата
            <input
              maxLength={40}
              value={c.unit}
              onChange={(e) => context({ unit: e.target.value })}
              placeholder="Например, баллы"
            />
          </label>
          <label className="field">
            Изменяемый параметр
            <input
              maxLength={80}
              value={c.parameter}
              onChange={(e) => context({ parameter: e.target.value })}
              placeholder="Например, время"
            />
          </label>
          <label className="field">
            Единицы параметра
            <input
              maxLength={40}
              value={c.parameterUnit}
              onChange={(e) => context({ parameterUnit: e.target.value })}
              placeholder="Например, дни"
            />
          </label>
        </div>
        <div className="inline-note">
          <Info size={16} />
          <p>
            Первая сторона стремится увеличить выигрыш, вторая — уменьшить его.
            Выигрыш одной стороны равен проигрышу другой. Исходные оценки
            задаёте вы.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">02 · УЧАСТНИКИ</span>
            <h2>Кто принимает решения</h2>
            <p>Укажите стороны и доступные им действия.</p>
          </div>
        </div>
        <div className="party-grid">
          {([0, 1] as const).map((p) => (
            <div className="party-editor" key={p}>
              <div className="party-heading">
                <span className={`party-number side-${p}`}>{p + 1}</span>
                <span>
                  {p === 0
                    ? "Увеличивает выигрыш"
                    : "Уменьшает выигрыш первой стороны"}
                </span>
              </div>
              <label className="field">
                Название {p === 0 ? "первой" : "второй"} стороны
                <input
                  maxLength={80}
                  value={c.parties[p]}
                  onChange={(e) =>
                    context({
                      parties: c.parties.map((v, i) =>
                        p === i ? e.target.value : v,
                      ) as [string, string],
                    })
                  }
                />
              </label>
              <div className="actions-heading">
                <span>Варианты действий</span>
                <div className="stepper">
                  <button
                    aria-label={`Убрать действие ${p + 1}-й стороны`}
                    disabled={c.actions[p].length <= 1}
                    onClick={() =>
                      onChange(
                        resize(
                          model,
                          d.matrix.length - (p === 0 ? 1 : 0),
                          d.matrix[0].length - (p === 1 ? 1 : 0),
                        ),
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <span>{c.actions[p].length}</span>
                  <button
                    aria-label={`Добавить действие ${p + 1}-й стороны`}
                    disabled={c.actions[p].length >= 8}
                    onClick={() =>
                      onChange(
                        resize(
                          model,
                          d.matrix.length + (p === 0 ? 1 : 0),
                          d.matrix[0].length + (p === 1 ? 1 : 0),
                        ),
                      )
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="action-inputs">
                {c.actions[p].map((name, i) => (
                  <label key={i}>
                    <span>
                      {p ? "B" : "A"}
                      {i + 1}
                    </span>
                    <input
                      aria-label={`Действие ${i + 1} ${p + 1}-й стороны`}
                      maxLength={80}
                      value={name}
                      onChange={(e) => actionName(p, i, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel matrix-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">03 · ОЦЕНКИ</span>
            <h2>Выигрыши при сочетании действий</h2>
            <p>
              Выберите ячейку, чтобы задать значение или зависимость от
              параметра.
            </p>
          </div>
          <div className="switch-group" aria-label="Отображение матрицы">
            <button
              className={!numeric ? "selected" : ""}
              onClick={() => setNumeric(false)}
            >
              Формулы
            </button>
            <button
              className={numeric ? "selected" : ""}
              onClick={() => setNumeric(true)}
            >
              Значения
            </button>
          </div>
        </div>
        <div className="matrix-workspace">
          <div className="matrix-main">
            <div className="matrix-caption">
              <span>
                Строки · <strong>{c.parties[0] || "Первая сторона"}</strong>
              </span>
              <span>
                Столбцы · <strong>{c.parties[1] || "Вторая сторона"}</strong>
              </span>
            </div>
            <div className="matrix-overflow">
              <table className="payoff-table">
                <thead>
                  <tr>
                    <th>
                      <ArrowDown size={15} /> / →
                    </th>
                    {c.actions[1].map((name, j) => (
                      <th key={j}>
                        <span>B{j + 1}</span>
                        {name || `Действие ${j + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.matrix.map((r, i) => (
                    <tr key={i}>
                      <th>
                        <span>A{i + 1}</span>
                        {c.actions[0][i] || `Действие ${i + 1}`}
                      </th>
                      {r.map((value, j) => {
                        let output: number | null = null,
                          valid = true;
                        try {
                          output = parsePolynomial(value).reduceRight(
                            (s, a) => s * previewT + a,
                            0,
                          );
                          if (!Number.isFinite(output)) output = null;
                        } catch {
                          valid = false;
                        }
                        return (
                          <td key={j}>
                            <button
                              className={`payoff-cell ${row === i && col === j ? "selected" : ""} ${!valid ? "invalid" : ""}`}
                              aria-label={`Выигрыш A${i + 1}, B${j + 1}: ${value || "не задан"}`}
                              aria-pressed={row === i && col === j}
                              onClick={() => setSelected([i, j])}
                            >
                              {numeric ? (
                                <strong>
                                  {output === null ? "—" : number(output)}
                                </strong>
                              ) : (
                                <code>{value || "Задать значение"}</code>
                              )}
                              <small>
                                {valid
                                  ? numeric
                                    ? c.unit || "без единиц"
                                    : `при t = ${number(previewT)}: ${output === null ? "не определено" : number(output)}`
                                  : value
                                    ? "Проверьте формулу"
                                    : "Нажмите для ввода"}
                              </small>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="matrix-preview">
              <div>
                <span>Предварительный просмотр</span>
                <strong>
                  {c.parameter || "Параметр"} = {number(previewT)}{" "}
                  {c.parameterUnit}
                </strong>
              </div>
              <input
                type="range"
                aria-label="Параметр предварительного просмотра матрицы"
                min={0}
                max={Math.max(1, count - 1)}
                value={Math.min(previewIndex, count - 1)}
                disabled={count < 2}
                onChange={(e) => setPreviewIndex(Number(e.target.value))}
              />
              <div className="range-ends">
                <span>{d.tMin}</span>
                <span>{d.tMax}</span>
              </div>
            </div>
          </div>
          <CellEditor
            key={`${model.id}-${row}-${col}`}
            value={d.matrix[row][col]}
            row={row}
            col={col}
            rowName={c.actions[0][row]}
            colName={c.actions[1][col]}
            parameter={c.parameter}
            unit={c.unit}
            onChange={updateCell}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">04 · УСЛОВИЯ РАСЧЁТА</span>
            <h2>
              В каких пределах меняется{" "}
              {c.parameter.toLocaleLowerCase("ru-RU") || "параметр"}
            </h2>
            <p>
              Для каждой точки сетки программа найдёт стратегии обеих сторон.
            </p>
          </div>
        </div>
        <div className="form-grid four">
          {(
            [
              { key: "tMin", label: "Начало диапазона" },
              { key: "tMax", label: "Конец диапазона" },
              { key: "step", label: "Шаг расчёта" },
            ] as const
          ).map(({ key, label }) => (
            <label className="field" key={key}>
              {label}
              <input
                type="number"
                step="any"
                value={d[key]}
                onChange={(e) => draft({ [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="grid-count">
            <span>Расчётная сетка</span>
            <strong>
              {validation.config ? count : "—"} <small>точек</small>
            </strong>
            <span>Не более 501</span>
          </div>
        </div>
        <details className="advanced">
          <summary>
            <span>
              <SlidersHorizontal size={16} />
              Параметры математического метода
            </span>
            <ChevronDown size={16} />
          </summary>
          <div className="advanced-body">
            <div className="method-degree">
              <div>
                <span>Степень аппроксимации</span>
                <strong>u = {validation.config?.degree ?? "—"}</strong>
              </div>
              <p>
                Определяется автоматически: w × (max(n, m) − 1), где w —
                максимальная степень многочленов в матрице.
              </p>
            </div>
            <div className="form-grid three">
              {[
                "Вес стратегий первой стороны",
                "Вес стратегий второй стороны",
                "Вес цены игры",
              ].map((label, i) => (
                <label className="field" key={i}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={d.weights[i]}
                    onChange={(e) =>
                      draft({
                        weights: d.weights.map((v, j) =>
                          i === j ? e.target.value : v,
                        ) as [string, string, string],
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="secondary-text">
              Веса нормируются до суммы 1. Как в исходном алгоритме, функции
              подбираются независимо: изменение положительных весов обычно не
              меняет минимум. Нулевой вес оставляет соответствующую функцию в
              начальном приближении.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}

function CellEditor({
  value,
  row,
  col,
  rowName,
  colName,
  parameter,
  unit,
  onChange,
}: {
  value: string;
  row: number;
  col: number;
  rowName: string;
  colName: string;
  parameter: string;
  unit: string;
  onChange: (value: string) => void;
}) {
  const initial = () => {
    try {
      return parsePolynomial(value);
    } catch {
      return [0];
    }
  };
  const [mode, setMode] = useState<Mode>(() => {
    const degree = polynomialDegree(initial());
    return degree === 0 ? "constant" : degree === 1 ? "linear" : "polynomial";
  });
  const [a, setA] = useState(() => (value ? String(initial()[0]) : ""));
  const [b, setB] = useState(() => String(initial()[1] ?? 0));
  let error = "",
    degree = 0;
  try {
    degree = polynomialDegree(parsePolynomial(value));
  } catch (e) {
    error = e instanceof Error ? e.message : "Проверьте формулу.";
  }
  function choose(next: Mode) {
    const coefficients = initial();
    setA(value ? String(coefficients[0]) : "");
    setB(String(coefficients[1] ?? 0));
    setMode(next);
  }
  function updateConstant(v: string) {
    setA(v);
    onChange(v);
  }
  function updateLinear(av: string, bv: string) {
    setA(av);
    setB(bv);
    onChange(av.trim() && bv.trim() ? `(${av}) + (${bv})*t` : "");
  }
  return (
    <aside className="cell-editor" aria-label="Редактор выбранной ячейки">
      <div className="cell-editor-title">
        <span className="cell-index">
          A{row + 1} · B{col + 1}
        </span>
        <span>Редактор выигрыша</span>
      </div>
      <h3>{rowName || `Действие ${row + 1}`}</h3>
      <p className="cell-opponent">
        при выборе «{colName || `Действие ${col + 1}`}» другой стороной
      </p>
      <label className="field">
        Тип зависимости
        <select
          aria-label="Тип зависимости выбранной ячейки"
          value={mode}
          onChange={(e) => choose(e.target.value as Mode)}
        >
          <option value="constant">Постоянное значение</option>
          <option value="linear">Линейная зависимость</option>
          <option value="polynomial">Многочлен</option>
        </select>
      </label>
      {mode === "constant" && (
        <label className="field">
          Значение {unit && `(${unit})`}
          <input
            aria-label="Постоянный выигрыш"
            inputMode="decimal"
            value={a}
            onChange={(e) => updateConstant(e.target.value)}
            placeholder="Введите число"
          />
        </label>
      )}
      {mode === "linear" && (
        <>
          <label className="field">
            Начальное значение
            <input
              aria-label="Свободный коэффициент"
              inputMode="decimal"
              value={a}
              onChange={(e) => updateLinear(e.target.value, b)}
            />
          </label>
          <label className="field">
            Изменение на единицу t
            <input
              aria-label="Коэффициент при t"
              inputMode="decimal"
              value={b}
              onChange={(e) => updateLinear(a, e.target.value)}
            />
          </label>
        </>
      )}
      {mode === "polynomial" && (
        <label className="field">
          Формула от t
          <textarea
            aria-label="Многочлен выигрыша"
            value={value}
            rows={3}
            maxLength={2000}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            placeholder="2 + 0.1*t - 0.02*t^2"
          />
        </label>
      )}
      {!error &&
        ((mode === "constant" && degree > 0) ||
          (mode === "linear" && degree > 1)) && (
          <div className="notice warning compact">
            Текущая формула сложнее выбранного типа. Изменение коэффициентов
            заменит её{" "}
            {mode === "constant"
              ? "постоянным значением"
              : "линейной зависимостью"}
            .
          </div>
        )}
      <div className="current-expression">
        <span>
          <Equal size={13} />
          Сейчас в ячейке
        </span>
        <code>{value || "Значение не задано"}</code>
      </div>
      {error && value && (
        <p className="field-error" role="status">
          {error}
        </p>
      )}
      <div className="cell-help">
        <CircleHelp size={16} />
        <p>
          <strong>
            t — {parameter.toLocaleLowerCase("ru-RU") || "ваш параметр"}.
          </strong>{" "}
          Используйте числа, +, −, *, / и степени, например t^2. Введённая
          оценка определяет результат для этого сочетания действий.
        </p>
      </div>
    </aside>
  );
}
