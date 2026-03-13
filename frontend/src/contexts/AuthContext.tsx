import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { UserProfile } from "@/lib/types";
import { config } from "@/lib/config";

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
    const savedToken = localStorage.getItem(config.storageKeys.authToken);
    const savedUser = localStorage.getItem(config.storageKeys.authUser);
    
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
    localStorage.setItem(config.storageKeys.authToken, token);
    localStorage.setItem(config.storageKeys.authUser, JSON.stringify(user));
    // UUID 형식인 경우에만 quizUserId 덮어씀 (목 ID 방지)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    if (isUUID) {
      localStorage.setItem(config.storageKeys.quizUserId, user.id);
    }
    setState({ token, user, isLoggedIn: true });
  }, []);

  const logout = useCallback(() => {
    // localStorage에서 제거
    localStorage.removeItem(config.storageKeys.authToken);
    localStorage.removeItem(config.storageKeys.authUser);
    localStorage.removeItem(config.storageKeys.quizUserId);
    setState({ token: null, user: null, isLoggedIn: false });
  }, []);

  const updateUser = useCallback((partial: Partial<UserProfile>) => {
    setState((prev) => {
      const newUser = prev.user ? { ...prev.user, ...partial } : null;
      if (newUser) {
        localStorage.setItem(config.storageKeys.authUser, JSON.stringify(newUser));
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
