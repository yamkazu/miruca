import { useEffect, useState } from 'react';

interface Hello {
  message: string;
  runtime: string;
  region: string;
  time: string;
}

export function App() {
  const [hello, setHello] = useState<Hello | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => (r.ok ? (r.json() as Promise<Hello>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHello)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="app">
      <h1>miruca</h1>
      <p className="lead">GitHub からチームのパフォーマンスを見える化するダッシュボード</p>
      <section className="card" aria-live="polite">
        {error && <p className="error">API に接続できませんでした: {error}</p>}
        {!error && !hello && <p className="muted">API に接続中…</p>}
        {hello && (
          <>
            <p className="message">{hello.message}</p>
            <dl>
              <dt>Runtime</dt>
              <dd>{hello.runtime}</dd>
              <dt>Region</dt>
              <dd>{hello.region}</dd>
              <dt>Time</dt>
              <dd>{new Date(hello.time).toLocaleString('ja-JP')}</dd>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
