import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  FileInput,
  FolderOpen,
  Layers3,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Model } from "../lib/workspace";
import { number, status, statusText } from "../lib/workspace";

export function StatusBadge({ model }: { model: Model }) {
  const s = status(model);
  return (
    <span className={`status-badge ${s}`}>
      <i />
      {statusText[s]}
    </span>
  );
}
export default function ModelLibrary({
  models,
  onOpen,
  onCreate,
  onImport,
  onCopy,
  onDelete,
}: {
  models: Model[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onCopy: (m: Model) => void;
  onDelete: (m: Model) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | "ready" | "draft">("all");
  const ready = models.filter((m) => status(m) === "ready").length;
  const filtered = models.filter(
    (m) =>
      (filter === "all" ||
        (filter === "ready" ? status(m) === "ready" : status(m) !== "ready")) &&
      `${m.name} ${m.description}`
        .toLocaleLowerCase("ru-RU")
        .includes(query.toLocaleLowerCase("ru-RU")),
  );
  return (
    <div className="library-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h1>Модели</h1>
          <p>
            Проверяйте условия, рассчитывайте стратегии и сравнивайте варианты.
          </p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={onImport}>
            <FileInput size={16} />
            Импорт
          </button>
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} />
            Новая модель
          </button>
        </div>
      </div>
      <div className="library-metrics">
        <div>
          <span className="metric-icon">
            <Layers3 size={19} />
          </span>
          <div>
            <span>Всего моделей</span>
            <strong>{models.length}</strong>
          </div>
        </div>
        <div>
          <span className="metric-icon green">
            <Check size={19} />
          </span>
          <div>
            <span>Актуальные результаты</span>
            <strong>{ready}</strong>
          </div>
        </div>
        <div>
          <span className="metric-icon amber">
            <FolderOpen size={19} />
          </span>
          <div>
            <span>Ожидают расчёта</span>
            <strong>{models.length - ready}</strong>
          </div>
        </div>
      </div>
      <section className="panel models-panel">
        <div className="models-toolbar">
          <div className="filter-tabs" aria-label="Фильтр моделей">
            {(
              [
                { id: "all", text: "Все модели" },
                { id: "ready", text: "С результатом" },
                { id: "draft", text: "Нужен расчёт" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                className={filter === f.id ? "active" : ""}
                onClick={() => setFilter(f.id)}
              >
                {f.text}
                {f.id === "all" && <span>{models.length}</span>}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Найти модель"
              placeholder="Найти модель"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {filtered.length ? (
          <div className="models-table-wrap">
            <table className="models-table">
              <thead>
                <tr>
                  <th>Название модели</th>
                  <th>Условия</th>
                  <th>Состояние</th>
                  <th>Изменено</th>
                  <th>
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button
                        className="model-name-button"
                        onClick={() => onOpen(m.id)}
                      >
                        <span className="model-file-icon">
                          <Layers3 size={20} />
                        </span>
                        <span>
                          <strong>{m.name || "Без названия"}</strong>
                          <small>
                            {m.description ||
                              `${m.context.parties[0]} · ${m.context.parties[1]}`}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="model-dimension">
                        {m.draft.matrix.length} × {m.draft.matrix[0].length}
                      </span>
                      <small>
                        t: {m.draft.tMin || "—"} — {m.draft.tMax || "—"}
                      </small>
                    </td>
                    <td>
                      <StatusBadge model={m} />
                    </td>
                    <td>
                      <span className="date-text">
                        {new Date(m.updatedAt).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <small>
                        {new Date(m.updatedAt).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          title="Создать копию"
                          aria-label={`Создать копию ${m.name}`}
                          onClick={() => onCopy(m)}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="icon-button"
                          title="Удалить модель"
                          aria-label={`Удалить ${m.name}`}
                          onClick={() => onDelete(m)}
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          className="icon-button open-model"
                          aria-label={`Открыть ${m.name}`}
                          onClick={() => onOpen(m.id)}
                        >
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="library-empty">
            <Search size={30} />
            <h3>
              {models.length ? "Моделей не найдено" : "Создайте первую модель"}
            </h3>
            <p>
              {models.length
                ? "Попробуйте другое название или измените фильтр."
                : "Начните со своих условий или изучите один из расчётных примеров."}
            </p>
            <button
              className="button secondary"
              onClick={
                models.length
                  ? () => {
                      setQuery("");
                      setFilter("all");
                    }
                  : onCreate
              }
            >
              {models.length ? "Сбросить фильтры" : "Создать модель"}
            </button>
          </div>
        )}
        <div className="models-table-footer">
          <span>
            {filtered.length} из {models.length} моделей
          </span>
          <span>Сохраняются в этом браузере</span>
        </div>
      </section>
      <div className="workflow-intro">
        <div>
          <span className="section-kicker">ОТ УСЛОВИЙ К РЕШЕНИЮ</span>
          <h2>Один процесс для каждого исследования</h2>
        </div>
        <div className="workflow-steps">
          {[
            {
              n: "01",
              title: "Опишите ситуацию",
              text: "Назовите стороны, действия и показатель выигрыша.",
            },
            {
              n: "02",
              title: "Задайте оценки",
              text: "Укажите выигрыши и зависимость от параметра.",
            },
            {
              n: "03",
              title: "Изучите решение",
              text: "Сравните стратегии при разных условиях.",
            },
          ].map((step) => (
            <div key={step.n}>
              <span>{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
