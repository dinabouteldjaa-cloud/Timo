import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TimoMascot from '../../components/ui/TimoMascot';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../state/AuthContext';
import { useLocale } from '../../i18n/LocaleContext';
import { useAppState } from '../../state/AppStateContext';
import { getOrderedWeekdays } from '../../lib/weekUtils';
import {
  getPushSupportState,
  isEnabledOnThisDevice,
  enablePushNotifications,
  disablePushNotifications,
  type PushSupportState,
} from '../../lib/pushNotifications';
import './ProfilePage.css';

const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];
const SUN_THU = [0, 1, 2, 3, 4];
const MON_FRI = [1, 2, 3, 4, 5];

/** Compares two weekday arrays as SETS (order-independent) — workingDays is stored/compared purely by which days are included, never by array order. */
function sameWeekdaySet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}

const rows = [
  { label: 'Language', hint: 'English' },
  { label: 'About Timo', hint: 'v0.1' },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { t } = useLocale();
  const { firstDayOfWeek, updateFirstDayOfWeek, workingDays, updateWorkingDays } = useAppState();

  const [support, setSupport] = useState<PushSupportState>('unsupported');
  const [enabledHere, setEnabledHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [savingFirstDay, setSavingFirstDay] = useState(false);
  const [savingWorkingDays, setSavingWorkingDays] = useState(false);
  // Purely local/transient UI state — never persisted, never a stored
  // "preset type" (that's explicitly not wanted; see updateWorkingDays
  // below, which only ever writes the actual day numbers). This just
  // controls whether the custom chip editor is expanded, so tapping
  // "Custom" has a visible effect even when the current value happens to
  // already match one of the two presets.
  const [customPanelOpen, setCustomPanelOpen] = useState(false);

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

  /**
   * Persists immediately on selection, matching the spec — updateFirstDayOfWeek
   * already handles optimistic update + rollback on failure internally
   * (see AppStateContext), so there's nothing extra to do here on error
   * beyond not double-submitting while a save is in flight.
   */
  async function handleSelectFirstDay(day: number) {
    if (day === firstDayOfWeek || savingFirstDay) return;
    setSavingFirstDay(true);
    try {
      await updateFirstDayOfWeek(day);
    } catch {
      // Already logged and rolled back by AppStateContext.
    } finally {
      setSavingFirstDay(false);
    }
  }

  // Derived purely from workingDays — never a separately stored preset,
  // per the explicit requirement. customPanelOpen can also force this to
  // 'custom' even when the value happens to match a preset, so tapping
  // "Custom" always has a visible effect.
  const matchesSunThu = sameWeekdaySet(workingDays, SUN_THU);
  const matchesMonFri = sameWeekdaySet(workingDays, MON_FRI);
  const selectedWorkingDaysPreset: 'sun-thu' | 'mon-fri' | 'custom' = customPanelOpen
    ? 'custom'
    : matchesSunThu
      ? 'sun-thu'
      : matchesMonFri
        ? 'mon-fri'
        : 'custom';

  async function persistWorkingDays(days: number[]) {
    setSavingWorkingDays(true);
    try {
      await updateWorkingDays(days);
    } catch {
      // Already logged and rolled back by AppStateContext.
    } finally {
      setSavingWorkingDays(false);
    }
  }

  async function handleSelectWorkingDaysPreset(preset: 'sun-thu' | 'mon-fri' | 'custom') {
    if (savingWorkingDays) return;
    if (preset === 'custom') {
      // Just reveal the chip editor — don't change the stored value
      // until the user actually toggles a day.
      setCustomPanelOpen(true);
      return;
    }
    setCustomPanelOpen(false);
    const days = preset === 'sun-thu' ? SUN_THU : MON_FRI;
    if (sameWeekdaySet(workingDays, days)) return; // already this preset, nothing to save
    await persistWorkingDays(days);
  }

  async function handleToggleWorkingDay(day: number) {
    if (savingWorkingDays) return;
    const has = workingDays.includes(day);
    // At least one working day must always remain selected.
    if (has && workingDays.length === 1) return;
    const next = has ? workingDays.filter((d) => d !== day) : [...workingDays, day].sort((a, b) => a - b);
    await persistWorkingDays(next);
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
          <p className="profile-section-label">{t.profile.preferences}</p>
          <Card padding="none">
            <div className="profile-row profile-row--column">
              <span className="profile-row__label">{t.profile.firstDayOfWeek}</span>
              <div className="profile-weekday-row scroll-row">
                {WEEKDAY_NUMBERS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`profile-weekday-chip ${firstDayOfWeek === day ? 'profile-weekday-chip--active' : ''}`}
                    onClick={() => handleSelectFirstDay(day)}
                    disabled={savingFirstDay}
                  >
                    {t.weekdays.full[day]}
                  </button>
                ))}
              </div>
            </div>
            <div className="profile-row profile-row--column">
              <span className="profile-row__label">{t.profile.weekdays}</span>
              <div className="profile-weekday-row">
                {(
                  [
                    ['sun-thu', t.profile.sundayToThursday],
                    ['mon-fri', t.profile.mondayToFriday],
                    ['custom', t.profile.custom],
                  ] as const
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`profile-weekday-chip ${selectedWorkingDaysPreset === preset ? 'profile-weekday-chip--active' : ''}`}
                    onClick={() => handleSelectWorkingDaysPreset(preset)}
                    disabled={savingWorkingDays}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {selectedWorkingDaysPreset === 'custom' && (
                <div className="profile-weekday-row scroll-row">
                  {/* Ordered by firstDayOfWeek for DISPLAY ONLY — the
                      stored workingDays values are always the fixed
                      0-6 numbers regardless of this order. */}
                  {getOrderedWeekdays(firstDayOfWeek).map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={`profile-weekday-chip ${workingDays.includes(day) ? 'profile-weekday-chip--active' : ''}`}
                      onClick={() => handleToggleWorkingDay(day)}
                      disabled={savingWorkingDays}
                    >
                      {t.weekdays.short[day]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

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
