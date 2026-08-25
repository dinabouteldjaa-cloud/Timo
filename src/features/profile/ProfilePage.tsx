import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import TimoAvatar from '../../components/avatar/TimoAvatar';
import Badge from '../../components/ui/Badge';
import './ProfilePage.css';

const rows = [
  { label: 'Account', hint: 'Coming soon' },
  { label: 'Notifications', hint: 'Coming soon' },
  { label: 'Preferences', hint: 'Coming soon' },
  { label: 'Language', hint: 'English' },
  { label: 'About Timo', hint: 'v0.1' },
];

export default function ProfilePage() {
  const navigate = useNavigate();

  return (
    <>
      <Header title="Profile" subtitle="Settings" onProfileClick={() => navigate(-1)} />

      <div className="profile-page">
        <Card padding="lg" className="profile-hero">
          <TimoAvatar state="resting" size="lg" />
          <div>
            <p className="profile-hero__name">You</p>
            <p className="profile-hero__sub">Signed-in account coming soon</p>
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

        <p className="profile-note">
          Account, authentication and preferences will be connected once Supabase is introduced.
        </p>
      </div>
    </>
  );
}
