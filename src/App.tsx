import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  FileInput,
  FolderOpen,
  GitCompareArrows,
  HardDrive,
  Info,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  X,
} from "lucide-react";
import Conditions from "./components/Conditions";
import Results from "./components/Results";
import Comparison from "./components/Comparison";
import ModelLibrary, { StatusBadge } from "./components/ModelLibrary";
import type { CalculationMessage, GameConfig } from "./engine/types";
import type { Model, ModelContext } from "./lib/workspace";
import {
  copyModel,
  createModel,
  exportModel,
  importModel,
  loadWorkspace,
  presets,
  status,
  STORAGE_KEY,
  validate,
} from "./lib/workspace";

type Job = {
  id: string;
  modelId: string;
  config: GameConfig;
  context: ModelContext;
  stage: string;
  progress: number;
};
type ModalKind = "create" | "help" | "compare" | "delete" | null;

export default function App() {
  const [models, setModels] = useState<Model[]>(() => {
    try {
      return loadWorkspace(localStorage);
    } catch {
      return [createModel("linear", "Базовая модель")];
    }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"conditions" | "result">("result");
  const [modal, setModal] = useState<ModalKind>(null);
  const [deleteId, setDeleteId] = useState("");
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const worker = useRef<Worker | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const model = models.find((m) => m.id === activeId);
  const validation = model ? validate(model) : null;
  const recent = [...models]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, models }));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [models]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => () => worker.current?.terminate(), []);
  function showLibrary() {
    setActiveId(null);
    window.scrollTo({ top: 0 });
  }
  function showSection(next: "conditions" | "result") {
    setView(next);
    window.scrollTo({ top: 0 });
  }
  function open(id: string, target?: "conditions" | "result") {
    const m = models.find((m) => m.id === id);
    setActiveId(id);
    setView(target ?? (m?.snapshot ? "result" : "conditions"));
    window.scrollTo({ top: 0 });
  }
  function update(updated: Model) {
    setModels((ms) =>
      ms.map((m) =>
        m.id === updated.id
          ? {
              ...updated,
              updatedAt: new Date().toISOString(),
              error: undefined,
            }
          : m,
      ),
    );
  }
  function add(next: Model, target: "conditions" | "result" = "conditions") {
    setModels((ms) => [next, ...ms]);
    setActiveId(next.id);
    setView(target);
    setModal(null);
    window.scrollTo({ top: 0 });
  }
  function duplicate(source: Model) {
    add(copyModel(source));
    setToast(
      "Копия создана. Можно изменить условия, сохранив исходную модель.",
    );
  }
  function cancel() {
    jobRef.current = null;
    worker.current?.terminate();
    worker.current = null;
    setJob(null);
    setToast("Расчёт остановлен. Условия модели сохранены.");
  }
  function run() {
    if (!model || jobRef.current) return;
    const checked = validate(model);
    if (!checked.config) {
      setToast(checked.error);
      showSection("conditions");
      return;
    }
    const next: Job = {
      id: crypto.randomUUID(),
      modelId: model.id,
      config: structuredClone(checked.config),
      context: structuredClone(model.context),
      stage: "Подготавливаем расчёт",
      progress: 0.01,
    };
    jobRef.current = next;
    setJob(next);
    showSection("result");
    setModels((ms) =>
      ms.map((m) => (m.id === next.modelId ? { ...m, error: undefined } : m)),
    );
    try {
      if (!worker.current) {
        worker.current = new Worker(
          new URL("./engine/calculation.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.current.onmessage = (
          event: MessageEvent<CalculationMessage>,
        ) => {
          const data = event.data,
            current = jobRef.current;
          if (!current || data.id !== current.id) return;
          if (data.type === "progress")
            setJob((j) =>
              j ? { ...j, stage: data.stage, progress: data.progress } : j,
            );
          if (data.type === "result") {
            const now = new Date().toISOString();
            setModels((ms) =>
              ms.map((m) =>
                m.id === current.modelId
                  ? {
                      ...m,
                      updatedAt: now,
                      error: undefined,
                      snapshot: {
                        config: current.config,
                        context: current.context,
                        result: data.result,
                        at: now,
                        source: "calculated",
                      },
                    }
                  : m,
              ),
            );
            jobRef.current = null;
            setJob(null);
            setToast("Расчёт завершён. Результат сохранён в модели.");
          }
          if (data.type === "error") {
            setModels((ms) =>
              ms.map((m) =>
                m.id === current.modelId ? { ...m, error: data.message } : m,
              ),
            );
            jobRef.current = null;
            setJob(null);
          }
        };
        worker.current.onerror = () => {
          const current = jobRef.current;
          if (current)
            setModels((ms) =>
              ms.map((m) =>
                m.id === current.modelId
                  ? {
                      ...m,
                      error:
                        "Не удалось запустить расчёт. Проверьте подключение к интернету и повторите попытку.",
                    }
                  : m,
              ),
            );
          worker.current?.terminate();
          worker.current = null;
          jobRef.current = null;
          setJob(null);
        };
      }
      worker.current.postMessage({ id: next.id, config: next.config });
    } catch {
      jobRef.current = null;
      setJob(null);
      setToast("Не удалось запустить расчёт. Повторите попытку.");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 3_000_000)
        throw new Error(
          "Размер файла превышает 3 МБ. Выберите JSON-файл одной модели.",
        );
      const next = importModel(JSON.parse(await file.text()));
      add(next, next.snapshot ? "result" : "conditions");
      setToast("Модель импортирована и добавлена в рабочее пространство.");
    } catch (e) {
      setToast(
        e instanceof SyntaxError
          ? "Файл не является корректным JSON."
          : e instanceof Error
            ? e.message
            : "Не удалось открыть файл.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function remove() {
    if (jobRef.current?.modelId === deleteId) cancel();
    setModels((ms) => ms.filter((m) => m.id !== deleteId));
    if (activeId === deleteId) setActiveId(null);
    setModal(null);
    setToast("Модель удалена из этого браузера.");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={showLibrary}
          aria-label="Стратегия — все модели"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            Стратегия<span className="brand-subtitle">АНАЛИЗ РЕШЕНИЙ</span>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-avatar">Л</span>
          <div>
            Личное пространство<small>Моделирование стратегий</small>
          </div>
        </div>
        <div className="sidebar-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          <button
            aria-label="Модели"
            className={`nav-item ${!activeId ? "active" : ""}`}
            onClick={showLibrary}
          >
            <FolderOpen size={18} />
            <span>Модели</span>
            <span className="nav-count">{models.length}</span>
          </button>
          <button
            className="nav-item"
            aria-label="Новая модель"
            onClick={() => setModal("create")}
          >
            <Plus size={18} />
            <span>Новая модель</span>
          </button>
        </nav>
        <div className="recent-models">
          <div className="sidebar-section-label">ПОСЛЕДНИЕ МОДЕЛИ</div>
          {recent.map((m) => (
            <button
              key={m.id}
              className={`recent-model ${m.id === activeId ? "active" : ""}`}
              onClick={() => open(m.id)}
            >
              <span className={`model-dot ${status(m)}`} />
              <span>{m.name || "Без названия"}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            aria-label="Как работать с моделями"
            onClick={() => setModal("help")}
          >
            <BookOpen size={18} />
            <span>Как работать с моделями</span>
          </button>
          <div className="local-storage-note">
            <HardDrive size={17} />
            <span>
              {storageError ? "Сохранение недоступно" : "Данные на устройстве"}
              <small>
                {storageError
                  ? "Экспортируйте модели в JSON"
                  : "Без аккаунта и сервера"}
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Рабочее пространство</span>
            <ChevronRight size={13} />
            <button onClick={showLibrary}>Модели</button>
            {model && (
              <>
                <ChevronRight size={13} />
                <strong>{model.name || "Без названия"}</strong>
              </>
            )}
          </div>
          <button
            className="help-link"
            aria-label="Открыть справку"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={17} />
            <span>Справка</span>
          </button>
        </header>
        <main>
          {storageError && (
            <div className="notice warning">
              <Info size={18} />
              <p>
                Браузер не смог сохранить изменения. Они доступны в текущем
                сеансе — выгрузите важные модели в JSON перед закрытием
                страницы.
              </p>
            </div>
          )}
          {job && (
            <div className="job-panel" role="status">
              <LoaderCircle className="spin" size={19} />
              <div>
                <strong>{job.stage}</strong>
                <p>
                  Первый запуск загружает вычислительный модуль. Можно
                  продолжать работу с моделями.
                </p>
                <progress max={1} value={job.progress} />
              </div>
              <button className="button text" onClick={cancel}>
                Остановить
              </button>
            </div>
          )}
          {!model ? (
            <ModelLibrary
              models={models}
              onCreate={() => setModal("create")}
              onImport={() => fileInput.current?.click()}
              onOpen={(id) => open(id)}
              onCopy={duplicate}
              onDelete={(m) => {
                setDeleteId(m.id);
                setModal("delete");
              }}
            />
          ) : (
            <>
              <div className="page-heading model-page-heading">
                <div>
                  <button
                    className="back-link"
                    onClick={showLibrary}
                  >
                    <ArrowLeft size={14} />
                    Все модели
                  </button>
                  <div className="model-heading-line">
                    <h1>{model.name || "Без названия"}</h1>
                    <StatusBadge model={model} />
                  </div>
                  <p>
                    {model.description ||
                      `${model.context.parties[0]} · ${model.context.parties[1]} · ${model.draft.matrix.length} × ${model.draft.matrix[0].length}`}
                  </p>
                </div>
                <div className="button-row">
                  <button
                    className="button secondary icon-on-mobile"
                    title="Создать копию модели"
                    aria-label="Создать копию модели"
                    onClick={() => duplicate(model)}
                  >
                    <Copy size={16} />
                    <span>Создать копию</span>
                  </button>
                  <button
                    className="button secondary icon-on-mobile"
                    aria-label="Экспортировать модель JSON"
                    title="Экспортировать модель JSON"
                    onClick={() => exportModel(model)}
                  >
                    <ArrowDownToLine size={16} />
                    <span>Экспорт</span>
                  </button>
                </div>
              </div>
              <div className="model-navigation">
                <div
                  className="model-tabs"
                  role="tablist"
                  aria-label="Раздел модели"
                >
                  <button
                    role="tab"
                    aria-selected={view === "conditions"}
                    className={view === "conditions" ? "active" : ""}
                    onClick={() => showSection("conditions")}
                  >
                    <span>01</span>Условия
                  </button>
                  <button
                    role="tab"
                    aria-selected={view === "result"}
                    className={view === "result" ? "active" : ""}
                    onClick={() => showSection("result")}
                  >
                    <span>02</span>Результат
                  </button>
                </div>
                <div className="model-navigation-actions">
                  {model.snapshot && (
                    <button
                      className="button text compare-header"
                      aria-label="Сравнить"
                      disabled={status(model) !== "ready" || !!job}
                      onClick={() => setModal("compare")}
                    >
                      <GitCompareArrows size={16} />
                      <span>Сравнить</span>
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={!!job || !validation?.config}
                    onClick={run}
                  >
                    {job?.modelId === model.id ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Play size={14} fill="currentColor" />
                    )}
                    {model.snapshot ? "Пересчитать" : "Рассчитать"}
                  </button>
                </div>
              </div>
              {model.error && (
                <div className="notice danger" role="alert">
                  <Info size={19} />
                  <div>
                    <strong>Расчёт не завершён</strong>
                    <p>{model.error}</p>
                  </div>
                </div>
              )}
              {view === "conditions" && validation?.error && (
                <div className="notice warning">
                  <Info size={18} />
                  <div>
                    <strong>Для расчёта заполните условия</strong>
                    <p>{validation.error}</p>
                  </div>
                </div>
              )}
              {view === "conditions" ? (
                <Conditions key={model.id} model={model} onChange={update} />
              ) : (
                <Results
                  key={model.id}
                  model={model}
                  busy={!!job}
                  onRun={run}
                  onEdit={() => showSection("conditions")}
                  onCompare={() => setModal("compare")}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Стратегия · моделирование решений</span>
            <span>
              <span className="status-dot" />
              {storageError
                ? "Изменения не сохранены"
                : "Изменения сохраняются автоматически"}
            </span>
          </footer>
        </main>
      </div>
      <input
        type="file"
        ref={fileInput}
        hidden
        accept=".json,application/json"
        onChange={(e) => importFile(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "create" && (
        <Modal title="Новая модель" onClose={() => setModal(null)}>
          <CreateModel onCreate={add} />
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="Как работать с моделями" onClose={() => setModal(null)}>
          <Help />
        </Modal>
      )}
      {modal === "compare" && model && (
        <Modal title="Сравнение моделей" wide onClose={() => setModal(null)}>
          <Comparison
            key={model.id}
            models={models}
            currentId={model.id}
            onCopy={() => duplicate(model)}
          />
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Удалить модель?" onClose={() => setModal(null)}>
          <p className="secondary-text">
            Модель «{models.find((m) => m.id === deleteId)?.name}» и её расчёт
            будут удалены из этого браузера. Если они нужны, сначала
            экспортируйте модель.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Отмена
            </button>
            <button className="button destructive" onClick={remove}>
              Удалить модель
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-header">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Закрыть окно"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function CreateModel({ onCreate }: { onCreate: (model: Model) => void }) {
  const [name, setName] = useState("Новая модель"),
    [preset, setPreset] = useState("blank");
  return (
    <div className="create-body">
      <p className="secondary-text">
        Начните с собственных оценок или используйте готовый пример.
      </p>
      <label className="field">
        Название
        <input
          autoFocus
          maxLength={90}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            key={p.key}
            className={`preset-card ${preset === p.key ? "selected" : ""}`}
            aria-pressed={preset === p.key}
            onClick={() => {
              setPreset(p.key);
              if (
                name === "Новая модель" ||
                presets.some((v) => v.name === name)
              )
                setName(p.key === "blank" ? "Новая модель" : p.name);
            }}
          >
            <span>
              <Layers3 size={18} />
              {preset === p.key && <Check size={16} />}
            </span>
            <strong>{p.name}</strong>
            <p>{p.description}</p>
          </button>
        ))}
      </div>
      <button
        className="button primary create-submit"
        disabled={!name.trim()}
        onClick={() => onCreate(createModel(preset, name))}
      >
        Создать модель
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
function Help() {
  return (
    <div className="help-body">
      <p>
        Приложение исследует модель двух сторон с противоположными интересами.
        Первая сторона выбирает строку матрицы, вторая — столбец. Выигрыш первой
        равен проигрышу второй.
      </p>
      <ol>
        <li>
          <strong>Опишите ситуацию</strong>
          <p>
            Назовите стороны, доступные действия, показатель выигрыша и
            параметр. Для корректного сравнения используйте одинаковые
            обозначения и единицы.
          </p>
        </li>
        <li>
          <strong>Задайте выигрыши</strong>
          <p>
            Выберите ячейку таблицы. Укажите число, линейную зависимость или
            многочлен от t. Проверьте числовые значения на диапазоне параметра.
          </p>
        </li>
        <li>
          <strong>Рассчитайте и изучите результат</strong>
          <p>
            Программа найдёт смешанные стратегии и цену игры в каждой расчётной
            точке. Вероятность 40% означает выбор действия с этой вероятностью
            при повторяющихся решениях.
          </p>
        </li>
        <li>
          <strong>Создайте вариант для сравнения</strong>
          <p>
            Скопируйте модель и измените предположения. После пересчёта можно
            сравнить выигрыш и действия при одинаковом значении параметра.
          </p>
        </li>
      </ol>
      <details className="advanced">
        <summary>
          <span>Что происходит внутри расчёта</span>
          <Plus size={16} />
        </summary>
        <div className="advanced-body">
          <p>
            Используются исходные двойственные задачи линейного программирования
            HiGHS. При отрицательном минимальном элементе матрица сдвигается на
            h = 2|min A|; из цены игры сдвиг затем вычитается.
          </p>
          <p>
            Зависимости приближаются отношениями многочленов степени u = w ×
            (max(n, m) − 1). Сохранены исходные регуляризация, независимый
            подбор функций и нормировка стратегий. Для повторяемости
            используется фиксированное зерно случайного начального возмущения.
          </p>
          <p>
            Приближение может иметь полюса и значения вероятностей вне интервала
            [0, 1]. В таких случаях приложение сообщает об обнаруженной
            проблеме; точные дискретные решения остаются в таблице. Если
            вспомогательная цена игры равна нулю, исходная формулировка ЛП может
            не иметь решения.
          </p>
        </div>
      </details>
      <div className="inline-note">
        <HardDrive size={18} />
        <p>
          Модели хранятся в этом браузере. При первом расчёте требуется интернет
          для загрузки Python и SciPy; исходные оценки на сервер не
          отправляются. Для переноса и резервного хранения используйте экспорт
          JSON.
        </p>
      </div>
    </div>
  );
}
