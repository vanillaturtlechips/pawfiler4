import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
import { useNavigate } from "react-router-dom";
import { fetchUserFullProfile, fetchUserActivities, updateUserProfile, syncProfileToQuiz, syncAuthorToCommunity, type UserFullProfile, type UserActivity } from "@/lib/api";
import { config } from "@/lib/config";
import { toast } from "sonner";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Star, Coins, TrendingUp,
  Heart, Eye, Zap, Crown,
  Edit2, Save, X, BookOpen, BarChart3, Settings
} from "lucide-react";

const ProfilePage = () => {
  const { user, updateUser } = useAuth();
  const { quizProfile } = useQuizProfile();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"journey" | "stats" | "settings">("journey");
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editedNickname, setEditedNickname] = useState(user?.nickname || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarEmoji || "🦊");
  const [isSaving, setIsSaving] = useState(false);
  const [fullProfile, setFullProfile] = useState<UserFullProfile | null>(null);
  const [activities, setActivities] = useState<UserActivity[]>([]);

  const userId = localStorage.getItem(config.storageKeys.quizUserId) || "";

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!userId) return;
    fetchUserFullProfile(userId)
      .then(setFullProfile)
      .catch(() => {});
    fetchUserActivities(userId)
      .then(setActivities)
      .catch(() => {});
  }, [userId]);

  if (!user) {
    return null;
  }

  const handleSaveAvatar = async () => {
    if (!userId || selectedAvatar === user.avatarEmoji) return;
    setIsSaving(true);
    try {
      const res = await updateUserProfile(userId, undefined, selectedAvatar);
      updateUser({ avatarEmoji: res.avatarEmoji ?? res.avatar_emoji });
      await Promise.all([
        syncProfileToQuiz(user.nickname, res.avatarEmoji ?? res.avatar_emoji),
        syncAuthorToCommunity(userId, user.nickname, res.avatarEmoji ?? res.avatar_emoji),
      ]);
      toast.success("아바타가 저장되었습니다!");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNickname = async () => {
    if (!userId || !editedNickname.trim()) return;
    setIsSaving(true);
    try {
      const res = await updateUserProfile(userId, editedNickname.trim(), undefined);
      updateUser({ nickname: res.nickname });
      await Promise.all([
        syncProfileToQuiz(res.nickname, user.avatarEmoji || '🥚'),
        syncAuthorToCommunity(userId, res.nickname, user.avatarEmoji || '🥚'),
      ]);
      setIsEditingNickname(false);
      toast.success("닉네임이 저장되었습니다!");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const avatarOptions = ["🦊", "🐶", "🐱", "🐰", "🐻", "🐼", "🦝", "🐨", "🐯", "🦁", "🐮", "🐷"];

  const achievements = [
    { id: 1, icon: "🏆", title: "첫 걸음", desc: "첫 퀴즈 완료", unlocked: (fullProfile?.totalQuizzes ?? fullProfile?.total_quizzes ?? 0) >= 1 },
    { id: 2, icon: "🔥", title: "연속 달성", desc: "3일 연속 접속", unlocked: (fullProfile?.currentStreak ?? fullProfile?.current_streak ?? 0) >= 3 },
    { id: 3, icon: "⚡", title: "스피드 러너", desc: "10초 안에 정답", unlocked: (fullProfile?.totalQuizzes ?? fullProfile?.total_quizzes ?? 0) >= 5 },
    { id: 4, icon: "🎯", title: "명중률 달인", desc: "정답률 90% 달성", unlocked: (fullProfile?.correctRate ?? fullProfile?.correct_rate ?? 0) >= 90 },
    { id: 5, icon: "💎", title: "수집가", desc: "모든 배지 획득", unlocked: false },
    { id: 6, icon: "🌟", title: "레벨 마스터", desc: "레벨 10 달성", unlocked: (fullProfile?.level ?? 0) >= 10 },
  ];

  const stats = {
    totalQuizzes: fullProfile?.totalQuizzes ?? fullProfile?.total_quizzes ?? 0,
    correctRate: Math.round(fullProfile?.correctRate ?? fullProfile?.correct_rate ?? 0),
    totalAnalysis: fullProfile?.totalAnalysis ?? fullProfile?.total_analysis ?? 0,
    communityPosts: fullProfile?.communityPosts ?? fullProfile?.community_posts ?? 0,
    currentStreak: fullProfile?.currentStreak ?? fullProfile?.current_streak ?? 0,
    bestStreak: fullProfile?.bestStreak ?? fullProfile?.best_streak ?? 0,
  };

  const currentExp = quizProfile?.totalExp ?? 0;
  const currentTier = quizProfile?.tierName ?? '알 Lv.1';
  const expMaxXP = (() => {
    if (currentTier.startsWith('불사조')) {
      if (currentExp >= 8000) return 10000;
      if (currentExp >= 6000) return 8000;
      if (currentExp >= 4000) return 6000;
      if (currentExp >= 2000) return 4000;
      return 2000;
    }
    if (currentTier.startsWith('맹금닭')) {
      if (currentExp >= 3200) return 4000;
      if (currentExp >= 2400) return 3200;
      if (currentExp >= 1600) return 2400;
      if (currentExp >= 800) return 1600;
      return 800;
    }
    if (currentTier.startsWith('삐약이')) {
      if (currentExp >= 1600) return 2000;
      if (currentExp >= 1200) return 1600;
      if (currentExp >= 800) return 1200;
      if (currentExp >= 400) return 800;
      return 400;
    }
    // 알
    if (currentExp >= 800) return 1000;
    if (currentExp >= 600) return 800;
    if (currentExp >= 400) return 600;
    if (currentExp >= 200) return 400;
    return 200;
  })();

  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-hidden">
      <motion.div
        className="flex flex-col h-full gap-3 p-3 max-w-[1400px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="font-jua text-base hover:bg-wood-dark/20 rounded-xl px-3 py-1.5"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            뒤로
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-3xl">📖</span>
            <h1 className="font-jua text-3xl text-foreground text-shadow-glow">
              나의 탐정 일지
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-[260px_1fr] gap-3 flex-1 min-h-0">
          {/* Left - Vertical Profile Card */}
          <ParchmentPanel className="rounded-2xl border-4 p-3 h-full flex flex-col shadow-xl">
            <div className="flex flex-col items-center space-y-2 flex-1">
              {/* Avatar */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-5xl bg-gradient-to-br from-amber-50 to-orange-50 border-3 border-amber-200 shadow-lg">
                  {user.avatarEmoji}
                </div>
                {/* Level Badge */}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm bg-gradient-to-br from-amber-400 to-orange-500 text-white border-2 border-white shadow-lg">
                  {quizProfile?.level ?? user.level}
                </div>
                {/* Premium Crown */}
                {user.subscriptionType === "premium" && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <Crown className="w-5 h-5 text-yellow-500 drop-shadow-lg" fill="currentColor" />
                  </div>
                )}
              </div>

              {/* Name & Title */}
              <div className="text-center w-full">
                <h2 className="font-jua text-lg text-wood-darkest mb-0.5">
                  {user.nickname}
                </h2>
                <div className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 inline-block mb-1">
                  <span className="font-jua text-xs text-amber-800">
                    {quizProfile?.tierName ?? user.levelTitle}
                  </span>
                </div>
                <p className="text-xs text-wood-dark truncate">{user.email}</p>
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-parchment-border to-transparent"></div>

              {/* XP Bar */}
              <div className="w-full">
                <div className="flex justify-between text-xs font-bold mb-1 text-wood-dark">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-500" />
                    경험치
                  </span>
                  <span className="text-xs">{currentExp} / {expMaxXP} XP</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-amber-100 border border-amber-300">
                  <motion.div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (currentExp / expMaxXP) * 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Coins */}
              <div className="w-full p-2 rounded-xl bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-300">
                <div className="flex items-center justify-center gap-2">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span className="font-jua text-lg font-bold text-amber-800">
                    {(quizProfile?.totalCoins ?? user.coins).toLocaleString()} 코인
                  </span>
                </div>
              </div>

              {/* Energy Bar */}
              {quizProfile && (
                <div className="w-full">
                  <div className="flex justify-between text-xs font-bold mb-1 text-wood-dark">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-500" />
                      에너지
                    </span>
                    <span className="text-xs">{quizProfile.energy} / {quizProfile.maxEnergy}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-yellow-100 border border-yellow-300">
                    <motion.div
                      className="h-full"
                      style={{ background: quizProfile.energy > 30 ? "linear-gradient(90deg,#facc15,#f59e0b)" : "linear-gradient(90deg,#ef4444,#dc2626)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(quizProfile.energy / quizProfile.maxEnergy) * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-xs text-wood-dark opacity-60 mt-0.5 text-right">3시간마다 +10 자동 충전</p>
                </div>
              )}

              {/* Divider */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-parchment-border to-transparent"></div>

              {/* Quick Stats */}
              <div className="w-full flex-1">
                <h3 className="font-jua text-xs text-wood-darkest mb-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-orange-600" />
                  한눈에 보기
                </h3>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-wood-dark">총 퀴즈</span>
                    <span className="font-jua text-sm text-wood-darkest">{stats.totalQuizzes}회</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-wood-dark">정답률</span>
                    <span className="font-jua text-sm text-green-600">{stats.correctRate}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-wood-dark">영상 분석</span>
                    <span className="font-jua text-sm text-wood-darkest">{stats.totalAnalysis}회</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-wood-dark">게시글</span>
                    <span className="font-jua text-sm text-wood-darkest">{stats.communityPosts}개</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-parchment-border">
                    <span className="text-xs text-wood-dark">연속 기록</span>
                    <span className="font-jua text-sm text-orange-600">🔥 {stats.currentStreak}일</span>
                  </div>
                </div>
              </div>
            </div>
          </ParchmentPanel>

          {/* Right - Large Content Area */}
          <div className="flex flex-col h-full min-h-0 gap-2">
            {/* Tab Navigation */}
            <div className="grid grid-cols-4 gap-2 flex-shrink-0">
              <Button
                onClick={() => setActiveTab("journey")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-colors shadow-md ${
                  activeTab === "journey"
                    ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-orange-50"
                }`}
              >
                <BookOpen className="w-4 h-4 mr-1" />
                나의 여정
              </Button>
              <Button
                onClick={() => setActiveTab("stats")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-colors shadow-md ${
                  activeTab === "stats"
                    ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-blue-50"
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-1" />
                통계
              </Button>
              <Button
                onClick={() => setActiveTab("settings")}
                className={`font-jua text-sm py-2.5 rounded-xl border-3 transition-colors shadow-md ${
                  activeTab === "settings"
                    ? "bg-green-500 hover:bg-green-600 text-white border-green-600 shadow-lg"
                    : "bg-white text-wood-darkest border-parchment-border hover:bg-green-50"
                }`}
              >
                <Settings className="w-4 h-4 mr-1" />
                설정
              </Button>
              <Button
                onClick={() => navigate("/shop")}
                className="font-jua text-sm py-2.5 rounded-xl border-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-purple-600 shadow-lg transition-colors"
              >
                <Crown className="w-4 h-4 mr-1" />
                상점
              </Button>
            </div>

            {/* Tab Content */}
            <ParchmentPanel className="rounded-2xl border-4 p-4 flex-1 min-h-0 overflow-hidden shadow-xl">
              {/* Journey Tab */}
              {activeTab === "journey" && (
                <div className="h-full overflow-y-auto pr-1">

                  {/* 타이틀 */}
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-4xl drop-shadow-md">📚</span>
                    <div>
                      <h3 className="font-jua text-2xl text-wood-darkest leading-tight">나의 모험 이야기</h3>
                      <p className="font-jua text-sm text-amber-600">오늘도 열심히 탐정 활동을 했어요!</p>
                    </div>
                  </div>

                  {/* 연속 기록 - 상단 강조 */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <motion.div
                      className="p-4 rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-300 text-center shadow-md"
                      whileHover={{ scale: 1.03 }}
                    >
                      <div className="text-4xl mb-1">🔥</div>
                      <p className="font-jua text-base text-orange-800 mb-1">지금 연속 기록</p>
                      <p className="font-jua text-4xl text-orange-600 leading-none">{stats.currentStreak}<span className="text-xl">일</span></p>
                    </motion.div>
                    <motion.div
                      className="p-4 rounded-2xl bg-gradient-to-br from-yellow-100 to-amber-100 border-2 border-yellow-300 text-center shadow-md"
                      whileHover={{ scale: 1.03 }}
                    >
                      <div className="text-4xl mb-1">⭐</div>
                      <p className="font-jua text-base text-yellow-800 mb-1">최고 기록</p>
                      <p className="font-jua text-4xl text-yellow-600 leading-none">{stats.bestStreak}<span className="text-xl">일</span></p>
                    </motion.div>
                  </div>

                  {/* 최근 활동 */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">📅</span>
                      <h4 className="font-jua text-lg text-wood-darkest">최근 활동</h4>
                    </div>
                    <div className="space-y-3">
                      {activities.length === 0 && (
                        <div className="text-center py-6">
                          <span className="text-5xl">🌱</span>
                          <p className="font-jua text-base text-wood-dark mt-2">아직 활동 기록이 없어요</p>
                          <p className="font-jua text-sm text-amber-600">퀴즈를 풀고 모험을 시작해봐요!</p>
                        </div>
                      )}
                      {activities.slice(0, 4).map((activity, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.08 }}
                          className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center text-2xl border-2 border-amber-300 shadow-sm flex-shrink-0">
                              {activity.icon}
                            </div>
                            <div>
                              <p className="font-jua text-base text-wood-darkest leading-tight">
                                {activity.title}
                              </p>
                              <p className="font-jua text-sm text-amber-700">
                                {activity.time}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-green-100 border-2 border-green-300 flex-shrink-0">
                            <Zap className="w-4 h-4 text-green-600" />
                            <span className="font-jua text-base text-green-700">
                              +{activity.xp}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* 업적 */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">🏅</span>
                      <h4 className="font-jua text-lg text-wood-darkest">달성한 업적</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {achievements.map((achievement, idx) => (
                        <motion.div
                          key={achievement.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.06 }}
                          whileHover={achievement.unlocked ? { scale: 1.06 } : {}}
                          className={`p-3 rounded-2xl border-2 text-center shadow-sm ${
                            achievement.unlocked
                              ? 'bg-gradient-to-br from-amber-50 to-yellow-100 border-amber-300'
                              : 'bg-gray-100 border-gray-200 opacity-40 grayscale'
                          }`}
                        >
                          <div className="text-3xl mb-1.5">{achievement.icon}</div>
                          <h5 className="font-jua text-sm text-wood-darkest leading-tight">
                            {achievement.title}
                          </h5>
                          <p className="font-jua text-xs text-amber-700 mt-0.5 leading-tight">
                            {achievement.desc}
                          </p>
                          {achievement.unlocked && (
                            <div className="mt-1.5 px-2 py-0.5 rounded-full bg-amber-200 border border-amber-400 inline-block">
                              <span className="font-jua text-xs text-amber-800">달성! ✨</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Stats Tab */}
              {activeTab === "stats" && (
                <div className="h-full overflow-y-auto pr-1">

                  {/* 타이틀 */}
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-4xl drop-shadow-md">📊</span>
                    <div>
                      <h3 className="font-jua text-2xl text-wood-darkest leading-tight">나의 탐정 기록</h3>
                      <p className="font-jua text-sm text-blue-600">얼마나 많이 성장했는지 확인해봐요!</p>
                    </div>
                  </div>

                  {/* 핵심 통계 카드 */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {[
                      { emoji: "🎮", label: "총 퀴즈 도전", value: stats.totalQuizzes, unit: "회", from: "from-blue-100", to: "to-sky-100", border: "border-blue-300", text: "text-blue-600" },
                      { emoji: "✅", label: "정답률", value: `${stats.correctRate}`, unit: "%", from: "from-green-100", to: "to-emerald-100", border: "border-green-300", text: "text-green-600" },
                      { emoji: "🔮", label: "영상 분석", value: stats.totalAnalysis, unit: "회", from: "from-purple-100", to: "to-violet-100", border: "border-purple-300", text: "text-purple-600" },
                      { emoji: "📜", label: "커뮤니티 게시글", value: stats.communityPosts, unit: "개", from: "from-amber-100", to: "to-yellow-100", border: "border-amber-300", text: "text-amber-600" },
                    ].map((item, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.07 }}
                        whileHover={{ scale: 1.03 }}
                        className={`p-4 rounded-2xl bg-gradient-to-br ${item.from} ${item.to} border-2 ${item.border} text-center shadow-md`}
                      >
                        <div className="text-4xl mb-1">{item.emoji}</div>
                        <p className={`font-jua text-base ${item.text} mb-1`}>{item.label}</p>
                        <p className={`font-jua text-4xl ${item.text} leading-none`}>
                          {item.value}<span className="text-xl">{item.unit}</span>
                        </p>
                      </motion.div>
                    ))}
                  </div>

                  {/* 커뮤니티 & 분석 상세 */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-red-50 border-2 border-rose-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Heart className="w-5 h-5 text-red-500" fill="currentColor" />
                        <h4 className="font-jua text-lg text-wood-darkest">커뮤니티</h4>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: "게시글", value: `${stats.communityPosts}개` },
                          { label: "받은 좋아요", value: "124개" },
                          { label: "댓글", value: "56개" },
                        ].map((row, i) => (
                          <div key={i} className="flex justify-between items-center py-1 border-b border-rose-100 last:border-0">
                            <span className="font-jua text-sm text-wood-dark">{row.label}</span>
                            <span className="font-jua text-base text-wood-darkest">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border-2 border-sky-200 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-5 h-5 text-blue-500" />
                        <h4 className="font-jua text-lg text-wood-darkest">분석 활동</h4>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: "총 분석", value: `${stats.totalAnalysis}회` },
                          { label: "단서 발견", value: "8개" },
                          { label: "분석 정확도", value: "85%" },
                        ].map((row, i) => (
                          <div key={i} className="flex justify-between items-center py-1 border-b border-sky-100 last:border-0">
                            <span className="font-jua text-sm text-wood-dark">{row.label}</span>
                            <span className="font-jua text-base text-wood-darkest">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* XP 진행도 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">⭐</span>
                      <h4 className="font-jua text-lg text-wood-darkest">레벨 진행도</h4>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-jua text-base text-amber-700">현재 티어</span>
                      <span className="px-3 py-0.5 rounded-full bg-amber-200 border border-amber-400 font-jua text-base text-amber-900">{currentTier}</span>
                    </div>
                    <div className="h-4 rounded-full overflow-hidden bg-amber-100 border-2 border-amber-300 mb-3">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (currentExp / expMaxXP) * 100)}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "현재 XP", value: currentExp.toLocaleString() },
                        { label: "다음까지", value: (expMaxXP - currentExp).toLocaleString() },
                        { label: "목표 XP", value: expMaxXP.toLocaleString() },
                      ].map((item, i) => (
                        <div key={i} className="p-2 rounded-xl bg-white border border-amber-200">
                          <p className="font-jua text-sm text-amber-700">{item.label}</p>
                          <p className="font-jua text-lg text-amber-900">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="h-full overflow-y-auto pr-1">

                  {/* 타이틀 */}
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-4xl drop-shadow-md">⚙️</span>
                    <div>
                      <h3 className="font-jua text-2xl text-wood-darkest leading-tight">나의 탐정 설정</h3>
                      <p className="font-jua text-sm text-green-600">나만의 탐정 캐릭터를 꾸며봐요!</p>
                    </div>
                  </div>

                  {/* 아바타 변경 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 mb-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">🎭</span>
                      <h4 className="font-jua text-lg text-wood-darkest">아바타 변경</h4>
                    </div>
                    <div className="grid grid-cols-6 gap-2 mb-3">
                      {avatarOptions.map((emoji, index) => (
                        <motion.button
                          key={index}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedAvatar(emoji)}
                          className={`aspect-square rounded-2xl flex items-center justify-center text-3xl border-3 transition-colors shadow-sm ${
                            selectedAvatar === emoji
                              ? "border-orange-500 bg-orange-100 shadow-md"
                              : "border-parchment-border bg-white hover:border-orange-300 hover:bg-orange-50"
                          }`}
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                    <Button
                      onClick={handleSaveAvatar}
                      disabled={selectedAvatar === user.avatarEmoji || isSaving}
                      className={`w-full font-jua text-base py-3 rounded-xl ${
                        selectedAvatar === user.avatarEmoji
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md'
                      }`}
                    >
                      {isSaving ? "저장 중... 🌀" : "✨ 아바타 저장하기"}
                    </Button>
                  </div>

                  {/* 닉네임 변경 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50 border-2 border-blue-200 mb-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">✏️</span>
                        <h4 className="font-jua text-lg text-wood-darkest">닉네임</h4>
                      </div>
                      {!isEditingNickname ? (
                        <Button
                          onClick={() => {
                            setIsEditingNickname(true);
                            setEditedNickname(user.nickname);
                          }}
                          className="font-jua text-sm bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 h-auto rounded-xl"
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          수정
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSaveNickname}
                            disabled={isSaving}
                            className="font-jua text-sm bg-green-500 hover:bg-green-600 text-white py-2 px-3 h-auto rounded-xl"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            저장
                          </Button>
                          <Button
                            onClick={() => {
                              setIsEditingNickname(false);
                              setEditedNickname(user.nickname);
                            }}
                            className="font-jua text-sm bg-gray-400 hover:bg-gray-500 text-white py-2 px-3 h-auto rounded-xl"
                          >
                            <X className="w-4 h-4 mr-1" />
                            취소
                          </Button>
                        </div>
                      )}
                    </div>
                    {isEditingNickname ? (
                      <Input
                        value={editedNickname}
                        onChange={(e) => setEditedNickname(e.target.value)}
                        className="font-jua text-base py-3 rounded-xl border-2 border-blue-300 focus:border-blue-500"
                        placeholder="새 닉네임 입력"
                      />
                    ) : (
                      <p className="font-jua text-xl text-blue-800 bg-white rounded-xl px-4 py-3 border-2 border-blue-100">{user.nickname}</p>
                    )}
                  </div>

                  {/* 계정 정보 */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 mb-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">🪪</span>
                      <h4 className="font-jua text-lg text-wood-darkest">계정 정보</h4>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: "이메일", value: user.email },
                        { label: "가입일", value: new Date(user.createdAt).toLocaleDateString("ko-KR") },
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-green-100 last:border-0">
                          <span className="font-jua text-base text-wood-dark">{row.label}</span>
                          <span className="font-jua text-base text-wood-darkest">{row.value}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-jua text-base text-wood-dark">구독 상태</span>
                        <Badge className={`font-jua text-sm px-3 py-1 ${
                          user.subscriptionType === "premium"
                            ? "bg-gradient-to-r from-yellow-400 to-orange-400 text-white border-0"
                            : "bg-gray-200 text-gray-700"
                        }`}>
                          {user.subscriptionType === "premium" ? "⭐ 프리미엄" : "무료 회원"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* 프리미엄 업그레이드 */}
                  {user.subscriptionType === "free" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-orange-300 shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Crown className="w-6 h-6 text-orange-500" fill="currentColor" />
                        <h4 className="font-jua text-xl text-orange-900">프리미엄 업그레이드</h4>
                      </div>
                      <p className="font-jua text-base text-wood-dark mb-3">
                        프리미엄 탐정이 되어 더 많은 모험을 즐겨봐요!
                      </p>
                      <ul className="space-y-2 mb-4">
                        {[
                          { icon: "🎮", text: "무제한 퀴즈 도전" },
                          { icon: "🔮", text: "고급 영상 분석" },
                          { icon: "🦄", text: "특별 프리미엄 아바타" },
                        ].map((item, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-lg">{item.icon}</span>
                            <span className="font-jua text-base text-wood-dark">{item.text}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        onClick={() => navigate("/shop")}
                        className="w-full font-jua text-base py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md"
                      >
                        <Crown className="w-5 h-5 mr-2" />
                        프리미엄 탐정 되기! ✨
                      </Button>
                    </motion.div>
                  )}
                </div>
              )}
            </ParchmentPanel>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ProfilePage;
