import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { AuthUser, loginRequest, meRequest, registerRequest } from "../api/authApi";
import { clearToken, getToken, setToken } from "../api/client";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  setBalance: (balance: number) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    meRequest()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { token, user: loggedInUser } = await loginRequest(identifier, password);
    setToken(token);
    setUser(loggedInUser);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const { token, user: newUser } = await registerRequest(email, username, password);
    setToken(token);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const setBalance = useCallback((balance: number) => {
    setUser((prev) => (prev ? { ...prev, balance } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setBalance }),
    [user, loading, login, register, logout, setBalance]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
