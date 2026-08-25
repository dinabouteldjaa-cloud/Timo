import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../state/AuthContext';
import AuthBrandHeader from './AuthBrandHeader';
import './AuthLayout.css';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Enter your account email.');
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(email.trim());
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <div className="auth-page">
      <AuthBrandHeader subtitle="Plan your day, calmly." />

      <Card padding="lg" className="auth-card">
        <div>
          <p className="auth-heading">Reset your password</p>
          <p className="auth-subheading">We'll email you a link to choose a new password.</p>
        </div>

        {sent ? (
          <p className="auth-success-text">
            If an account exists for {email.trim()}, a reset link is on its way.
          </p>
        ) : (
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

            {error && <p className="auth-error-text">{error}</p>}

            <Button type="submit" fullWidth size="lg" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <div className="auth-footer-row">
          <Link to="/login" className="auth-link">
            Back to log in
          </Link>
        </div>
      </Card>
    </div>
  );
}
