/// <reference lib="webworker" />

import pythonSource from './model.py?raw';
import type { CalculationMessage, CalculationRequest, GameResult } from './types';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';

interface PythonRuntime {
  loadPackage(names: string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void; delete(name: string): void };
}

let runtimePromise: Promise<PythonRuntime> | undefined;
let busy = false;

function send(message: CalculationMessage) {
  self.postMessage(message);
}

async function getRuntime(id: string): Promise<PythonRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      send({ type: 'progress', id, stage: 'Загружаем Python для расчёта в браузере', progress: 0.03 });
      const moduleUrl = `${PYODIDE_URL}pyodide.mjs`;
      const { loadPyodide } = await import(/* @vite-ignore */ moduleUrl);
      const runtime: PythonRuntime = await loadPyodide({ indexURL: PYODIDE_URL });
      send({ type: 'progress', id, stage: 'Подключаем NumPy и SciPy — только при первом запуске', progress: 0.12 });
      await runtime.loadPackage(['numpy', 'scipy']);
      await runtime.runPythonAsync(pythonSource);
      return runtime;
    })().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

self.onmessage = async (event: MessageEvent<CalculationRequest>) => {
  const { id, config } = event.data;
  if (busy) {
    send({ type: 'error', id, message: 'Другой расчёт ещё выполняется. Дождитесь завершения.' });
    return;
  }
  busy = true;
  let runtime: PythonRuntime | undefined;
  try {
    runtime = await getRuntime(id);
    runtime.globals.set('_config_json', JSON.stringify(config));
    runtime.globals.set('_report_progress', (stage: string, progress: number) => {
      send({ type: 'progress', id, stage, progress });
    });
    const output = await runtime.runPythonAsync(
      'json.dumps(run_calculation(json.loads(_config_json), _report_progress), allow_nan=False)',
    );
    const result = JSON.parse(String(output)) as GameResult;
    send({ type: 'result', id, result });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const pythonMessage = raw.match(/ValueError: ([\s\S]*)$/)?.[1]?.trim();
    const message = pythonMessage || (
      /fetch|network|load|Failed|ImportError/i.test(raw)
        ? 'Не удалось загрузить вычислительный модуль. Проверьте подключение к интернету и повторите расчёт.'
        : `Не удалось завершить расчёт. ${raw}`
    );
    send({ type: 'error', id, message });
  } finally {
    runtime?.globals.delete('_config_json');
    runtime?.globals.delete('_report_progress');
    busy = false;
  }
};
