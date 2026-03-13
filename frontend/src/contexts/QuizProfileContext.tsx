import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { QuizGameProfile } from "@/lib/types";
import { fetchUserStats } from "@/lib/api";
import { useAuth } from "./AuthContext";

interface QuizProfileContextValue {
  quizProfile: QuizGameProfile | null;
  updateQuizProfile: (profile: QuizGameProfile) => void;
  refreshQuizProfile: () => Promise<void>;
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

  const updateQuizProfile = useCallback((profile: QuizGameProfile) => {
    setQuizProfile(profile);
  }, []);

  const refreshQuizProfile = useCallback(async () => {
    try {
      const stats = await fetchUserStats();
      if (stats.level !== undefined) {
        setQuizProfile({
          level: stats.level,
          tierName: stats.tierName ?? '알 껍데기 병아리',
          totalExp: stats.totalExp ?? 0,
          totalCoins: stats.totalCoins ?? 0,
          energy: stats.energy ?? 100,
          maxEnergy: stats.maxEnergy ?? 100,
        });
      }
    } catch {
      // 실패해도 기존 값 유지
    }
  }, []);

  // 로그인 시 자동 로드
  useEffect(() => {
    if (isLoggedIn) {
      refreshQuizProfile();
    } else {
      setQuizProfile(null);
    }
  }, [isLoggedIn, refreshQuizProfile]);

  return (
    <QuizProfileContext.Provider value={{ quizProfile, updateQuizProfile, refreshQuizProfile }}>
      {children}
    </QuizProfileContext.Provider>
  );
};
