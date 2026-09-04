import type { MarketHistoryPoint } from "@/lib/market/types";

import styles from "./market-detail.module.css";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const HORIZONTAL_PADDING = 30;
const VERTICAL_PADDING = 24;

interface MarketChartProps {
  history: readonly MarketHistoryPoint[];
  dataOrigin: "CHAIN" | "DEMO";
  embedded?: boolean;
}

export function MarketChart({ history, dataOrigin, embedded = false }: MarketChartProps) {
  const plottedHistory = history.length > 0 ? history : [{ label: "当前", yesProbability: 50 }];
  const plotWidth = CHART_WIDTH - HORIZONTAL_PADDING * 2;
  const plotHeight = CHART_HEIGHT - VERTICAL_PADDING * 2;
  const denominator = Math.max(plottedHistory.length - 1, 1);
  const points = plottedHistory.map((point, index) => {
    const x = HORIZONTAL_PADDING + (index / denominator) * plotWidth;
    const y = VERTICAL_PADDING + ((100 - point.yesProbability) / 100) * plotHeight;
    return { ...point, x, y };
  });
  const linePath = points
    .map((point, index) => (index === 0 ? "M " : "L ") + point.x + " " + point.y)
    .join(" ");
  const areaPath =
    linePath +
    " L " + String(points.at(-1)?.x ?? HORIZONTAL_PADDING) + " " + String(CHART_HEIGHT - VERTICAL_PADDING) +
    " L " + String(points[0]?.x ?? HORIZONTAL_PADDING) + " " + String(CHART_HEIGHT - VERTICAL_PADDING) +
    " Z";
  const firstPoint = plottedHistory[0];
  const middlePoint = plottedHistory[Math.floor((plottedHistory.length - 1) / 2)];
  const lastPoint = plottedHistory.at(-1);

  return (
    <section className={embedded ? styles.chartEmbedded : styles.chartCard}>
      <div className={styles.chartHeading}>
        <div>
          <span className={styles.eyebrow}>PROBABILITY HISTORY</span>
          <h2>YES probability</h2>
        </div>
        <div className={styles.chartValue}>
          <strong>{lastPoint?.yesProbability ?? 50}%</strong>
          <span>{dataOrigin === "CHAIN" ? "Confirmed history" : "Demo history"}</span>
        </div>
      </div>
      <div className={styles.chartFrame}>
        <div className={styles.chartAxis} aria-hidden="true">
          <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
        </div>
        <svg
          className={styles.chart}
          viewBox={"0 0 " + CHART_WIDTH + " " + CHART_HEIGHT}
          role="img"
          aria-label={
            "YES 概率从 " + String(firstPoint?.yesProbability ?? 50) +
            "% 变化至 " + String(lastPoint?.yesProbability ?? 50) + "%"
          }
          preserveAspectRatio="none"
        >
          {[0, 25, 50, 75, 100].map((value) => {
            const y = VERTICAL_PADDING + ((100 - value) / 100) * plotHeight;
            return (
              <line
                key={value}
                x1={HORIZONTAL_PADDING}
                x2={CHART_WIDTH - HORIZONTAL_PADDING}
                y1={y}
                y2={y}
                className={styles.gridLine}
              />
            );
          })}
          <path d={areaPath} className={styles.areaPath} />
          <path d={linePath} className={styles.linePath} />
          {points.map((point, index) => (
            <circle key={point.label + "-" + index} cx={point.x} cy={point.y} r="4" className={styles.chartPoint} />
          ))}
        </svg>
      </div>
      <div className={styles.chartLabels} aria-hidden="true">
        <span>{firstPoint?.label}</span>
        <span>{middlePoint?.label}</span>
        <span>{lastPoint?.label}</span>
      </div>
    </section>
  );
}
