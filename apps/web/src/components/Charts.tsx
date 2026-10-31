import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { SizeBucket, WeeklyPoint } from '@miruca/core';
import { fmtDate, fmtHours, fmtNum } from '../format';

const axis = { stroke: 'var(--text-muted)', fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  format: (v: number | null) => string;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  title,
}: TooltipProps<number, string> & { series: SeriesDef[]; title: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number | null>;
  return (
    <div className="tooltip">
      <div className="t">{title(String(label))}</div>
      {series.map((s) => (
        <div className="row" key={s.key}>
          <span>
            <i style={{ background: s.color }} /> {s.label}
          </span>
          <span className="tabular">{s.format(row[s.key])}</span>
        </div>
      ))}
    </div>
  );
}

const weekTitle = (w: string) => `${fmtDate(w)} の週`;

export function ThroughputChart({ weekly }: { weekly: WeeklyPoint[] }) {
  const series: SeriesDef[] = [
    { key: 'mergedPrs', label: 'マージ PR', color: 'var(--series-1)', format: (v) => `${fmtNum(v)} 件` },
    { key: 'deployments', label: 'デプロイ', color: 'var(--series-2)', format: (v) => `${fmtNum(v)} 回` },
  ];
  return (
    <>
      <Legend series={series} box />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={weekly} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          {grid}
          <XAxis dataKey="weekStart" tickFormatter={fmtDate} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ fill: 'var(--grid)' }}
            content={<ChartTooltip series={series} title={weekTitle} />}
          />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export function LeadTimeChart({ weekly }: { weekly: WeeklyPoint[] }) {
  const series: SeriesDef[] = [
    { key: 'leadTimeP50', label: 'リードタイム', color: 'var(--series-1)', format: fmtHours },
    { key: 'timeToFirstReviewP50', label: '初回レビューまで', color: 'var(--series-2)', format: fmtHours },
  ];
  return (
    <>
      <Legend series={series} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          {grid}
          <XAxis dataKey="weekStart" tickFormatter={fmtDate} {...axis} />
          <YAxis tickFormatter={(v: number) => fmtHours(v)} {...axis} width={56} />
          <Tooltip
            cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }}
            content={<ChartTooltip series={series} title={weekTitle} />}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }}
              connectNulls
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

export function SizeChart({ sizes }: { sizes: SizeBucket[] }) {
  const data = sizes.map((s, i) => ({
    ...s,
    range: s.max == null ? `${sizes[i - 1]?.max ?? 0}行超` : `〜${s.max}行`,
  }));
  const series: SeriesDef[] = [
    { key: 'count', label: 'PR 数', color: 'var(--series-1)', format: (v) => `${fmtNum(v)} 件` },
    { key: 'leadTimeP50', label: 'リードタイム中央値', color: 'var(--text-secondary)', format: fmtHours },
  ];
  return (
    <ResponsiveContainer width="100%" height={262}>
      <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -16 }}>
        {grid}
        <XAxis dataKey="label" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip
          cursor={{ fill: 'var(--grid)' }}
          content={
            <ChartTooltip
              series={series}
              title={(l) => `${l}（${data.find((d) => d.label === l)?.range ?? ''}）`}
            />
          }
        />
        <Bar
          dataKey="count"
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          label={{ position: 'top', fill: 'var(--text-secondary)', fontSize: 11, formatter: (v: number) => (v ? v : '') }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Legend({ series, box }: { series: SeriesDef[]; box?: boolean }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          <i className={box ? 'box' : ''} style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
