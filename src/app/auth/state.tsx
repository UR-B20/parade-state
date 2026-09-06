import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthSession } from './session';

const SignedInContext = createContext<boolean | null>(null);

/** Tracks whether someone is signed in, following the session's own change events. */
export function AuthStateProvider({ session, initial, children }: { session: AuthSession; initial: boolean; children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(initial);
  useEffect(
    () =>
      session.subscribe(() => {
        void session.isSignedIn().then(setSignedIn);
      }),
    [session],
  );
  return <SignedInContext.Provider value={signedIn}>{children}</SignedInContext.Provider>;
}

export function useSignedIn(): boolean {
  const v = useContext(SignedInContext);
  if (v === null) throw new Error('useSignedIn outside AuthStateProvider');
  return v;
}
