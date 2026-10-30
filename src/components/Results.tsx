import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRight, ChartNoAxesCombined, ChevronDown, CircleHelp, Clock3, FileJson, FunctionSquare, Grid2X2, Info, Play, Sparkles, Target, TrendingUp, TriangleAlert } from 'lucide-react'
import type { GameConfig, GameResult, RationalFunction } from '../engine/types'
import StrategyChart, { STRATEGY_COLORS } from './StrategyChart'

interface Props {
  result: GameResult | null
  config: GameConfig
  stale: boolean
  busy: boolean
  savedExample?: boolean
  onRun: () => void
}

const number = (value: number, digits = 4) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits })
const errorNumber = (value: number) => value === 0 ? '0' : value < .0001 ? value.toExponential(2) : number(value, 6)

function download(contents: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function polynomial(coefficients: number[]) {
  const terms: string[] = []
  for (let i = coefficients.length - 1; i >= 0; i--) {
    const value = coefficients[i]
    if (value === 0) continue
    const coefficient = Number(Math.abs(value).toPrecision(6)).toString()
    const variable = i ? (i === 1 ? 't' : `t^${i}`) : ''
    const body = `${i && value !== 0 && Math.abs(value) === 1 ? '' : coefficient}${i && Math.abs(value) !== 1 ? '·' : ''}${variable}`
    terms.push(`${value < 0 ? '− ' : terms.length ? '+ ' : ''}${body}`)
  }
  return terms.join(' ') || '0'
}

function Formula({ label, model }: { label: string; model: RationalFunction }) {
  return <div className="formula-row"><span className="formula-label">{label} =</span><span className="fraction"><span>{polynomial(model.num)}</span><span>{polynomial(model.den)}</span></span></div>
}

function ProbabilityBars({ values, player }: { values: number[]; player: number }) {
  return <div className="probability-player"><div className="probability-player-label"><span className={`player-dot player-${player}`} />Игрок {player}</div>
    {values.map((value, i) => <div className="probability-row" key={i}><span>Действие {i + 1}</span><div className="probability-track"><div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }} /></div><strong>{number(value * 100, 1)}%</strong></div>)}
  </div>
}

export default function Results({ result, config, stale, busy, savedExample, onRun }: Props) {
  const [tab, setTab] = useState<'charts' | 'table' | 'formulas'>('charts')
  const [sampleIndex, setSampleIndex] = useState(0)
  useEffect(() => { setSampleIndex(result ? Math.floor((result.samples.length - 1) / 2) : 0) }, [result])

  if (!result) return <section className="results-column">
    <div className="section-heading"><div><span className="eyebrow">ОТ ВВОДА К РЕШЕНИЮ</span><h2>Результат исследования</h2></div></div>
    <div className="empty-results card"><div className="empty-orbit"><ChartNoAxesCombined size={36} /></div><h3>Найдите свою стратегию</h3><p>Задайте выигрыши и диапазон параметра. Здесь появятся оптимальные стратегии игроков, цена игры и графики.</p><button className="button primary" onClick={onRun} disabled={busy}><Play size={16} />Рассчитать игру<ArrowRight size={16} /></button><div className="empty-footnote"><Info size={14} />Расчёт выполняется на вашем устройстве</div></div>
  </section>

  const sample = result.samples[Math.min(sampleIndex, result.samples.length - 1)]
  const last = result.samples[result.samples.length - 1]
  const first = result.samples[0]
  const csv = () => {
    const xCount = first.x.length, yCount = first.y.length
    const header = ['t', 'h', 'v', ...Array.from({ length: xCount }, (_, i) => `x${i + 1}`), ...Array.from({ length: yCount }, (_, i) => `y${i + 1}`)]
    const rows = result.samples.map((s) => [s.t, s.h, s.v, ...s.x, ...s.y].join(';'))
    download('\uFEFF' + [header.join(';'), ...rows].join('\r\n'), 'parametr-results.csv', 'text/csv;charset=utf-8')
  }
  const bestX = sample.x.indexOf(Math.max(...sample.x)) + 1
  const bestY = sample.y.indexOf(Math.max(...sample.y)) + 1

  return <section className="results-column" aria-label="Результаты расчёта">
    <div className="section-heading results-heading"><div><span className="eyebrow">РЕШЕНИЕ В ДЕТАЛЯХ</span><h2>Результат исследования</h2></div><div className="result-status"><span />{savedExample ? 'Исходный пример' : 'Расчёт завершён'}</div></div>
    {stale && <div className="notice warning" role="status"><TriangleAlert size={17} /><div><strong>Параметры изменились</strong><span>Нажмите «Рассчитать», чтобы обновить результаты.</span></div></div>}
    {savedExample && !stale && <div className="saved-example-note"><Info size={13} />Показан сохранённый расчёт исходного примера. Можно изменить условия и рассчитать свою игру.</div>}

    <div className="metrics-grid">
      <div className="metric-card metric-featured"><div className="metric-label">Цена игры при t = {number(last.t)}<TrendingUp size={17} /></div><div className="metric-value">{number(last.v)}<span>ед.</span></div><div className="metric-caption">Гарантированный средний выигрыш</div></div>
      <div className="metric-card"><div className="metric-label">Точек расчёта<Grid2X2 size={16} /></div><div className="metric-value">{result.sampleCount}</div><div className="metric-caption">Параметр t от {number(first.t)} до {number(last.t)}</div></div>
      <div className="metric-card"><div className="metric-label">Ошибка приближения<Target size={17} /></div><div className="metric-value error-value">{errorNumber(result.residuals.total)}</div><div className="metric-caption">Взвешенный критерий S</div></div>
    </div>

    <div className="results-tabs-row"><div className="segmented-tabs" role="tablist" aria-label="Вид результатов">
      <button id="tab-charts" role="tab" aria-selected={tab === 'charts'} aria-controls="result-panel" className={tab === 'charts' ? 'active' : ''} onClick={() => setTab('charts')}><ChartNoAxesCombined size={15} />Графики</button>
      <button id="tab-table" role="tab" aria-selected={tab === 'table'} aria-controls="result-panel" className={tab === 'table' ? 'active' : ''} onClick={() => setTab('table')}><Grid2X2 size={15} />Таблица</button>
      <button id="tab-formulas" role="tab" aria-selected={tab === 'formulas'} aria-controls="result-panel" className={tab === 'formulas' ? 'active' : ''} onClick={() => setTab('formulas')}><FunctionSquare size={15} />Формулы</button>
    </div><button className="text-button export-button" onClick={csv} title="Скачать таблицу в CSV"><ArrowDownToLine size={15} /><span>Скачать CSV</span></button></div>

    <div id="result-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === 'charts' && <div className="charts-content">
        <div className="card chart-card price-chart-card"><div className="chart-heading"><div><h3>Как меняется цена игры</h3><p>Средний выигрыш первого игрока при оптимальной игре обоих</p></div><span className="chart-symbol">v(t)</span></div><StrategyChart result={result} kind="value" height={240} /><div className="chart-legend"><span><i className="legend-line" />Приближение</span><span><i className="legend-dot" />Точный расчёт</span><span className="axis-caption">Параметр t →</span></div></div>
        <div className="strategy-charts-grid">{(['x', 'y'] as const).map((kind, player) => <div className="card chart-card strategy-chart-card" key={kind}><div className="chart-heading"><div><h3><span className={`player-dot player-${player + 1}`} />Стратегия игрока {player + 1}</h3><p>{player === 0 ? 'Стремится увеличить выигрыш' : 'Стремится уменьшить проигрыш'}</p></div><span className="chart-symbol">{kind}(t)</span></div><StrategyChart result={result} kind={kind} height={190} /><div className="strategy-legend">{first[kind].map((_, i) => <span key={i}><i style={{ background: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }} />Действие {i + 1}</span>)}</div></div>)}</div>
      </div>}

      {tab === 'table' && <div className="card table-card"><div className="chart-heading"><div><h3>Решение в каждой точке</h3><p>x — вероятности первого игрока, y — второго. h — сдвиг матрицы.</p></div><span className="subtle-badge">{result.sampleCount} строк</span></div><div className="table-scroll"><table className="results-table"><thead><tr><th>Параметр t</th><th>Цена v</th>{first.x.map((_, i) => <th key={`x${i}`}>x{i + 1}</th>)}{first.y.map((_, i) => <th key={`y${i}`}>y{i + 1}</th>)}<th>Сдвиг h</th></tr></thead><tbody>{result.samples.map((s, i) => <tr key={i}><td>{number(s.t)}</td><td className="table-value">{number(s.v, 6)}</td>{s.x.map((v, j) => <td key={`x${j}`}>{number(v, 6)}</td>)}{s.y.map((v, j) => <td key={`y${j}`}>{number(v, 6)}</td>)}<td>{number(s.h)}</td></tr>)}</tbody></table></div><div className="table-footer"><Info size={14} />Вероятность 0 означает, что действие не используется в найденной стратегии.</div></div>}

      {tab === 'formulas' && <div className="card formulas-card"><div className="chart-heading"><div><h3>Приближённые формулы</h3><p>Дробно-рациональная аппроксимация степени u = {result.degree}</p></div><span className="chart-symbol">P(t) / Q(t)</span></div><div className="formula-explanation"><Info size={16} /><span>Для стратегий показаны исходные дробные функции. Их значения делятся на сумму функций своего игрока, чтобы вероятности в сумме давали 1. Коэффициенты показаны с шестью значащими цифрами; полная точность — в JSON.</span></div><h4>Игрок 1</h4>{result.models.x.map((model, i) => <Formula key={i} label={`rₓ${i + 1}(t)`} model={model} />)}<h4>Игрок 2</h4>{result.models.y.map((model, i) => <Formula key={i} label={`rᵧ${i + 1}(t)`} model={model} />)}<h4>Цена игры</h4><Formula label="ṽ(t)" model={result.models.value} /><button className="button secondary" onClick={() => download(JSON.stringify({ config, result }, null, 2), 'parametr-calculation.json', 'application/json')}><FileJson size={16} />Скачать расчёт в JSON</button></div>}
    </div>

    <div className="card point-explorer"><div className="chart-heading"><div><h3><Sparkles size={16} />Что выбрать при конкретном t</h3><p>Передвигайте ползунок и изучайте точное решение</p></div><span className="point-t">t = {number(sample.t)}</span></div><div className="point-slider"><input aria-label="Параметр t для просмотра стратегии" type="range" min={0} max={result.samples.length - 1} value={sampleIndex} onChange={(event) => setSampleIndex(Number(event.target.value))} /><div><span>{number(first.t)}</span><span>{number(last.t)}</span></div></div><div className="probability-grid"><ProbabilityBars values={sample.x} player={1} /><ProbabilityBars values={sample.y} player={2} /></div><div className="point-explanation"><CircleHelp size={16} /><span>При t = {number(sample.t)} наибольшая вероятность у действия {bestX} первого игрока и действия {bestY} второго. Сохраняйте весь набор вероятностей: он гарантирует средний выигрыш <strong>{number(sample.v)} ед.</strong></span></div></div>

    <details className="calculation-details card"><summary><span><Target size={15} />Точность и сведения о расчёте</span><ChevronDown size={16} /></summary><div className="details-body"><div className="residual-grid"><div>Ошибка стратегий игрока 1<strong>Rx = {errorNumber(result.residuals.x)}</strong></div><div>Ошибка стратегий игрока 2<strong>Ry = {errorNumber(result.residuals.y)}</strong></div><div>Ошибка цены игры<strong>Rv = {errorNumber(result.residuals.value)}</strong></div><div>Взвешенный критерий<strong>S = {errorNumber(result.residuals.total)}</strong></div></div><p>Это суммы квадратов отклонений от точных решений в расчётных точках. Малое значение не гарантирует такую же точность между точками или за пределами диапазона.</p><p><Clock3 size={13} />{number(result.durationMs / 1000, 2)} с · {result.sampleCount} точек · степень приближения {result.degree}</p></div></details>
    {result.warnings.length > 0 && <div className="notice warning calculation-warnings"><TriangleAlert size={17} /><div><strong>Обратите внимание на качество приближения</strong>{result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div></div>}
  </section>
}
