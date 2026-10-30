import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GameResult } from "../engine/types";

export const STRATEGY_COLORS = [
  "#345dce",
  "#7756b0",
  "#b7791f",
  "#147c8c",
  "#b74668",
  "#637c2e",
  "#476a9f",
  "#975e35",
];

const format = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 4 });

interface Props {
  result: GameResult;
  kind: "value" | "x" | "y";
  height?: number;
  labels?: string[];
  selectedT?: number;
}

export default function StrategyChart({
  result,
  kind,
  height = 220,
  labels,
  selectedT,
}: Props) {
  const count = kind === "value" ? 1 : result.samples[0][kind].length;
  const data = useMemo(() => {
    const rows = new Map<string, Record<string, number>>();
    const getRow = (t: number) => {
      const key = String(t);
      if (!rows.has(key)) rows.set(key, { t });
      return rows.get(key)!;
    };
    result.curves.forEach((sample) => {
      const row = getRow(sample.t);
      if (kind === "value") row.fit0 = sample.v;
      else
        sample[kind].forEach((value, index) => {
          row[`fit${index}`] = value;
        });
    });
    result.samples.forEach((sample, index) => {
      const row = getRow(sample.t);
      const fitted = result.fittedSamples[index];
      if (kind === "value") {
        row.exact0 = sample.v;
        if (fitted) row.fit0 = fitted.v;
      } else
        sample[kind].forEach((value, i) => {
          row[`exact${i}`] = value;
          if (fitted) row[`fit${i}`] = fitted[kind][i];
        });
    });
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [result, kind]);

  return (
    <div
      className="strategy-chart"
      role="img"
      aria-label={
        kind === "value"
          ? "График цены игры в зависимости от параметра t"
          : `График вероятностей действий игрока ${kind === "x" ? 1 : 2}`
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 12, left: -14, bottom: 4 }}
        >
          <CartesianGrid
            stroke="#e9edf3"
            strokeDasharray="3 4"
            vertical={false}
          />
          {selectedT !== undefined && (
            <ReferenceLine
              x={selectedT}
              stroke="#b0bed8"
              strokeDasharray="4 4"
            />
          )}
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            tick={{ fill: "#52627a", fontSize: 13 }}
            tickFormatter={format}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#52627a", fontSize: 13 }}
            width={kind === "value" ? 62 : 65}
            domain={kind === "value" ? ["auto", "auto"] : [0, 1]}
            tickFormatter={(v: number) =>
              kind === "value" ? format(v) : `${Math.round(v * 100)}%`
            }
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const values = payload.filter((p) =>
                String(p.dataKey).startsWith("fit"),
              );
              return (
                <div className="chart-tooltip">
                  <strong>t = {format(Number(label))}</strong>
                  {values.map((p, i) => (
                    <div key={String(p.dataKey)}>
                      <span
                        style={{
                          color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
                        }}
                      >
                        ●
                      </span>{" "}
                      {kind === "value"
                        ? "Приближение"
                        : (labels?.[i] ?? `Действие ${i + 1}`)}{" "}
                      <b>
                        {kind === "value"
                          ? format(Number(p.value))
                          : `${format(Number(p.value) * 100)}%`}
                      </b>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {Array.from({ length: count }, (_, i) => (
            <Line
              key={`fit${i}`}
              dataKey={`fit${i}`}
              name={kind === "value" ? "Приближение" : `Действие ${i + 1}`}
              type="linear"
              stroke={STRATEGY_COLORS[i % STRATEGY_COLORS.length]}
              strokeWidth={2.3}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          {Array.from({ length: count }, (_, i) => (
            <Line
              key={`exact${i}`}
              dataKey={`exact${i}`}
              name="Точный расчёт"
              stroke="none"
              dot={{
                r: kind === "value" ? 3 : 2.3,
                fill: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
                stroke: "#fff",
                strokeWidth: 1,
              }}
              activeDot={false}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
