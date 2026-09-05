import { NavLink } from 'react-router-dom';
import { useLocale } from '../../i18n/LocaleContext';
import './BottomNav.css';

const items = [
  {
    to: '/',
    key: 'today' as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l8 6.5V21a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1V9.5L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/tasks',
    key: 'tasks' as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 12l2.2 2.2L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/calendar',
    key: 'calendar' as const,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/profile',
    key: 'profile' as const,
    // Same profile/user icon already used in Header.tsx's profile
    // button — reused here, not redesigned, just resized to 22x22 to
    // match the other bottom-nav icons (Header's own is 19x19).
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const { t } = useLocale();

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => `bottom-nav__item ${isActive ? 'bottom-nav__item--active' : ''}`}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span className="bottom-nav__label">{t.nav[item.key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
