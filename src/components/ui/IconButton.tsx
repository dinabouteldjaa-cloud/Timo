import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './IconButton.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md';
}

export default function IconButton({ children, size = 'md', className = '', ...rest }: IconButtonProps) {
  return (
    <button className={`icon-btn icon-btn--${size} ${className}`} type="button" {...rest}>
      {children}
    </button>
  );
}
