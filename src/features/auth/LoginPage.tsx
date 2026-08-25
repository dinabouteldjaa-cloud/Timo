import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../state/AuthContext';
import AuthBrandHeader from './AuthBrandHeader';
import './AuthLayout.css';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <div className="auth-page">
      <AuthBrandHeader subtitle="Plan your day, calmly." />

      <Card padding="lg" className="auth-card">
        <div>
          <p className="auth-heading">Log in</p>
          <p className="auth-subheading">Welcome back — pick up where you left off.</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-field__label">Email</span>
            <input
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className="auth-field">
            <span className="auth-field__label">Password</span>
            <input
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <div className="auth-forgot-row">
            <Link to="/forgot-password" className="auth-link">
              Forgot password?
            </Link>
          </div>

          {error && <p className="auth-error-text">{error}</p>}

          <Button type="submit" fullWidth size="lg" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <div className="auth-footer-row">
          <span>New to Timo?</span>
          <Link to="/signup" className="auth-link">
            Create an account
          </Link>
        </div>
      </Card>
    </div>
  );
}
