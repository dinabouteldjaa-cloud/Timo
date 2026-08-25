import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';

export default function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
