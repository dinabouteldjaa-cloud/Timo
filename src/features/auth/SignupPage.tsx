import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../state/AuthContext';
import AuthBrandHeader from './AuthBrandHeader';
import './AuthLayout.css';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    const result = await signUp(email.trim(), password, name.trim() || undefined);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    // If email confirmation is required, there is no session yet.
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <div className="auth-page">
        <AuthBrandHeader subtitle="Plan your day, calmly." />
        <Card padding="lg" className="auth-card">
          <p className="auth-heading">Check your email</p>
          <p className="auth-subheading">
            We sent a confirmation link to {email.trim()}. Confirm your address, then log in.
          </p>
          <Button fullWidth size="lg" onClick={() => navigate('/login', { replace: true })}>
            Go to log in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthBrandHeader subtitle="Plan your day, calmly." />

      <Card padding="lg" className="auth-card">
        <div>
          <p className="auth-heading">Create your account</p>
          <p className="auth-subheading">Timo will help you figure out when to do it.</p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span className="auth-field__label">Name</span>
            <input
              className="auth-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </label>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          {error && <p className="auth-error-text">{error}</p>}

          <Button type="submit" fullWidth size="lg" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>

        <div className="auth-footer-row">
          <span>Already have an account?</span>
          <Link to="/login" className="auth-link">
            Log in
          </Link>
        </div>
      </Card>
    </div>
  );
}
