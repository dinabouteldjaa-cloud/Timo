import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import IconButton from '../ui/IconButton';
import './Header.css';

interface HeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  onProfileClick?: () => void;
  /** When provided, shows a leading back button instead of the default layout. */
  onBack?: () => void;
}

export default function Header({ title, subtitle, onProfileClick, onBack }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      {onBack && (
        <IconButton aria-label="Back" onClick={onBack} className="app-header__back">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      )}
      <div className="app-header__text">
        {title && <div className="app-header__title">{title}</div>}
        {subtitle && <div className="app-header__subtitle">{subtitle}</div>}
      </div>
      <IconButton
        aria-label="Profile and settings"
        onClick={onProfileClick ?? (() => navigate('/profile'))}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </IconButton>
    </header>
  );
}
