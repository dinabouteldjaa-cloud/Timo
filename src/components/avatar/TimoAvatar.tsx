import './TimoAvatar.css';

/**
 * TimoAvatar
 * ---------------------------------------------------------------------
 * Placeholder for Timo's future character artwork.
 *
 * Real artwork does not exist yet. This component exists so the rest of
 * the app can already reference `<TimoAvatar state="..." />` and, later,
 * only this file needs to change to swap in transparent PNG/WebP art per
 * state — no call sites elsewhere need to be touched.
 *
 * To wire up real art later: replace the placeholder markup below with an
 * <img> per state (e.g. import happyImg from './states/happy.webp') and
 * map `state` -> asset.
 * ---------------------------------------------------------------------
 */
export type TimoAvatarState =
  | 'greeting'
  | 'happy'
  | 'focused'
  | 'thinking'
  | 'concerned'
  | 'celebrating'
  | 'resting';

interface TimoAvatarProps {
  state?: TimoAvatarState;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 40, md: 56, lg: 88 };

export default function TimoAvatar({ state = 'greeting', size = 'md' }: TimoAvatarProps) {
  const px = sizeMap[size];

  return (
    <div
      className={`timo-avatar timo-avatar--${state}`}
      style={{ width: px, height: px }}
      data-avatar-state={state}
      aria-label={`Timo, ${state}`}
      role="img"
    >
      <span className="timo-avatar__face">🙂</span>
    </div>
  );
}
