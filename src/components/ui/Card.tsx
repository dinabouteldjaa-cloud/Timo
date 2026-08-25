import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  interactive?: boolean;
}

export default function Card({
  children,
  padding = 'md',
  interactive = false,
  className = '',
  ...rest
}: CardProps) {
  const classes = [
    'card',
    `card--pad-${padding}`,
    interactive ? 'card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
