import type { ReactNode } from 'react';
import './Badge.css';

type Tone = 'neutral' | 'low' | 'medium' | 'high' | 'success' | 'primary';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}

export default function Badge({ children, tone = 'neutral', dot = false }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}
