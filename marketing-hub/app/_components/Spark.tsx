"use client";
// Inline sparkline (oldest first) — the kit's smooth line with its area and end dot, red when the series fell, green when it rose.
import { KSpark } from "./KCharts";
export default function Spark({ values, down, width = 84, height = 24 }: { values: number[] | null | undefined; down?: boolean; hot?: number; width?: number; height?: number }) {
  return <KSpark values={values} down={down} width={width} height={height} />;
}
