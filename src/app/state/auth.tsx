import { createContext, useContext, type ReactNode } from 'react';
import type { MeDto } from '@shared/types';

const AuthContext = createContext<MeDto | null>(null);

export function AuthProvider({ me, children }: { me: MeDto; children: ReactNode }) {
  return <AuthContext.Provider value={me}>{children}</AuthContext.Provider>;
}

/** The signed-in user. Only rendered inside authenticated routes. */
export function useAuth(): MeDto {
  const me = useContext(AuthContext);
  if (!me) throw new Error('AuthProvider missing');
  return me;
}
