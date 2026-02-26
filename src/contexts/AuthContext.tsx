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
  // localStorage에서 초기 상태 복원
  const [state, setState] = useState<AuthState>(() => {
    const savedToken = localStorage.getItem("auth_token");
    const savedUser = localStorage.getItem("auth_user");
    
    if (savedToken && savedUser) {
      try {
        return {
          token: savedToken,
          user: JSON.parse(savedUser),
          isLoggedIn: true,
        };
      } catch {
        return { token: null, user: null, isLoggedIn: false };
      }
    }
    
    return { token: null, user: null, isLoggedIn: false };
  });

  const login = useCallback((token: string, user: UserProfile) => {
    // localStorage에 저장
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    setState({ token, user, isLoggedIn: true });
  }, []);

  const logout = useCallback(() => {
    // localStorage에서 제거
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setState({ token: null, user: null, isLoggedIn: false });
  }, []);

  const updateUser = useCallback((partial: Partial<UserProfile>) => {
    setState((prev) => {
      const newUser = prev.user ? { ...prev.user, ...partial } : null;
      if (newUser) {
        localStorage.setItem("auth_user", JSON.stringify(newUser));
      }
      return {
        ...prev,
        user: newUser,
      };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
