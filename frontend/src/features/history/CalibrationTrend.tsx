import { useEffect, useId, useRef, useState } from 'react';
import { formatGap, formatHistoryDate, formatShortDate, tendencyText, type CalibrationTrend as Trend } from './historyApi';

const H = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 36 };
const PLOT_H = H - PAD.top - PAD.bottom;

const y = (v: number) => PAD.top + PLOT_H - (v / 100) * PLOT_H;

/**
 * Tren tebakan vs nilai asli (FR-11, Pro). Dua garis di satu sumbu 0-100: nilai asli garis teal utuh,
 * tebakan garis putus-putus. Bentuk garis dan penanda ikut membedakan, jadi tidak bergantung pada warna saja.
 */
export function CalibrationTrend({ trend }: { trend: Trend }) {
  const { points, summary } = trend;
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  // Lebar SVG mengikuti wadahnya supaya teks sumbu tidak ikut mengecil di HP.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const PLOT_W = W - PAD.left - PAD.right;

  if (points.length < 2) {
    return (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
        Tren muncul setelah ada minimal 2 catatan yang selesai dicek. Sekarang baru {points.length}.
      </p>
    );
  }

  const step = PLOT_W / (points.length - 1);
  const x = (i: number) => PAD.left + i * step;
  const path = (key: 'predicted' | 'actual') => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p[key])}`).join(' ');
  const last = points.length - 1;
  const hovered = active === null ? null : points[active]!;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-1 rounded-md bg-wash px-4 py-3">
          <dt className="text-label-md text-ink-muted">Rata-rata selisih</dt>
          <dd className="font-mono text-[28px] leading-none text-ink tabular-nums">{formatGap(summary.meanAbsGap ?? 0)} poin</dd>
        </div>
        <div className="flex flex-col justify-center gap-1 rounded-md bg-wash px-4 py-3">
          <dt className="text-label-md text-ink-muted">Kecenderungan dari {summary.count} catatan terakhir</dt>
          <dd className="text-body-md text-ink text-pretty">{tendencyText(summary.meanSignedGap ?? 0)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-label-md text-ink-muted" aria-hidden="true">
        <span className="flex items-center gap-2">
          <svg width="24" height="8" className="text-teal">
            <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" />
          </svg>
          Nilai asli
        </span>
        <span className="flex items-center gap-2">
          <svg width="24" height="8" className="text-ember-ink">
            <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Tebakanmu
        </span>
      </div>

      <div ref={boxRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block max-w-full overflow-visible"
          role="img"
          aria-label={`Grafik tebakan dan nilai asli dari ${points.length} catatan. Angka lengkapnya ada di tabel di bawah.`}
          aria-describedby={tableId}
          onMouseLeave={() => setActive(null)}
        >
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line-soft" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px]">
                {v}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="fill-ink-muted text-[11px]">
            {formatShortDate(points[0]!.auditedAt)}
          </text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
            {formatShortDate(points[last]!.auditedAt)}
          </text>

          {hovered && (
            <line x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={PAD.top + PLOT_H} className="stroke-ink-muted" strokeWidth="1" />
          )}

          <path
            d={path('predicted')}
            fill="none"
            className="stroke-ember-ink"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
          <path d={path('actual')} fill="none" className="stroke-teal" strokeWidth="2" strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={p.submissionId}>
              <rect
                x={x(i) - 4}
                y={y(p.predicted) - 4}
                width="8"
                height="8"
                className="fill-ember-ink stroke-card"
                strokeWidth="2"
                opacity={active === null || active === i ? 1 : 0.5}
              />
              <circle
                cx={x(i)}
                cy={y(p.actual)}
                r="4.5"
                className="fill-teal stroke-card"
                strokeWidth="2"
                opacity={active === null || active === i ? 1 : 0.5}
              />
              <rect x={x(i) - step / 2} y={PAD.top} width={step} height={PLOT_H} fill="transparent" onMouseEnter={() => setActive(i)} />
            </g>
          ))}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-2 z-10 flex min-w-40 flex-col gap-1 rounded-md border border-line-soft bg-card px-3 py-2 text-body-sm text-ink shadow-sm"
            style={
              active! > last / 2
                ? { right: `${((W - x(active!)) / W) * 100}%`, marginRight: 12 }
                : { left: `${(x(active!) / W) * 100}%`, marginLeft: 12 }
            }
          >
            <span className="text-label-md text-ink-muted">{formatHistoryDate(hovered.auditedAt)}</span>
            <span>
              Nilai asli <b className="font-mono tabular-nums">{hovered.actual}%</b>
            </span>
            <span>
              Tebakan <b className="font-mono tabular-nums">{hovered.predicted}%</b>
            </span>
            <span>
              Selisih{' '}
              <b className="font-mono tabular-nums">
                {hovered.gap > 0 ? '+' : ''}
                {hovered.gap}
              </b>
            </span>
          </div>
        )}
      </div>

      <details className="rounded-md border border-line-soft">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-label-lg text-teal">Lihat sebagai tabel</summary>
        <div className="overflow-x-auto">
          <table id={tableId} className="w-full text-left text-body-sm">
            <thead className="text-label-md text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-normal">
                  Tanggal
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  Tebakan
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  Nilai asli
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  Selisih
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {[...points].reverse().map((p) => (
                <tr key={p.submissionId}>
                  <td className="px-4 py-2 text-ink">{formatHistoryDate(p.auditedAt)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{p.predicted}%</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{p.actual}%</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {p.gap > 0 ? '+' : ''}
                    {p.gap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
