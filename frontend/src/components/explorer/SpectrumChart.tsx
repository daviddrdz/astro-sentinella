import { useMemo, useState } from "react";
import { SPECTRUM_CHART as C, SPECTRUM_FORMAT } from "../../config/explorer";
import type { SpectrumPoint } from "../../types/explorer";
import { formatFlux, formatTick, niceStep } from "../../utils/spectrum";

interface SpectrumChartProps {
  points: SpectrumPoint[];
  unit: string;
  wavelengthLabel: string;
  fluxLabel: string;
}

const PLOT_W = C.width - C.margin.left - C.margin.right;
const PLOT_H = C.height - C.margin.top - C.margin.bottom;
const PLOT_BOTTOM = C.height - C.margin.bottom;
const PLOT_RIGHT = C.width - C.margin.right;

type FinitePoint = SpectrumPoint & { flux: number };

export function SpectrumChart({
  points,
  unit,
  wavelengthLabel,
  fluxLabel,
}: SpectrumChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const finite = useMemo(
    () => points.filter((point): point is FinitePoint => point.flux !== null),
    [points]
  );

  const scales = useMemo(() => {
    const waves = points.map((point) => point.wavelengthUm);
    const xMin = Math.min(C.xDomainMinUm, ...waves);
    const xMax = Math.max(C.xDomainMaxUm, ...waves);
    const fluxes = finite.map((point) => point.flux);
    let yMin = Math.min(...fluxes);
    let yMax = Math.max(...fluxes);
    if (yMin === yMax) {
      yMin -= Math.abs(yMin) || 1;
      yMax += Math.abs(yMax) || 1;
    }
    const pad = (yMax - yMin) * C.yPadRatio;
    const step = niceStep(yMax - yMin + C.half * pad, C.yTickTarget);
    const lo = Math.floor((yMin - pad) / step) * step;
    const hi = Math.ceil((yMax + pad) / step) * step;
    const yTicks: number[] = [];
    for (let tick = lo; tick <= hi + step / C.half; tick += step) {
      yTicks.push(Number(tick.toPrecision(SPECTRUM_FORMAT.tickPrecision)));
    }
    return {
      x: (um: number) => C.margin.left + ((um - xMin) / (xMax - xMin)) * PLOT_W,
      y: (flux: number) =>
        C.margin.top + (1 - (flux - lo) / (hi - lo)) * PLOT_H,
      xMin,
      xMax,
      yTicks,
      yStep: step,
    };
  }, [points, finite]);

  // Break the line where a channel has no coverage instead of bridging the gap.
  const path = useMemo(() => {
    let d = "";
    let penDown = false;
    for (const point of points) {
      if (point.flux === null) {
        penDown = false;
        continue;
      }
      const x = scales.x(point.wavelengthUm).toFixed(C.coordDecimals);
      const y = scales.y(point.flux).toFixed(C.coordDecimals);
      d += `${penDown ? "L" : "M"}${x},${y}`;
      penDown = true;
    }
    return d;
  }, [points, scales]);

  if (finite.length === 0) {
    return null;
  }

  const hovered = hoverIndex !== null ? finite[hoverIndex] : null;

  const nearestIndex = (svgX: number) => {
    let best = 0;
    let bestDist = Infinity;
    finite.forEach((point, index) => {
      const dist = Math.abs(scales.x(point.wavelengthUm) - svgX);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverIndex(
      nearestIndex(((event.clientX - rect.left) / rect.width) * C.width)
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    setHoverIndex((prev) =>
      Math.min(finite.length - 1, Math.max(0, (prev ?? -delta) + delta))
    );
  };

  const tooltipLeftPct = hovered
    ? Math.min(
        C.tooltipMaxPct,
        Math.max(
          C.tooltipMinPct,
          (scales.x(hovered.wavelengthUm) / C.width) * C.percent
        )
      )
    : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${C.width} ${C.height}`}
        role="img"
        aria-label={`${fluxLabel} (${unit}) vs ${wavelengthLabel}`}
        tabIndex={0}
        className="block w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ae-accent-primary)]"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
        onBlur={() => setHoverIndex(null)}
      >
        {/* Recessive grid + y labels */}
        {scales.yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={C.margin.left}
              x2={PLOT_RIGHT}
              y1={scales.y(tick)}
              y2={scales.y(tick)}
              stroke="var(--ae-border-subtle)"
            />
            <text
              x={C.margin.left - C.yLabelGap}
              y={scales.y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-[var(--ae-text-muted)] font-mono text-[10px]"
            >
              {formatTick(tick, scales.yStep)}
            </text>
          </g>
        ))}

        {/* Reference features */}
        {C.referenceLines
          .filter((ref) => ref.um > scales.xMin && ref.um < scales.xMax)
          .map((ref) => (
            <g key={ref.label}>
              <line
                x1={scales.x(ref.um)}
                x2={scales.x(ref.um)}
                y1={C.margin.top}
                y2={PLOT_BOTTOM}
                stroke="var(--ae-text-muted)"
                strokeOpacity={C.refLineOpacity}
                strokeDasharray="2 3"
              />
              <text
                x={scales.x(ref.um)}
                y={C.margin.top - C.refLabelGap}
                textAnchor="middle"
                className="fill-[var(--ae-text-muted)] text-[9px]"
              >
                {ref.label}
              </text>
            </g>
          ))}

        {/* X axis */}
        <line
          x1={C.margin.left}
          x2={PLOT_RIGHT}
          y1={PLOT_BOTTOM}
          y2={PLOT_BOTTOM}
          stroke="var(--ae-border-strong)"
        />
        {C.xTicksUm.map((tick) => (
          <text
            key={`x-${tick}`}
            x={scales.x(tick)}
            y={PLOT_BOTTOM + C.xLabelOffset}
            textAnchor="middle"
            className="fill-[var(--ae-text-muted)] font-mono text-[10px]"
          >
            {tick}
          </text>
        ))}
        <text
          x={C.margin.left + PLOT_W / C.half}
          y={C.height - C.axisTitleInset}
          textAnchor="middle"
          className="fill-[var(--ae-text-secondary)] text-[10px]"
        >
          {wavelengthLabel}
        </text>
        <text
          transform={`translate(${C.yTitleX} ${C.margin.top + PLOT_H / C.half}) rotate(-90)`}
          textAnchor="middle"
          className="fill-[var(--ae-text-secondary)] text-[10px]"
        >
          {`${fluxLabel} (${unit})`}
        </text>

        {/* The spectrum */}
        <path
          data-testid="spectrum-line"
          d={path}
          fill="none"
          stroke="var(--ae-accent-primary)"
          strokeWidth={C.lineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover crosshair + marker with a surface ring */}
        {hovered && (
          <g pointerEvents="none">
            <line
              x1={scales.x(hovered.wavelengthUm)}
              x2={scales.x(hovered.wavelengthUm)}
              y1={C.margin.top}
              y2={PLOT_BOTTOM}
              stroke="var(--ae-text-muted)"
              strokeOpacity={C.crosshairOpacity}
            />
            <circle
              cx={scales.x(hovered.wavelengthUm)}
              cy={scales.y(hovered.flux)}
              r={C.markerRadius}
              fill="var(--ae-accent-primary)"
              stroke="var(--ae-bg-surface)"
              strokeWidth={C.markerRing}
            />
          </g>
        )}
      </svg>

      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded border border-[var(--ae-border-strong)] bg-[var(--ae-bg-elevated)] px-2 py-1 font-mono text-[11px] whitespace-nowrap text-[var(--ae-text-primary)] shadow-lg"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div>
            {`λ ${hovered.wavelengthUm.toFixed(C.wavelengthDecimals)} µm ± ${(
              hovered.bandwidthUm / C.half
            ).toFixed(C.wavelengthDecimals)}`}
          </div>
          <div className="text-[var(--ae-text-secondary)]">
            {`${formatFlux(hovered.flux)} ${unit}`}
          </div>
        </div>
      )}
    </div>
  );
}
