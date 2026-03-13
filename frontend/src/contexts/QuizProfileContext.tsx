import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { QuizGameProfile } from "@/lib/types";
import { fetchUserStats, fetchUserProfile } from "@/lib/api";
import { useAuth } from "./AuthContext";

interface QuizProfileContextValue {
  quizProfile: QuizGameProfile | null;
  updateQuizProfile: (profile: QuizGameProfile) => void;
  refreshQuizProfile: () => Promise<void>;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  pendingNav: string | null;
  setPendingNav: (path: string | null) => void;
}

const QuizProfileContext = createContext<QuizProfileContextValue | null>(null);

export const useQuizProfile = () => {
  const ctx = useContext(QuizProfileContext);
  if (!ctx) throw new Error("useQuizProfile must be inside QuizProfileProvider");
  return ctx;
};

export const QuizProfileProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn } = useAuth();
  const [quizProfile, setQuizProfile] = useState<QuizGameProfile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const updateQuizProfile = useCallback((profile: QuizGameProfile) => {
    setQuizProfile(profile);
  }, []);

  const refreshQuizProfile = useCallback(async () => {
    try {
      // GetUserProfile 엔드포인트로 profile 데이터 로드
      const profile = await fetchUserProfile();
      if (profile) {
        setQuizProfile(profile);
        return;
      }
      // fallback: GetUserStats 응답의 profile 필드 사용
      const stats = await fetchUserStats();
      if (stats.profile) {
        setQuizProfile(stats.profile);
      }
    } catch {
      // 실패해도 기존 값 유지
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      refreshQuizProfile();
    } else {
      setQuizProfile(null);
    }
  }, [isLoggedIn, refreshQuizProfile]);

  return (
    <QuizProfileContext.Provider value={{ quizProfile, updateQuizProfile, refreshQuizProfile, isPlaying, setIsPlaying, pendingNav, setPendingNav }}>
      {children}
    </QuizProfileContext.Provider>
  );
};
