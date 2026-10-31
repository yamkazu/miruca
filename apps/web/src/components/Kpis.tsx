import type { Summary } from '@miruca/core';
import { fmtHours, fmtNum } from '../format';

interface Tile {
  label: string;
  value: number | null;
  prev: number | null;
  format: (v: number | null) => string;
  /** Whether a higher value is an improvement. */
  higherIsBetter: boolean;
  unit?: string;
}

function Delta({ value, prev, higherIsBetter }: Pick<Tile, 'value' | 'prev' | 'higherIsBetter'>) {
  if (value == null || prev == null || prev === 0) return <span className="delta">前期間比 –</span>;
  const change = (value - prev) / prev;
  if (Math.abs(change) < 0.005) return <span className="delta">前期間比 ±0%</span>;
  const better = change > 0 === higherIsBetter;
  return (
    <span className="delta">
      前期間比{' '}
      <span className={better ? 'better' : 'worse'}>
        {change > 0 ? '▲' : '▼'} {Math.abs(change * 100).toFixed(0)}%
      </span>
      <span className="sr-only">{better ? '（改善）' : '（悪化）'}</span>
    </span>
  );
}

export function Kpis({ summary: s, previous: p }: { summary: Summary; previous: Summary }) {
  const tiles: Tile[] = [
    { label: 'マージ PR / 週', value: s.mergedPrsPerWeek, prev: p.mergedPrsPerWeek, format: (v) => fmtNum(v, 1), higherIsBetter: true },
    { label: 'リードタイム（中央値）', value: s.leadTimeP50, prev: p.leadTimeP50, format: fmtHours, higherIsBetter: false },
    { label: '初回レビューまで', value: s.timeToFirstReviewP50, prev: p.timeToFirstReviewP50, format: fmtHours, higherIsBetter: false },
    { label: 'レビュー → マージ', value: s.reviewToMergeP50, prev: p.reviewToMergeP50, format: fmtHours, higherIsBetter: false },
    { label: 'PR サイズ（中央値）', value: s.sizeP50, prev: p.sizeP50, format: (v) => fmtNum(v), unit: '行', higherIsBetter: false },
    { label: 'レビュー数', value: s.reviewsGiven, prev: p.reviewsGiven, format: (v) => fmtNum(v), unit: '件', higherIsBetter: true },
  ];
  return (
    <div className="grid kpis">
      {tiles.map((t) => (
        <div className="card kpi" key={t.label}>
          <div className="label">{t.label}</div>
          <div className="value tabular">
            {t.format(t.value)}
            {t.unit && t.value != null && <small>{t.unit}</small>}
          </div>
          <Delta value={t.value} prev={t.prev} higherIsBetter={t.higherIsBetter} />
        </div>
      ))}
    </div>
  );
}
