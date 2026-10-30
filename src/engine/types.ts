export interface GameConfig {
  matrix: string[][];
  /** Polynomial coefficients in ascending power order. */
  coefficients: number[][][];
  tMin: number;
  tMax: number;
  step: number;
  weights: [number, number, number];
  /** Degree u of both numerator and denominator, as in the notebook. */
  degree: number;
}

export interface CurvePoint {
  t: number;
  v: number;
  x: number[];
  y: number[];
}

export interface GameSample extends CurvePoint {
  h: number;
}

export interface RationalFunction {
  /** Coefficients in ascending power order, without presentation rounding. */
  num: number[];
  den: number[];
}

export interface GameResult {
  samples: GameSample[];
  curves: CurvePoint[];
  fittedSamples: CurvePoint[];
  models: {
    x: RationalFunction[];
    y: RationalFunction[];
    value: RationalFunction;
  };
  residuals: { x: number; y: number; value: number; total: number };
  degree: number;
  sampleCount: number;
  durationMs: number;
  warnings: string[];
}

export interface CalculationRequest {
  id: string;
  config: GameConfig;
}

export type CalculationMessage =
  | { type: 'progress'; id: string; stage: string; progress: number }
  | { type: 'result'; id: string; result: GameResult }
  | { type: 'error'; id: string; message: string };
