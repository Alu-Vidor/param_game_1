"""Numerical checks against analytic equilibria, independent of the UI."""

import importlib.util
import math
from pathlib import Path
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("game_model", ROOT / "src/engine/model.py")
model = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(model)

NOTEBOOK_COEFFICIENTS = [
    [[2, 0.1], [1, -0.05], [3, 0.2]],
    [[1, 0.15], [4, -0.1], [2, 0.05]],
    [[3, -0.05], [2, 0.1], [1, 0.15]],
]


def config(coefficients=NOTEBOOK_COEFFICIENTS, degree=2):
    return {
        "coefficients": coefficients,
        "matrix": [["" for _ in row] for row in coefficients],
        "tMin": 20, "tMax": 40, "step": 1,
        "weights": [1 / 3] * 3, "degree": degree,
    }


class MathematicalChecks(unittest.TestCase):
    def test_notebook_discrete_solution_matches_analytic_equilibrium(self):
        for t in range(20, 41):
            A = np.array([
                [np.polynomial.polynomial.polyval(t, c) for c in row]
                for row in NOTEBOOK_COEFFICIENTS
            ])
            x, y, v, h = model.solve_dual_lp(A)
            p = (-1 + 0.15 * t) / (-4 + 0.4 * t)
            np.testing.assert_allclose(x, [0, p, 1 - p], atol=1e-9)
            np.testing.assert_allclose(y, [0.5, 0.5, 0], atol=1e-9)
            self.assertAlmostEqual(v, 2.5 + 0.025 * t, places=9)
            self.assertGreaterEqual(float(np.min(x @ A)), v - 1e-9)
            self.assertLessEqual(float(np.max(A @ y)), v + 1e-9)

    def test_negative_matrix_shift_preserves_equilibrium(self):
        A = np.array([[3.0, 1.0], [1.0, 4.0]])
        x, y, v, _ = model.solve_dual_lp(A)
        x_shifted, y_shifted, v_shifted, h = model.solve_dual_lp(A - 10)
        np.testing.assert_allclose(x, [0.6, 0.4], atol=1e-9)
        np.testing.assert_allclose(y, [0.6, 0.4], atol=1e-9)
        np.testing.assert_allclose(x_shifted, x, atol=1e-9)
        np.testing.assert_allclose(y_shifted, y, atol=1e-9)
        self.assertAlmostEqual(v, 2.2)
        self.assertAlmostEqual(v_shifted, v - 10)
        self.assertEqual(h, 18)

    def test_full_run_normalization_and_residual_definition(self):
        c = config()
        result = model.run_calculation(c)
        self.assertEqual(result["sampleCount"], 21)
        self.assertEqual(len(result["curves"]), 160)
        self.assertEqual(result["degree"], 2)
        for point in result["curves"] + result["fittedSamples"]:
            self.assertAlmostEqual(sum(point["x"]), 1, places=10)
            self.assertAlmostEqual(sum(point["y"]), 1, places=10)
            self.assertTrue(math.isfinite(point["v"]))
        for key, field in [("x", "x"), ("y", "y"), ("value", "v")]:
            exact = np.array([p[field] for p in result["samples"]])
            fitted = np.array([p[field] for p in result["fittedSamples"]])
            self.assertAlmostEqual(result["residuals"][key], float(np.sum((exact - fitted) ** 2)))
        expected_total = sum(result["residuals"][k] for k in ["x", "y", "value"]) / 3
        self.assertAlmostEqual(result["residuals"]["total"], expected_total)

    def test_rectangular_polynomial_matrix_is_supported(self):
        c = config([[[3, 0, 0.01], [1], [4]], [[1], [4], [5]]], degree=2)
        c.update({"tMin": 0, "tMax": 2, "step": 0.5})
        result = model.run_calculation(c)
        self.assertEqual(result["sampleCount"], 5)
        self.assertEqual(len(result["models"]["x"]), 2)
        self.assertEqual(len(result["models"]["y"]), 3)

    def test_zero_matrix_reports_original_lp_limitation(self):
        with self.assertRaisesRegex(ValueError, "исходную задачу ЛП"):
            model.run_calculation(config([[[0], [0]], [[0], [0]]], degree=0))


if __name__ == "__main__":
    unittest.main()
