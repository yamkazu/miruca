import { type FormEvent, useEffect, useState } from 'react';

interface User {
  userId: string;
  email: string;
}

type View =
  | { kind: 'loading' }
  | { kind: 'signedOut'; devLogin: boolean }
  | { kind: 'signedIn'; user: User }
  | { kind: 'error'; message: string };

async function fetchView(): Promise<View> {
  const res = await fetch('/api/me');
  if (res.status === 401) return { kind: 'signedOut', devLogin: ((await res.json()) as { devLogin: boolean }).devLogin };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { kind: 'signedIn', user: (await res.json()) as User };
}

const loadView = () => fetchView().catch((e: Error): View => ({ kind: 'error', message: e.message }));

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    loadView().then(setView);
  }, []);

  const post = async (path: string, body?: unknown) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      setView({ kind: 'error', message: `HTTP ${res.status}` });
      return;
    }
    setView(await loadView());
  };

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          miruca<span className="version">0.1</span>
        </div>
        {view.kind === 'signedIn' && (
          <div className="account">
            <span>{view.user.email}</span>
            <button type="button" className="link" onClick={() => post('/api/auth/logout')}>
              ログアウト
            </button>
          </div>
        )}
      </header>
      <main className="main">
        <div className="card" aria-live="polite">
          {view.kind === 'loading' && <p className="muted">読み込み中…</p>}
          {view.kind === 'error' && <p className="error">API に接続できませんでした: {view.message}</p>}
          {view.kind === 'signedOut' && <Login devLogin={view.devLogin} onDevLogin={(email) => post('/api/dev/login', { email })} />}
          {view.kind === 'signedIn' && (
            <div className="heading">
              <h1>ログインしました</h1>
              <p className="muted">{view.user.email} として使っています。</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Login({ devLogin, onDevLogin }: { devLogin: boolean; onDevLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onDevLogin(email);
  };

  return (
    <>
      <div className="heading">
        <h1>チームの開発の流れを数字で見る</h1>
        <p className="muted">
          {devLogin ? 'ローカル専用のログインです。メールを送らずにログインします。' : 'ログインの方法は準備中です。'}
        </p>
      </div>
      {devLogin && (
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">メールアドレス（省くと sample@miruca.local）</label>
            <input
              id="email"
              type="email"
              value={email}
              placeholder="sample@miruca.local"
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="primary">
            サンプルのユーザーとして入る
          </button>
        </form>
      )}
      {!devLogin && <p className="note">miruca は招待制です。使えるのは、運営者が登録したメールアドレスだけです。</p>}
    </>
  );
}
