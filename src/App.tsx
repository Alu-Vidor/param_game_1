import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FileInput, FlaskConical, GitCompareArrows, Grid2X2, Info, Layers3, LoaderCircle, Play, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Results from './components/Results'
import { parseMatrix, parsePolynomial } from './lib/polynomial'
import type { CalculationMessage, GameConfig, GameResult } from './engine/types'
import exampleResult from './engine/example-result.json'

type Draft = { matrix: string[][]; tMin: string; tMax: string; step: string; weights: [string, string, string] }
type SavedRun = { id: string; name: string; createdAt: string; config: GameConfig; result: GameResult }
type Section = 'research' | 'compare' | 'guide'

const ORIGINAL_MATRIX = [
  ['2 + 0.1*t', '1 - 0.05*t', '3 + 0.2*t'],
  ['1 + 0.15*t', '4 - 0.1*t', '2 + 0.05*t'],
  ['3 - 0.05*t', '2 + 0.1*t', '1 + 0.15*t'],
]
const PRESETS = [
  { name: 'Пример из блокнота', detail: '3 × 3 · линейная матрица', matrix: ORIGINAL_MATRIX, tMin: '20', tMax: '40', step: '1' },
  { name: 'Квадратичная зависимость', detail: '2 × 2 · многочлены второй степени', matrix: [['2 + 0.02*t^2', '1 + 0.1*t'], ['3 - 0.05*t', '4 + 0.01*t^2']], tMin: '0', tMax: '10', step: '0.5' },
  { name: 'Постоянные условия', detail: '3 × 3 · матрица без параметра', matrix: [['2', '1', '3'], ['1', '4', '2'], ['3', '2', '1']], tMin: '0', tMax: '10', step: '1' },
]
const defaultDraft: Draft = { matrix: ORIGINAL_MATRIX, tMin: '20', tMax: '40', step: '1', weights: ['1', '1', '1'] }

function readStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Private browsing and storage limits are safe to ignore. */ }
}
function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const d = value as Draft
  return Array.isArray(d.matrix) && d.matrix.length >= 1 && d.matrix.length <= 8 &&
    d.matrix.every(row => Array.isArray(row) && row.length === d.matrix[0].length && row.length >= 1 && row.length <= 8 && row.every(v => typeof v === 'string' && v.length <= 2000)) &&
    [d.tMin, d.tMax, d.step].every(v => typeof v === 'string') && Array.isArray(d.weights) && d.weights.length === 3 && d.weights.every(v => typeof v === 'string')
}
function makeConfig(draft: Draft): GameConfig {
  const { coefficients, maxDegree } = parseMatrix(draft.matrix)
  if ([draft.tMin, draft.tMax, draft.step, ...draft.weights].some(v => !v.trim())) throw new Error('Заполните диапазон параметра, шаг и все три веса.')
  const [tMin, tMax, step] = [draft.tMin, draft.tMax, draft.step].map(v => Number(v.replace(',', '.')))
  if (![tMin, tMax, step].every(Number.isFinite)) throw new Error('Границы диапазона и шаг должны быть конечными числами.')
  if (tMax <= tMin) throw new Error('Конец диапазона должен быть больше его начала.')
  if (step <= 0 || step > tMax - tMin) throw new Error('Шаг должен быть больше нуля и не больше длины диапазона.')
  const count = Math.floor((tMax - tMin) / step + 1e-9) + 1
  if (count > 501) throw new Error('Получилось больше 501 точки. Увеличьте шаг или уменьшите диапазон.')
  const rawWeights = draft.weights.map(v => Number(v.replace(',', '.')))
  const sum = rawWeights.reduce((s, v) => s + v, 0)
  if (rawWeights.some(v => !Number.isFinite(v) || v < 0) || !Number.isFinite(sum) || sum <= 0) throw new Error('Веса должны быть неотрицательными, хотя бы один — больше нуля.')
  return { matrix: draft.matrix, coefficients, tMin, tMax, step, weights: rawWeights.map(v => v / sum) as GameConfig['weights'], degree: maxDegree * (Math.max(draft.matrix.length, draft.matrix[0].length) - 1) }
}
const defaultConfig = makeConfig(defaultDraft)
const format = (v: number, digits = 3) => v.toLocaleString('ru-RU', { maximumFractionDigits: digits })
const fingerprint = (v: GameConfig) => JSON.stringify(v)

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(() => { const d = readStorage('parametr-draft-v1', defaultDraft); return isDraft(d) ? d : defaultDraft })
  const [section, setSection] = useState<Section>('research')
  const [result, setResult] = useState<GameResult | null>(exampleResult as GameResult)
  const [resultConfig, setResultConfig] = useState(defaultConfig)
  const [savedExample, setSavedExample] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: '', progress: 0 })
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [presetOpen, setPresetOpen] = useState(false)
  const [history, setHistory] = useState<SavedRun[]>(() => { const items = readStorage<SavedRun[]>('parametr-runs-v1', []); return Array.isArray(items) ? items.filter(r => r?.config && Array.isArray(r?.result?.samples)).slice(0, 6) : [] })
  const worker = useRef<Worker | null>(null)
  const activeId = useRef('')
  const activeConfig = useRef(defaultConfig)
  const fileInput = useRef<HTMLInputElement>(null)
  const helpDialog = useRef<HTMLDialogElement>(null)

  const validation = useMemo(() => {
    try { return { config: makeConfig(draft), error: '' } }
    catch (e) { return { config: null, error: e instanceof Error ? e.message : 'Проверьте данные.' } }
  }, [draft])
  const stale = !validation.config || fingerprint(validation.config) !== fingerprint(resultConfig)
  const pointCount = validation.config ? Math.floor((validation.config.tMax - validation.config.tMin) / validation.config.step + 1e-9) + 1 : null
  const matrixDegree = useMemo(() => { try { return parseMatrix(draft.matrix).maxDegree } catch { return null } }, [draft.matrix])

  useEffect(() => { writeStorage('parametr-draft-v1', draft) }, [draft])
  useEffect(() => { writeStorage('parametr-runs-v1', history) }, [history])
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 3500); return () => clearTimeout(id) } }, [toast])
  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => {
    function dismiss(event: MouseEvent) { if (!(event.target as HTMLElement).closest('.preset-control')) setPresetOpen(false) }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  function updateCell(i: number, j: number, value: string) {
    setDraft(d => ({ ...d, matrix: d.matrix.map((row, r) => r === i ? row.map((v, c) => c === j ? value : v) : row) })); setError('')
  }
  function resizeMatrix(n: number, m: number) {
    setDraft(d => ({ ...d, matrix: Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => d.matrix[i]?.[j] ?? '0')) })); setError('')
  }
  function applyPreset(index: number) {
    const p = PRESETS[index]
    setDraft({ matrix: p.matrix.map(row => [...row]), tMin: p.tMin, tMax: p.tMax, step: p.step, weights: ['1', '1', '1'] })
    setPresetOpen(false); setError(''); setToast(`Загружен пример: ${p.name}`)
  }
  function run() {
    if (busy) return
    if (!validation.config) { setError(validation.error); return }
    setError(''); setBusy(true); setProgress({ stage: 'Подготавливаем расчёт', progress: 0.01 })
    const id = crypto.randomUUID(); activeId.current = id; activeConfig.current = structuredClone(validation.config)
    try {
      if (!worker.current) {
        worker.current = new Worker(new URL('./engine/calculation.worker.ts', import.meta.url), { type: 'module' })
        worker.current.onmessage = (event: MessageEvent<CalculationMessage>) => {
          const data = event.data
          if (data.id !== activeId.current) return
          if (data.type === 'progress') setProgress({ stage: data.stage, progress: data.progress })
          if (data.type === 'result') {
            setResult(data.result); setResultConfig(activeConfig.current); setSavedExample(false); setBusy(false)
            setToast('Расчёт завершён. Результаты обновлены.')
          }
          if (data.type === 'error') { setError(data.message); setBusy(false) }
        }
        worker.current.onerror = () => {
          setError('Не удалось запустить вычислительный модуль. Проверьте интернет и повторите попытку.'); setBusy(false)
          worker.current?.terminate(); worker.current = null
        }
      }
      worker.current.postMessage({ id, config: activeConfig.current })
    } catch (e) { setBusy(false); setError(e instanceof Error ? e.message : 'Не удалось запустить расчёт.') }
  }
  function cancel() { activeId.current = ''; worker.current?.terminate(); worker.current = null; setBusy(false); setToast('Расчёт остановлен. Можно изменить условия и запустить снова.') }
  function saveRun() {
    if (!result) return
    const now = new Date()
    setHistory(h => [{ id: crypto.randomUUID(), name: `Исследование ${h.length + 1}`, createdAt: now.toISOString(), result, config: resultConfig }, ...h].slice(0, 6))
    setToast('Результат добавлен в сравнение. Он сохранён в этом браузере.')
  }
  function saveConfig() {
    if (!validation.config) { setError(validation.error); return }
    downloadJson({ version: 1, application: 'Параметр', draft }, 'parametr-settings.json')
    setToast('Настройки сохранены в JSON-файл.')
  }
  async function importFile(file?: File) {
    if (!file) return
    try {
      if (file.size > 200_000) throw new Error('Файл слишком большой. Выберите JSON-файл настроек приложения.')
      const value = JSON.parse(await file.text())
      if (value.version !== 1 || !isDraft(value.draft)) throw new Error('Файл не содержит настроек «Параметра». Выберите ранее сохранённый JSON-файл.')
      makeConfig(value.draft)
      setDraft(value.draft); setError(''); setSection('research'); setToast('Настройки импортированы. Запустите расчёт.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать файл.'); setSection('research') }
    finally { if (fileInput.current) fileInput.current.value = '' }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setSection('research') }} aria-label="Параметр — главная">
        <span className="brand-symbol"><span>π</span></span><span>параметр<span className="brand-dot">.</span></span>
      </a>
      <div className="workspace-label">ЛАБОРАТОРИЯ СТРАТЕГИЙ</div>
      <nav className="main-nav" aria-label="Основная навигация">
        <button className={section === 'research' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('research')}><Grid2X2 size={19} />Исследование<span className="nav-indicator" /></button>
        <button className={section === 'compare' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('compare')}><GitCompareArrows size={19} />Сравнение{history.length > 0 && <span className="nav-count">{history.length}</span>}</button>
        <button className={section === 'guide' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('guide')}><BookOpen size={19} />О методе</button>
      </nav>
      <div className="sidebar-note"><span className="note-orbit"><Sparkles size={21} /></span><strong>Решение начинается<br />с правильного выбора</strong><p>Изучайте, как меняются лучшие стратегии вместе с условиями игры.</p><span className="note-decoration" aria-hidden="true">x(t)</span></div>
      <div className="sidebar-bottom"><span className="status-dot" /><div>Всё в вашем браузере<span>Данные остаются у вас</span></div><CircleHelp size={16} /></div>
    </aside>

    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumbs"><FlaskConical size={16} /><span>Рабочее пространство</span><span className="breadcrumb-slash">/</span><strong>{section === 'research' ? 'Исследование' : section === 'compare' ? 'Сравнение' : 'О методе'}</strong></div>
        <div className="topbar-actions"><button className="button subtle help-button" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={16} />Как это работает</button><span className="avatar" aria-label="Локальное рабочее пространство">П</span></div>
      </header>

      <main>
        {section === 'research' && <>
          <div className="page-heading">
            <div><div className="eyebrow"><span />ТЕОРИЯ ИГР, ПОНЯТНАЯ КАЖДОМУ</div><h1>Найдите свою стратегию<span>.</span></h1><p>Задайте условия игры — узнайте, как действовать при их изменении.</p></div>
            <div className="heading-actions"><button className="button secondary icon-mobile" aria-label="Открыть настройки из файла" title="Открыть настройки из файла" onClick={() => fileInput.current?.click()}><FileInput size={16} /><span>Открыть</span></button><button className="button secondary icon-mobile" aria-label="Сохранить настройки в файл" title="Сохранить настройки в файл" onClick={saveConfig}><ArrowDownToLine size={16} /><span>Сохранить</span></button></div>
          </div>

          <div className="research-layout">
            <section className="configuration-panel" aria-label="Настройки исследования">
              <div className="panel-top"><div className="panel-title"><SlidersHorizontal size={17} /><h2>Условия игры</h2></div><button className="icon-button" title="Вернуть исходный пример" aria-label="Вернуть исходный пример" disabled={busy} onClick={() => applyPreset(0)}><RotateCcw size={16} /></button></div>
              <div className="config-body">
                <div className="preset-control"><button className="preset-button" aria-expanded={presetOpen} onClick={() => setPresetOpen(v => !v)}><span className="preset-icon"><Layers3 size={17} /></span><span><small>БЫСТРЫЙ СТАРТ</small>Выбрать пример</span><ChevronDown size={15} /></button>{presetOpen && <div className="preset-menu">{PRESETS.map((p, i) => <button key={p.name} onClick={() => applyPreset(i)}><strong>{p.name}</strong><span>{p.detail}</span></button>)}</div>}</div>

                <div className="section-label"><span className="step-number">01</span><h3>Матрица выигрышей</h3><span className="formula-tag">A(t)</span></div>
                <p className="field-description">Число в ячейке — выигрыш первого игрока и проигрыш второго.</p>
                <div className="dimension-row"><label>Действия игрока 1<select aria-label="Количество действий первого игрока" value={draft.matrix.length} onChange={e => resizeMatrix(Number(e.target.value), draft.matrix[0].length)}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><span className="dimension-times">×</span><label>Действия игрока 2<select aria-label="Количество действий второго игрока" value={draft.matrix[0].length} onChange={e => resizeMatrix(draft.matrix.length, Number(e.target.value))}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label></div>
                <div className="matrix-scroll"><div className="matrix-editor" style={{ gridTemplateColumns: `22px repeat(${draft.matrix[0].length}, minmax(72px, 1fr))` }}><span />{draft.matrix[0].map((_, j) => <span key={`col${j}`} className="matrix-axis">B{j + 1}</span>)}{draft.matrix.map((row, i) => <MatrixRow key={i} row={row} i={i} onChange={updateCell} />)}</div></div>
                <div className="input-tip"><Info size={13} /><span>Например: <code>2 + 0.1*t</code> или <code>3 − t^2</code></span></div>
                <div className="matrix-degree"><span>Степень многочленов</span><span className="small-badge">w = {matrixDegree ?? '—'}</span></div>

                <div className="config-divider" />
                <div className="section-label"><span className="step-number">02</span><h3>Диапазон параметра</h3><span className="formula-tag">t</span></div>
                <p className="field-description">Время или другое условие, от которого зависят выигрыши.</p>
                <div className="range-fields">{([{ key: 'tMin', label: 'Начало' }, { key: 'tMax', label: 'Конец' }, { key: 'step', label: 'Шаг' }] as const).map(({ key, label }) => <label key={key}>{label}<input type="number" step="any" value={draft[key]} onChange={e => { setDraft(d => ({ ...d, [key]: e.target.value })); setError('') }} /></label>)}</div>
                <div className="point-count"><span className="tiny-dots">⠿</span>{pointCount ? `${pointCount} ${pointCount % 10 === 1 && pointCount % 100 !== 11 ? 'точка' : pointCount % 10 >= 2 && pointCount % 10 <= 4 && (pointCount % 100 < 12 || pointCount % 100 > 14) ? 'точки' : 'точек'} для расчёта` : 'Задайте корректный диапазон'}<span>до 501</span></div>

                <details className="advanced-settings"><summary><span><SlidersHorizontal size={14} />Настройки приближения</span><ChevronDown size={14} /></summary><div className="advanced-content"><p>Степень модели вычисляется по исходному правилу: <code>u = w × (max(n, m) − 1)</code>.</p><div className="matrix-degree"><span>Степень модели</span><span className="small-badge">u = {validation.config?.degree ?? '—'}</span></div><p>Веса ошибок: стратегии первого игрока, второго игрока и цена игры. Веса автоматически приводятся к сумме 1.</p><div className="range-fields">{(['Игрок 1', 'Игрок 2', 'Цена игры'] as const).map((label, i) => <label key={label}>{label}<input type="number" step="any" min="0" value={draft.weights[i]} onChange={e => setDraft(d => ({ ...d, weights: d.weights.map((w, j) => i === j ? e.target.value : w) as Draft['weights'] }))} /></label>)}</div><p className="advanced-note">Функции подбираются отдельно, как в блокноте. Поэтому изменение положительных весов обычно не меняет найденные формулы.</p></div></details>

                {(error || validation.error) && <div className="form-error" role={error ? 'alert' : undefined}><Info size={16} /><span>{error || validation.error}</span></div>}
                {busy ? <div className="calculation-progress" aria-live="polite"><div><LoaderCircle size={17} className="spin" /><strong>Выполняем расчёт</strong><button onClick={cancel} aria-label="Остановить расчёт"><X size={16} /></button></div><p>{progress.stage}</p><progress max={1} value={progress.progress} /><small>Первый запуск загружает вычислительный модуль и может занять около минуты.</small></div> : <button className="button primary run-button" onClick={run} disabled={!validation.config}><Play size={16} fill="currentColor" />Рассчитать стратегии<ArrowRight size={17} /></button>}
                <div className="calculation-note"><span className="status-dot" />Расчёт на вашем устройстве</div>
              </div>
            </section>

            <div className="results-area"><Results result={result} config={resultConfig} stale={stale} busy={busy} savedExample={savedExample} onRun={run} />{result && <div className="save-comparison"><div><GitCompareArrows size={17} /><span>Хотите проверить другие условия?</span></div><button className="text-button" onClick={saveRun} disabled={busy}><Plus size={15} />Добавить в сравнение</button></div>}</div>
          </div>
          <footer className="page-footer"><span>ПАРАМЕТР <span className="footer-dot">/</span> Лаборатория игровых стратегий</span><button onClick={() => setSection('guide')}>Математика и допущения<ArrowRight size={13} /></button></footer>
        </>}

        {section === 'compare' && <Compare history={history} onDelete={id => setHistory(h => h.filter(r => r.id !== id))} onBack={() => setSection('research')} onLoad={run => { setResult(run.result); setResultConfig(run.config); setSavedExample(false); setDraft({ matrix: run.config.matrix, tMin: String(run.config.tMin), tMax: String(run.config.tMax), step: String(run.config.step), weights: run.config.weights.map(String) as Draft['weights'] }); setSection('research') }} />}
        {section === 'guide' && <Guide onBack={() => setSection('research')} />}
      </main>
    </div>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => importFile(e.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    <dialog ref={helpDialog} className="help-dialog"><div className="dialog-top"><span className="dialog-icon"><FlaskConical size={24} /></span><button className="icon-button" onClick={() => helpDialog.current?.close()} aria-label="Закрыть справку"><X size={20} /></button></div><div className="eyebrow">ВАШЕ ПЕРВОЕ ИССЛЕДОВАНИЕ</div><h2>Три шага к решению</h2><ol className="help-steps"><li><span>1</span><div><strong>Задайте выигрыши</strong><p>Строки — действия первого игрока, столбцы — второго. В ячейках можно писать числа и многочлены от t.</p></div></li><li><span>2</span><div><strong>Выберите диапазон</strong><p>Укажите, как изменяется t и с каким шагом нужно проверить условия игры.</p></div></li><li><span>3</span><div><strong>Изучите стратегии</strong><p>Вероятности покажут, как часто выбирать действия. Цена игры — средний выигрыш первого игрока, если оба действуют оптимально.</p></div></li></ol><button className="button primary" onClick={() => helpDialog.current?.close()}>Всё понятно<ArrowRight size={17} /></button></dialog>
  </div>
}

function MatrixRow({ row, i, onChange }: { row: string[]; i: number; onChange: (i: number, j: number, v: string) => void }) {
  return <><span className="matrix-axis">A{i + 1}</span>{row.map((value, j) => {
    let valid = true; try { parsePolynomial(value) } catch { valid = false }
    return <input key={j} className={valid ? 'matrix-cell' : 'matrix-cell invalid'} title={value} aria-label={`Выигрыш: действие ${i + 1} первого игрока, действие ${j + 1} второго игрока`} aria-invalid={!valid} value={value} spellCheck={false} autoComplete="off" onChange={e => onChange(i, j, e.target.value)} />
  })}</>
}

function Compare({ history, onDelete, onLoad, onBack }: { history: SavedRun[]; onDelete: (id: string) => void; onLoad: (run: SavedRun) => void; onBack: () => void }) {
  const colors = ['#17836c', '#8d73c5', '#d99b50', '#5b8fc6', '#cc758c', '#899f54']
  const data = useMemo(() => {
    const points = new Map<number, Record<string, number>>()
    history.forEach((run, i) => run.result.curves.forEach(p => { const point = points.get(p.t) ?? { t: p.t }; point[`v${i}`] = p.v; points.set(p.t, point) }))
    return [...points.values()].sort((a, b) => a.t - b.t)
  }, [history])
  return <div className="secondary-page"><div className="eyebrow"><span />СОХРАНЁННЫЕ ИССЛЕДОВАНИЯ</div><h1>Сравните условия<span>.</span></h1><p className="page-subtitle">Сохраняйте результаты и наблюдайте, как меняется цена игры.</p>{history.length ? <><div className="comparison-chart card"><div className="card-heading"><h2>Цена игры в разных исследованиях</h2><span className="small-badge">{history.length} из 6</span></div><div className="comparison-chart-inner"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 20, left: 0, right: 20, bottom: 8 }}><CartesianGrid vertical={false} stroke="#edf0ed" /><XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#909891' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#909891' }} domain={['auto', 'auto']} /><Tooltip labelFormatter={v => `t = ${format(Number(v))}`} formatter={v => format(Number(v), 6)} />{history.map((run, i) => <Line key={run.id} dataKey={`v${i}`} name={run.name} type="linear" stroke={colors[i]} strokeWidth={2} dot={false} connectNulls={true} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div><div className="chart-legend">{history.map((run, i) => <span key={run.id}><i style={{ background: colors[i] }} />{run.name}</span>)}</div></div><div className="comparison-cards">{history.map((run, i) => <article className="card comparison-run" key={run.id}><div className="card-heading"><span className="run-color" style={{ background: colors[i] }} /><h3>{run.name}</h3><button className="icon-button" aria-label={`Удалить ${run.name}`} onClick={() => onDelete(run.id)}><Trash2 size={15} /></button></div><p>{run.config.matrix.length} × {run.config.matrix[0].length} · t от {format(run.config.tMin)} до {format(run.config.tMax)}</p><div className="run-stat"><span>Цена при t = {format(run.result.samples.at(-1)!.t)}</span><strong>{format(run.result.samples.at(-1)!.v, 5)}</strong></div><div className="run-details"><span>{run.result.sampleCount} точек · u = {run.result.degree}</span><span>Веса: {run.config.weights.map(v => format(v, 2)).join(' / ')}</span></div><button className="button secondary" onClick={() => onLoad(run)}>Открыть результат<ArrowRight size={15} /></button></article>)}</div><p className="comparison-footnote">Графики сравниваются по одному параметру t. Сохраняется до 6 результатов в этом браузере. Чтобы перенести расчёт, выгрузите JSON на вкладке результатов.</p></> : <div className="card empty-state"><span className="empty-icon"><GitCompareArrows size={34} /></span><h2>Первое исследование — начало сравнения</h2><p>На странице исследования нажмите «Добавить в сравнение». Затем измените условия, выполните расчёт и добавьте второй результат.</p><button className="button primary" onClick={onBack}>Перейти к исследованию<ArrowRight size={17} /></button></div>}</div>
}

function Guide({ onBack }: { onBack: () => void }) {
  return <div className="secondary-page guide-page"><div className="eyebrow"><span />МАТЕМАТИКА ЗА ИНТЕРФЕЙСОМ</div><h1>Два игрока. Один параметр<span>.</span></h1><p className="page-subtitle">Как устроен расчёт и что означают его результаты.</p><div className="guide-intro card"><span className="dialog-icon"><BookOpen size={25} /></span><div><h2>Задача из теории игр</h2><p>Первый игрок выбирает строку матрицы, второй — столбец. Число на пересечении — выигрыш первого и проигрыш второго. Каждый стремится к лучшему для себя результату. Параметр t меняет условия: например, время, спрос или стоимость ресурсов.</p></div></div><div className="guide-grid"><article className="card"><span className="guide-number">01 / МОДЕЛЬ</span><h2>Почему действия выбираются случайно?</h2><p>Если всегда выбирать одно действие, соперник может этим воспользоваться. Смешанная стратегия задаёт вероятность каждого действия: например, 40% для первого и 60% для второго.</p><p>Оптимальная стратегия обеспечивает лучший гарантированный средний результат против рационального соперника.</p></article><article className="card"><span className="guide-number">02 / РЕШЕНИЕ</span><h2>Сначала — отдельные точки</h2><p>Для каждого значения t строится числовая матрица. Затем решаются две двойственные задачи линейного программирования методом HiGHS, как в исходном блокноте.</p><p>Если в матрице есть отрицательные элементы, ко всем элементам временно прибавляется h = 2|min A|. После расчёта сдвиг вычитается из цены игры.</p></article><article className="card"><span className="guide-number">03 / ПРИБЛИЖЕНИЕ</span><h2>Затем — непрерывные формулы</h2><p>Стратегии и цена игры приближаются отношениями многочленов. Степень числителя и знаменателя: u = w × (max(n, m) − 1), где w — наибольшая степень элементов матрицы.</p><p>Сохраняются исходные метод наименьших квадратов, регуляризация и нормировка стратегий. Для повторяемости начальное случайное возмущение использует фиксированное зерно.</p></article><article className="card"><span className="guide-number">04 / ПРОВЕРКА</span><h2>Как читать ошибки?</h2><p>Rx, Ry и Rv — суммы квадратов отклонений приближения от дискретных решений. Итоговый критерий S = αRx + βRy + γRv. Чем меньше эти значения, тем точнее совпадение в расчётных точках.</p><p>Функции подбираются независимо. Положительный вес масштабирует целевую функцию соответствующего подбора и обычно не меняет её минимум. При нулевом весе подбор этой функции не выполняется содержательно.</p></article></div><div className="method-note"><Info size={19} /><div><strong>О границах метода</strong><p>Приближённая формула не гарантирует точность между точками или за пределами диапазона. В отдельных задачах могут возникать полюса или отрицательные вероятности: программа сообщает об этом, сохраняя исходный алгоритм. Если сдвинутая цена игры равна нулю, исходная формулировка ЛП может не иметь решения.</p><p>Все вычисления выполняются локально. При первом запуске нужен интернет для загрузки Python, NumPy и SciPy с CDN.</p></div></div><button className="button primary" onClick={onBack}><ArrowLeft size={16} />К исследованию</button></div>
}
