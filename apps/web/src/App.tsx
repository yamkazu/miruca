import { useEffect, useMemo, useState } from 'react';
import type { MetricsResult } from '@miruca/core';
import { fmtDate, fmtHours, toDateInput } from './format';
import { Kpis } from './components/Kpis';
import { Dora } from './components/Dora';
import { ThroughputChart, LeadTimeChart, SizeChart } from './components/Charts';
import { ContributorsTable, ReposTable, SlowestTable } from './components/Tables';

const PRESETS = [
  { label: '4週', weeks: 4 },
  { label: '12週', weeks: 12 },
  { label: '26週', weeks: 26 },
];

function rangeFor(weeks: number) {
  const to = new Date();
  const from = new Date(to.getTime() - weeks * 7 * 86_400_000 + 86_400_000);
  return { from: toDateInput(from), to: toDateInput(to) };
}

export function App() {
  const [weeks, setWeeks] = useState(12);
  const [repo, setRepo] = useState('');
  const [author, setAuthor] = useState('');
  const [data, setData] = useState<MetricsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => rangeFor(weeks), [weeks]);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (repo) params.set('repos', repo);
    if (author) params.set('authors', author);
    setLoading(true);
    fetch(`/api/metrics?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<MetricsResult>;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(String(e.message ?? e));
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [range, repo, author]);

  return (
    <div className="app">
      <header className="header">
        <h1>miruca</h1>
        {data?.available.fetchedAt && (
          <span className="meta">
            最終取得 {new Date(data.available.fetchedAt).toLocaleString('ja-JP')} ・ {data.available.repos.length} リポジトリ
          </span>
        )}
      </header>

      <div className="filters">
        <label>
          期間
          <div className="segmented" role="group" aria-label="期間">
            {PRESETS.map((p) => (
              <button key={p.weeks} aria-pressed={weeks === p.weeks} onClick={() => setWeeks(p.weeks)}>
                {p.label}
              </button>
            ))}
          </div>
        </label>
        <label>
          リポジトリ
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">すべて</option>
            {data?.available.repos.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          メンバー
          <select value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">チーム全体</option>
            {data?.available.authors.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <span className="note" aria-live="polite">
          {fmtDate(range.from)} 〜 {fmtDate(range.to)} {loading ? '・読み込み中…' : ''}
        </span>
      </div>

      {error && <div className="card error">データを取得できませんでした: {error}</div>}
      {!error && data && data.available.repos.length === 0 && (
        <div className="card empty">
          まだデータがありません。収集ジョブ（collector）を実行すると、ここに表示されます。
        </div>
      )}
      {!error && data && data.available.repos.length > 0 && (
        <>
          <Kpis summary={data.summary} previous={data.previous} />
          <div className="grid two">
            <div className="card">
              <h2>DORA メトリクス</h2>
              <p className="sub">デプロイ = Release（無いリポジトリは既定ブランチへのマージ）</p>
              <Dora data={data} />
            </div>
            <div className="card">
              <h2>週ごとのマージ PR 数</h2>
              <p className="sub">スループット</p>
              <ThroughputChart weekly={data.weekly} />
            </div>
          </div>
          <div className="grid two">
            <div className="card">
              <h2>リードタイムの推移（中央値）</h2>
              <p className="sub">最初のコミット → マージ と、レビュー依頼 → 初回レビュー</p>
              <LeadTimeChart weekly={data.weekly} />
            </div>
            <div className="card">
              <h2>PR サイズ別の件数</h2>
              <p className="sub">変更行数（追加 + 削除）。小さい PR ほど早くマージされる傾向を確認できます</p>
              <SizeChart sizes={data.sizes} />
            </div>
          </div>
          <div className="grid two">
            <div className="card">
              <h2>メンバー</h2>
              <p className="sub">期間中にマージした PR と、他の人の PR へのレビュー数</p>
              <ContributorsTable rows={data.contributors} />
            </div>
            <div className="card">
              <h2>リポジトリ</h2>
              <p className="sub">デプロイの数え方はリポジトリごとに自動判定</p>
              <ReposTable rows={data.repos} />
            </div>
          </div>
          <div className="card">
            <h2>リードタイムが長かった PR</h2>
            <p className="sub">上位 10 件。中央値 {fmtHours(data.summary.leadTimeP50)}</p>
            <SlowestTable rows={data.slowest} />
          </div>
        </>
      )}
    </div>
  );
}
