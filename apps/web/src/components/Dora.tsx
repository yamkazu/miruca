import type { DoraLevel, MetricsResult } from '@miruca/core';
import { fmtHours, fmtNum, fmtPct } from '../format';

const LEVELS: Record<DoraLevel, { label: string; icon: string; color: string }> = {
  elite: { label: 'Elite', icon: '★', color: 'var(--good)' },
  high: { label: 'High', icon: '✓', color: 'var(--good)' },
  medium: { label: 'Medium', icon: '▲', color: 'var(--warning)' },
  low: { label: 'Low', icon: '▼', color: 'var(--critical)' },
};

function Level({ level }: { level: DoraLevel | null }) {
  if (!level) return <span className="badge">データなし</span>;
  const l = LEVELS[level];
  return (
    <span className="badge">
      <span className="dot" style={{ background: l.color }} aria-hidden />
      <span aria-hidden>{l.icon}</span> {l.label}
    </span>
  );
}

export function Dora({ data }: { data: MetricsResult }) {
  const s = data.summary;
  const items = [
    {
      name: 'デプロイ頻度',
      value: s.deployments > 0 ? `${fmtNum(s.deploymentsPerWeek, 1)} 回 / 週` : '–',
      level: data.dora.deploymentFrequency,
    },
    { name: '変更のリードタイム', value: fmtHours(s.doraLeadTimeP50), level: data.dora.leadTime },
    {
      name: '変更失敗率',
      value: fmtPct(s.changeFailureRate),
      level: data.dora.changeFailureRate,
    },
  ];
  return (
    <>
      <div className="dora">
        {items.map((i) => (
          <div className="dora-item" key={i.name}>
            <div className="name">{i.name}</div>
            <div className="val tabular">{i.value}</div>
            <Level level={i.level} />
          </div>
        ))}
      </div>
      <p className="note">
        変更失敗率は、タイトルが Revert で始まる PR と hotfix / incident / revert / bug ラベルの PR をデプロイ数で割った近似値です。
      </p>
    </>
  );
}
