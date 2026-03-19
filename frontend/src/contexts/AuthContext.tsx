import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { UserProfile } from "@/lib/types";
import { config } from "@/lib/config";
import { fetchUserFullProfile } from "@/lib/api";

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

/**
 * Returns true when the JWT access token is expired or lacks an exp claim.
 * Used to gate silent refresh on app startup.
 */
const isTokenExpired = (token: string): boolean => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

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
    // user-service에서 실제 닉네임/아바타 fetch해서 AuthContext 동기화
    fetchUserFullProfile(user.id)
      .then((profile) => {
        if (profile?.nickname) {
          const updated = { ...user, nickname: profile.nickname, avatarEmoji: profile.avatarEmoji || user.avatarEmoji || '🥚' };
          localStorage.setItem(config.storageKeys.authUser, JSON.stringify(updated));
          setState((prev) => ({ ...prev, user: updated }));
        }
      })
      .catch(() => {});
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

  // On startup, if the stored token is expired attempt a silent refresh.
  useEffect(() => {
    const savedToken = localStorage.getItem(config.storageKeys.authToken);
    if (savedToken && isTokenExpired(savedToken)) {
      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        fetch(`${config.apiBaseUrl}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.token) {
              localStorage.setItem(config.storageKeys.authToken, data.token);
              if (data.refresh_token) {
                localStorage.setItem("refresh_token", data.refresh_token);
              }
            } else {
              logout();
            }
          })
          .catch(() => logout());
      } else {
        logout();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for the auth:logout event dispatched by the API layer when a token
  // refresh fails, and force a full logout so stale state is cleared.
  useEffect(() => {
    const handleForceLogout = () => logout();
    window.addEventListener("auth:logout", handleForceLogout);
    return () => window.removeEventListener("auth:logout", handleForceLogout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
