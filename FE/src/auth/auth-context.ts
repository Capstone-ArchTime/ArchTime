import { createContext, useContext } from 'react';
import type { AuthUser } from './permissions';
import type { Tokens } from './session';

export type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signIn: (tokens: Tokens, rememberMe?: boolean) => Promise<AuthUser>;
  signOut: () => void;
  retry: () => void;
};
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is required.');
  return context;
}
