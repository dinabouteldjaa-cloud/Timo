import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../state/AuthContext';
import './ProfilePage.css';

const rows = [
  { label: 'Notifications', hint: 'Coming soon' },
  { label: 'Preferences', hint: 'Coming soon' },
  { label: 'Language', hint: 'English' },
  { label: 'About Timo', hint: 'v0.1' },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) || user?.email?.split('@')[0] || 'You';

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <Header title="Profile" subtitle="Settings" onProfileClick={() => navigate(-1)} />

      <div className="profile-page">
        <Card padding="lg" className="profile-hero">
          <TimoAvatar state="resting" size="lg" />
          <div>
            <p className="profile-hero__name">{displayName}</p>
            <p className="profile-hero__sub">{user?.email}</p>
          </div>
        </Card>

        <Card padding="none">
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
