import type { ContributorStats, RepoStats, SlowPr } from '@miruca/core';
import { fmtDate, fmtHours, fmtNum } from '../format';

export function ContributorsTable({ rows }: { rows: ContributorStats[] }) {
  if (!rows.length) return <p className="note">期間中の活動はありません。</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>メンバー</th>
            <th className="num">マージ PR</th>
            <th className="num">レビュー</th>
            <th className="num">リードタイム</th>
            <th className="num">PR サイズ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.login}>
              <td>{r.login}</td>
              <td className="num tabular">{fmtNum(r.mergedPrs)}</td>
              <td className="num tabular">{fmtNum(r.reviewsGiven)}</td>
              <td className="num tabular">{fmtHours(r.leadTimeP50)}</td>
              <td className="num tabular">{r.sizeP50 == null ? '–' : `${fmtNum(r.sizeP50)}行`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReposTable({ rows }: { rows: RepoStats[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>リポジトリ</th>
            <th className="num">マージ PR</th>
            <th className="num">デプロイ</th>
            <th>デプロイの数え方</th>
            <th className="num">リードタイム</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.repo}>
              <td>{r.repo}</td>
              <td className="num tabular">{fmtNum(r.mergedPrs)}</td>
              <td className="num tabular">{fmtNum(r.deployments)}</td>
              <td>{r.deploymentSource === 'releases' ? 'Release' : 'マージ'}</td>
              <td className="num tabular">{fmtHours(r.leadTimeP50)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SlowestTable({ rows }: { rows: SlowPr[] }) {
  if (!rows.length) return <p className="note">期間中にマージされた PR はありません。</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>PR</th>
            <th>作成者</th>
            <th className="num">マージ日</th>
            <th className="num">リードタイム</th>
            <th className="num">サイズ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.repo}#${r.number}`}>
              <td className="title">
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.repo}#{r.number}
                </a>{' '}
                {r.title}
              </td>
              <td>{r.author ?? '–'}</td>
              <td className="num tabular">{fmtDate(r.mergedAt)}</td>
              <td className="num tabular">{fmtHours(r.leadTime)}</td>
              <td className="num tabular">{fmtNum(r.size)}行</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
