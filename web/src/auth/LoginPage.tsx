import { useState, type FormEvent } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { useAuth } from './AuthProvider';
import type { SignInFailure } from './backend';

/** Entry page (round 4 pattern): no navbar, 420 px column, green brand. Email and password only. */
export function LoginPage() {
  const t = useT();
  const { backend } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await backend.signIn(email.trim(), password);
    setBusy(false);
    // On success the session changes and the route guard redirects to the requested page.
    if (!result.ok) setFailure(result.reason);
  }

  return (
    <main className="entry-page" id="app-content">
      <p className="entry-brand">{t('auth.brand')}</p>
      <h1 className="entry-title">{t('auth.title')}</h1>
      {failure && <p className="form-error" role="alert">{t(`auth.error.${failure}`)}</p>}
      <form onSubmit={submit}>
        <label className="field">
          {t('auth.email')}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          {t('auth.password')}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="text-button primary wide" disabled={busy}>
          {busy ? t('auth.submitting') : t('auth.submit')}
        </button>
      </form>
    </main>
  );
}
