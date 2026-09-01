import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import TimoMascot from '../../components/ui/TimoMascot';
import { useAuth } from '../../state/AuthContext';
import { getPushSupportState, isEnabledOnThisDevice, enablePushNotifications } from '../../lib/pushNotifications';
import './NotificationOnboardingCard.css';

// Remembers "Maybe later" (or an explicit permission denial) per-device,
// so this never reappears on every refresh once the user has made a
// choice. This is a UX-only flag — it has no bearing on whether push is
// actually enabled; getPushSupportState()/isEnabledOnThisDevice() (the
// same real checks Profile uses) remain the source of truth for that.
const DISMISS_KEY = 'timo_notification_prompt_dismissed';

/**
 * Shown once on a user's first authenticated session (Today is the
 * landing screen after login) to offer enabling push notifications,
 * without forcing them to find the setting in Profile first. This does
 * NOT implement a second notification system — enabling here calls the
 * exact same enablePushNotifications() from src/lib/pushNotifications.ts
 * that Profile's "Enable" button already calls, which in turn triggers
 * the real browser/iOS permission prompt and the existing
 * service-worker + VAPID + Supabase subscription flow. Profile's manual
 * toggle remains fully intact as a fallback regardless of what happens
 * here.
 */
export default function NotificationOnboardingCard() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      // Already asked before on this device — never show again regardless
      // of the outcome that time.
      if (localStorage.getItem(DISMISS_KEY) === '1') return;

      // Same real browser/OS check Profile uses. Never show on an
      // unsupported browser, or if the user has already denied
      // notifications at the OS/browser level — Profile already
      // communicates "Unsupported"/"Blocked" in those cases, and there's
      // nothing this prompt could usefully add.
      const support = getPushSupportState();
      if (support === 'unsupported' || support === 'denied') return;

      // Already enabled on this device — nothing to prompt for.
      const alreadyEnabled = await isEnabledOnThisDevice();
      if (alreadyEnabled) return;

      if (!cancelled) setVisible(true);
    }

    checkEligibility();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  async function handleEnable() {
    if (!user) return;
    setBusy(true);
    setError(null);

    // The exact same call Profile's "Enable" button makes.
    const result = await enablePushNotifications(user.id);
    setBusy(false);

    if (result.ok) {
      localStorage.setItem(DISMISS_KEY, '1');
      setVisible(false);
      return;
    }

    setError(result.error ?? 'Could not enable notifications.');
    // Only remember this permanently if the user explicitly denied the
    // native permission prompt — a transient/config error shouldn't
    // silently hide this on every future session, since that wasn't a
    // real "no" from the user.
    if (getPushSupportState() === 'denied') {
      localStorage.setItem(DISMISS_KEY, '1');
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <Card padding="md" className="notification-onboarding">
      <div className="notification-onboarding__mascot">
        <TimoMascot variant="greeting" />
      </div>
      <div className="notification-onboarding__body">
        <p className="notification-onboarding__title">Stay on track</p>
        <p className="notification-onboarding__message">
          Turn on notifications so Timo can remind you about tasks and events.
        </p>
        <div className="notification-onboarding__actions">
          <Button size="sm" onClick={handleEnable} disabled={busy}>
            {busy ? '…' : 'Enable notifications'}
          </Button>
          <Button variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
            Maybe later
          </Button>
        </div>
        {error && <p className="notification-onboarding__error">{error}</p>}
      </div>
    </Card>
  );
}
