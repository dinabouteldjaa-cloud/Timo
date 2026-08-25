import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
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

        <Button variant="danger" fullWidth size="lg" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </>
  );
}
