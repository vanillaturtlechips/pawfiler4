import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { UserProfile, AuthTokenPayload } from "@/lib/types";

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isLoggedIn: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateUser: (partial: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const user = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (token && user) {
      try {
        return {
          token,
          user: JSON.parse(user),
          isLoggedIn: true,
        };
      } catch (e) {
        return { token: null, user: null, isLoggedIn: false };
      }
    }
    return {
      token: null,
      user: null,
      isLoggedIn: false,
    };
  });

  const login = useCallback((token: string, user: UserProfile) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setState({ token, user, isLoggedIn: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ token: null, user: null, isLoggedIn: false });
  }, []);

  const updateUser = useCallback((partial: Partial<UserProfile>) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const newUser = { ...prev.user, ...partial };
      localStorage.setItem("user", JSON.stringify(newUser));
      return { ...prev, user: newUser };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
