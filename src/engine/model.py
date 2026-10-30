"""Notebook calculation, unchanged in its LP and rational fitting methods.

The adapter accepts an arbitrary rectangular polynomial matrix and returns JSON
data for the web interface. It never evaluates user-supplied Python expressions.
"""

import json
import time
import warnings

import numpy as np
from scipy.optimize import least_squares, linprog


def positive_A(A):
    min_a = np.min(A)
    if min_a < 0:
        h = 2 * abs(min_a)
    else:
        h = 0
    return h


def solve_dual_lp(A):
    n, m = A.shape
    h = positive_A(A)
    B = A + h

    res_p = linprog(
        np.ones(n), A_ub=-B.T, b_ub=-np.ones(m),
        bounds=[(0, None)] * n, method="highs",
    )
    if not res_p.success:
        raise ValueError(f"ЛП для игрока 1 не сошлась: {res_p.message}")
    p_opt = res_p.x
    f_min = res_p.fun
    x_opt = p_opt / f_min

    res_q = linprog(
        -np.ones(m), A_ub=B, b_ub=np.ones(n),
        bounds=[(0, None)] * m, method="highs",
    )
    if not res_q.success:
        raise ValueError(f"ЛП для игрока 2 не сошлась: {res_q.message}")
    q_opt = res_q.x
    g_max = -res_q.fun
    y_opt = q_opt / g_max
    v = 1 / f_min - h
    return x_opt, y_opt, v, h


class RationalModel:
    def __init__(self, u, weight=1.0):
        self.u = u
        self.weight = weight

    def fit(self, t, y):
        t, y = np.array(t), np.array(y)
        p0_num = np.polyfit(t, y, min(1, self.u))[::-1]
        p0_num = np.pad(p0_num, (0, self.u + 1 - len(p0_num)), "constant")
        p0_den = np.zeros(self.u)
        p0 = np.concatenate([p0_num, p0_den])
        p0 += np.random.randn(len(p0)) * 1e-4

        def obj(params):
            a = params[:self.u + 1]
            b = np.concatenate(([1.0], params[self.u + 1:]))
            P = np.polyval(a[::-1], t)
            Q = np.polyval(b[::-1], t)
            Q_safe = np.where(np.abs(Q) < 1e-5, 1e-5, Q)
            residuals = y - P / Q_safe
            reg = 1e-5 * np.sum(a**2) + 1e-5 * np.sum(b**2)
            return np.concatenate([residuals, [np.sqrt(reg)]]) * np.sqrt(self.weight)

        res = least_squares(obj, p0, method="trf", max_nfev=5000)
        self.num = res.x[:self.u + 1]
        self.den = np.concatenate(([1.0], res.x[self.u + 1:]))
        self.converged = bool(res.success)
        return self

    def predict(self, t):
        t = np.array(t).reshape(-1)
        P = np.polyval(self.num[::-1], t)
        Q = np.polyval(self.den[::-1], t)
        Q = np.where(np.abs(Q) < 1e-8, 1e-8, Q)
        return P / Q

    def serialize(self):
        return {"num": self.num.tolist(), "den": self.den.tolist()}


def predict_strategies(models, t):
    pred = np.column_stack([m.predict(t) for m in models])
    return pred / np.sum(pred, axis=1, keepdims=True)


def _points(t, x, y, v):
    return [
        {"t": float(ti), "x": xi.tolist(), "y": yi.tolist(), "v": float(vi)}
        for ti, xi, yi, vi in zip(t, x, y, v)
    ]


def run_calculation(config, progress=None):
    started = time.perf_counter()

    def report(stage, value):
        if progress is not None:
            progress(stage, float(value))

    coefficients = config["coefficients"]
    n = len(coefficients)
    if not n or not coefficients[0]:
        raise ValueError("Введите непустую матрицу выигрышей.")
    m = len(coefficients[0])
    if any(len(row) != m for row in coefficients):
        raise ValueError("Во всех строках должно быть одинаковое число элементов.")
    for row in coefficients:
        for cell in row:
            if not cell or not np.all(np.isfinite(cell)):
                raise ValueError("Все коэффициенты матрицы должны быть конечными числами.")

    t_min, t_max, step = float(config["tMin"]), float(config["tMax"]), float(config["step"])
    if not np.all(np.isfinite([t_min, t_max, step])) or t_max <= t_min or step <= 0:
        raise ValueError("Проверьте диапазон t: конец должен быть больше начала, а шаг — положительным.")
    count = int(np.floor((t_max - t_min) / step + 1e-9)) + 1
    if count < 2 or count > 1001:
        raise ValueError("Выберите шаг, при котором получается от 2 до 1001 расчётной точки.")
    t = t_min + np.arange(count) * step
    u = int(config["degree"])
    if u < 0 or u != config["degree"]:
        raise ValueError("Степень аппроксимации должна быть целым неотрицательным числом.")
    weights = np.array(config["weights"], dtype=float)
    if weights.shape != (3,) or not np.all(np.isfinite(weights)) or np.any(weights < 0) or np.sum(weights) <= 0:
        raise ValueError("Введите три неотрицательных веса; хотя бы один должен быть больше нуля.")

    report("Решаем матричную игру в расчётных точках", 0.25)
    samples = []
    for k, ti in enumerate(t):
        A = np.array([
            [np.polynomial.polynomial.polyval(ti, cell) for cell in row]
            for row in coefficients
        ])
        if not np.all(np.isfinite(A)):
            raise ValueError(f"При t = {ti:g} значения матрицы слишком велики. Проверьте коэффициенты и диапазон.")
        try:
            x, y, v, h = solve_dual_lp(A)
        except ValueError as error:
            raise ValueError(
                f"При t = {ti:g} не удалось решить исходную задачу ЛП. "
                "Метод из блокнота требует положительной цены вспомогательной игры. "
                f"Подробности: {error}"
            ) from error
        samples.append({"t": float(ti), "h": float(h), "v": float(v), "x": x.tolist(), "y": y.tolist()})
        if k % max(1, count // 10) == 0 or k == count - 1:
            report("Решаем матричную игру в расчётных точках", 0.25 + 0.25 * (k + 1) / count)

    x_true = np.array([p["x"] for p in samples])
    y_true = np.array([p["y"] for p in samples])
    v_true = np.array([p["v"] for p in samples])
    # A fixed seed makes the notebook's random initial perturbation reproducible.
    # The fitting objective, regularization and solver settings are unchanged.
    np.random.seed(42)
    fitted = []
    target_series = [(x_true[:, i], weights[0]) for i in range(n)]
    target_series += [(y_true[:, i], weights[1]) for i in range(m)]
    target_series += [(v_true, weights[2])]
    captured_warnings = []
    with warnings.catch_warnings(record=True) as notices:
        warnings.simplefilter("always")
        for k, (series, weight) in enumerate(target_series):
            report("Подбираем дробно-рациональные формулы", 0.5 + 0.44 * k / len(target_series))
            fitted.append(RationalModel(u, weight=float(weight)).fit(t, series))
        captured_warnings = [str(w.message) for w in notices]

    x_models, y_models, v_model = fitted[:n], fitted[n:n + m], fitted[-1]
    x_pred = predict_strategies(x_models, t)
    y_pred = predict_strategies(y_models, t)
    v_pred = v_model.predict(t)
    rx = float(np.sum((x_true - x_pred) ** 2))
    ry = float(np.sum((y_true - y_pred) ** 2))
    rv = float(np.sum((v_true - v_pred) ** 2))
    t_cont = np.linspace(t.min(), t.max(), 160)
    x_cont = predict_strategies(x_models, t_cont)
    y_cont = predict_strategies(y_models, t_cont)
    v_cont = v_model.predict(t_cont)
    if not all(np.all(np.isfinite(a)) for a in [x_pred, y_pred, v_pred, x_cont, y_cont, v_cont]):
        raise ValueError("Аппроксимация дала неопределённые значения. Попробуйте другой диапазон или степень.")

    result_warnings = []
    if any(not model.converged for model in fitted):
        result_warnings.append("Для части формул достигнут лимит итераций. Показано последнее приближение, как в исходном блокноте; проверьте невязки и графики.")
    if any(np.any(a < -1e-6) or np.any(a > 1 + 1e-6) for a in [x_cont, y_cont]):
        result_warnings.append("Некоторые приближённые вероятности выходят за диапазон от 0 до 1. Метод аппроксимации из блокнота не накладывает ограничение на знак; точные решения смотрите в таблице.")
    if any(np.any(np.abs(np.polyval(model.den[::-1], t_cont)) < 1e-5) for model in fitted):
        result_warnings.append("У некоторых формул знаменатель близок к нулю. Применена исходная защита из блокнота; проверьте графики и невязки.")
    if captured_warnings:
        result_warnings.append("При подборе коэффициентов обнаружена численная неустойчивость. Проверьте качество приближения по графикам и невязкам.")
    if np.any(weights == 0):
        result_warnings.append("При нулевом весе соответствующие формулы остаются в начальном приближении: их ошибка не влияет на подбор коэффициентов.")
    report("Готовим результаты", 0.98)
    return {
        "samples": samples,
        "curves": _points(t_cont, x_cont, y_cont, v_cont),
        "fittedSamples": _points(t, x_pred, y_pred, v_pred),
        "models": {
            "x": [model.serialize() for model in x_models],
            "y": [model.serialize() for model in y_models],
            "value": v_model.serialize(),
        },
        "residuals": {"x": rx, "y": ry, "value": rv, "total": float(weights @ np.array([rx, ry, rv]))},
        "degree": u,
        "sampleCount": count,
        "durationMs": round((time.perf_counter() - started) * 1000),
        "warnings": result_warnings,
    }
