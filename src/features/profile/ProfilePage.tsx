import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TimoMascot from '../../components/ui/TimoMascot';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../state/AuthContext';
import {
  getPushSupportState,
  isEnabledOnThisDevice,
  enablePushNotifications,
  disablePushNotifications,
  type PushSupportState,
} from '../../lib/pushNotifications';
import './ProfilePage.css';

const rows = [
  { label: 'Language', hint: 'English' },
  { label: 'About Timo', hint: 'v0.1' },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [support, setSupport] = useState<PushSupportState>('unsupported');
  const [enabledHere, setEnabledHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);

  useEffect(() => {
    setSupport(getPushSupportState());
    isEnabledOnThisDevice().then(setEnabledHere);
  }, []);

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) || user?.email?.split('@')[0] || 'You';

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  async function handleEnableNotifications() {
    if (!user) return;
    setBusy(true);
    setNotifError(null);
    const result = await enablePushNotifications(user.id);
    setBusy(false);
    setSupport(getPushSupportState());
    if (result.ok) {
      setEnabledHere(true);
    } else {
      setNotifError(result.error ?? 'Could not enable notifications.');
    }
  }

  async function handleDisableNotifications() {
    setBusy(true);
    setNotifError(null);
    const result = await disablePushNotifications();
    setBusy(false);
    if (result.ok) {
      setEnabledHere(false);
    } else {
      setNotifError(result.error ?? 'Could not turn off notifications.');
    }
  }

  function renderNotificationsAction() {
    if (support === 'unsupported') {
      return <Badge tone="neutral">Unsupported</Badge>;
    }
    if (support === 'denied') {
      return <Badge tone="neutral">Blocked</Badge>;
    }
    if (enabledHere) {
      return (
        <Button variant="ghost" size="sm" onClick={handleDisableNotifications} disabled={busy}>
          {busy ? '…' : 'Turn off'}
        </Button>
      );
    }
    return (
      <Button variant="secondary" size="sm" onClick={handleEnableNotifications} disabled={busy}>
        {busy ? '…' : 'Enable'}
      </Button>
    );
  }

  return (
    <>
      <Header title="Profile" subtitle="Settings" onProfileClick={() => navigate(-1)} />

      <div className="profile-page">
        <Card padding="lg" className="profile-hero">
          <div className="profile-hero__mascot">
            <TimoMascot variant="happy" />
          </div>
          <div>
            <p className="profile-hero__name">{displayName}</p>
            <p className="profile-hero__sub">{user?.email}</p>
          </div>
        </Card>

        <Card padding="none">
          <div className="profile-row profile-row--notifications">
            <div>
              <span className="profile-row__label">Notifications</span>
              <p className="profile-row__description">Get reminders for your tasks and events.</p>
            </div>
            {renderNotificationsAction()}
          </div>
          {notifError && <p className="profile-row__error">{notifError}</p>}

          {rows.map((row) => (
            <div className="profile-row" key={row.label}>
              <span className="profile-row__label">{row.label}</span>
              <Badge tone="neutral">{row.hint}</Badge>
            </div>
          ))}
        </Card>

        <div>
          <p className="profile-section-label">Account</p>
          <Card padding="none">
            <button type="button" className="profile-logout-row" onClick={handleLogout}>
              <span className="profile-logout-row__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M16 16l4-4-4-4M20 12H9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="profile-logout-row__label">Log out</span>
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}
