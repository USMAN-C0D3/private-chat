import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import { api } from "@/lib/api";
import { closeChatSocket } from "@/lib/socket";
import type { LoginCredentials, SessionResponse, Username } from "@/types/api";


type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  session: SessionResponse | null;
  user: Username | null;
  userDisplayName: string | null;
  partner: Username | null;
  partnerDisplayName: string | null;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}


const AuthContext = createContext<AuthContextValue | null>(null);


export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<SessionResponse | null>(null);

  async function refreshSession() {
    try {
      const nextSession = await api.getSession();
      setSession(nextSession);
    } catch {
      setSession(null);
    } finally {
      setStatus("ready");
    }
  }

  async function login(credentials: LoginCredentials) {
    closeChatSocket();
    const nextSession = await api.login(credentials);
    setSession(nextSession);
    setStatus("ready");
  }

  async function logout() {
    closeChatSocket();
    await api.logout();
    const nextSession = await api.getSession();
    setSession(nextSession);
    setStatus("ready");
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const nextSession = await api.getSession();
        if (!active) {
          return;
        }
        setSession(nextSession);
      } catch {
        if (!active) {
          return;
        }
        setSession(null);
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const isAuthenticated = Boolean(session?.authenticated);
  const user = isAuthenticated ? session?.user ?? null : null;
  const userDisplayName = isAuthenticated ? session?.userDisplayName ?? null : null;
  const partner = isAuthenticated ? session?.partner ?? null : null;
  const partnerDisplayName = isAuthenticated ? session?.partnerDisplayName ?? null : null;

  return (
    <AuthContext.Provider
      value={{
        status,
        session,
        user,
        userDisplayName,
        partner,
        partnerDisplayName,
        isAuthenticated,
        refreshSession,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
