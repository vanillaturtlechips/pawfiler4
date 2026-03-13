import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useQuizProfile } from "@/contexts/QuizProfileContext";
import { useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Star, Coins, Calendar, TrendingUp, 
  Heart, Eye, Award, Zap, Crown,
  Edit2, Save, X, BookOpen, BarChart3, Settings
} from "lucide-react";

const ProfilePage = () => {
  const { user } = useAuth();
  const { quizProfile } = useQuizProfile();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"journey" | "stats" | "settings">("journey");
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editedNickname, setEditedNickname] = useState(user?.nickname || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarEmoji || "🦊");

  if (!user) {
    navigate("/login");
    return null;
  }

  const avatarOptions = ["🦊", "🐶", "🐱", "🐰", "🐻", "🐼", "🦝", "🐨", "🐯", "🦁", "🐮", "🐷"];
  
  const recentActivities = [
    { id: 1, icon: "🎮", title: "딥페이크 퀴즈 완료", time: "2시간 전", xp: 50 },
    { id: 2, icon: "📜", title: "커뮤니티 게시글 작성", time: "5시간 전", xp: 30 },
    { id: 3, icon: "🔮", title: "영상 분석 완료", time: "1일 전", xp: 100 },
    { id: 4, icon: "💬", title: "댓글 작성", time: "2일 전", xp: 10 },
  ];

  const achievements = [
    { id: 1, icon: "🏆", title: "첫 걸음", desc: "첫 퀴즈 완료", unlocked: true },
    { id: 2, icon: "🔥", title: "연속 달성", desc: "3일 연속 접속", unlocked: true },
    { id: 3, icon: "⚡", title: "스피드 러너", desc: "10초 안에 정답", unlocked: true },
    { id: 4, icon: "🎯", title: "명중률 달인", desc: "정답률 90% 달성", unlocked: false },
    { id: 5, icon: "💎", title: "수집가", desc: "모든 배지 획득", unlocked: false },
    { id: 6, icon: "🌟", title: "레벨 마스터", desc: "레벨 10 달성", unlocked: false },
  ];

  const stats = {
    totalQuizzes: 42,
    correctRate: 78,
    totalAnalysis: 15,
    communityPosts: 8,
    currentStreak: 3,
    bestStreak: 7,
  };

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
                  <span className="text-xs">{quizProfile?.totalExp ?? user.xp} / {(() => {
                    const level = quizProfile?.level ?? user.level ?? 1;
                    // 다음 레벨 필요 XP 계산
                    const nextLevelXP = [0, 1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 800, 1100, 1400, 1700, 2000, 2500, 3000, 3500, 4000, 5000];
                    return nextLevelXP[level] || 5000;
                  })()} XP</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-amber-100 border border-amber-300">
                  <motion.div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(() => {
                      const exp = quizProfile?.totalExp ?? user.xp ?? 0;
                      const level = quizProfile?.level ?? user.level ?? 1;
                      const thresholds = [0, 1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 800, 1100, 1400, 1700, 2000, 2500, 3000, 3500, 4000, 5000];
                      const currentThreshold = thresholds[level - 1] || 0;
                      const nextThreshold = thresholds[level] || 5000;
                      const progress = ((exp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
                      return Math.min(100, Math.max(0, progress));
                    })()}%` }}
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
                <div className="h-full overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">📚</span>
                    <h3 className="font-jua text-xl text-wood-darkest">나의 모험 이야기</h3>
                  </div>

                  {/* Recent Activities - Compact */}
                  <div className="mb-3">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-blue-600" />
                      최근 활동
                    </h4>
                    <div className="space-y-2">
                      {recentActivities.slice(0, 3).map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-parchment-border"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-lg border border-amber-200">
                              {activity.icon}
                            </div>
                            <div>
                              <p className="font-jua text-xs text-wood-darkest">
                                {activity.title}
                              </p>
                              <p className="text-xs text-wood-dark">
                                {activity.time}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-100 border border-green-300">
                            <Zap className="w-3 h-3 text-green-600" />
                            <span className="font-jua text-xs text-green-700">
                              +{activity.xp}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Achievements - Compact */}
                  <div className="mb-3 pb-3 border-t border-parchment-border pt-3">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2 flex items-center gap-1">
                      <Award className="w-3 h-3 text-amber-600" />
                      달성한 업적
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {achievements.map((achievement) => (
                        <div
                          key={achievement.id}
                          className={`p-2 rounded-lg border text-center ${
                            achievement.unlocked
                              ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300'
                              : 'bg-gray-100 border-gray-300 opacity-50 grayscale'
                          }`}
                        >
                          <div className="text-2xl mb-1">{achievement.icon}</div>
                          <h5 className="font-jua text-xs font-bold text-wood-darkest">
                            {achievement.title}
                          </h5>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Streak - Compact */}
                  <div className="border-t border-parchment-border pt-3">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2">연속 기록</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 rounded-lg bg-gradient-to-br from-orange-50 to-red-50 border border-orange-300">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xl">🔥</span>
                          <span className="font-jua text-xs text-orange-900">현재</span>
                        </div>
                        <p className="font-jua text-2xl text-orange-600">{stats.currentStreak}일</p>
                      </div>
                      <div className="p-3 rounded-lg bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-300">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xl">⭐</span>
                          <span className="font-jua text-xs text-yellow-900">최고</span>
                        </div>
                        <p className="font-jua text-2xl text-yellow-600">{stats.bestStreak}일</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Tab */}
              {activeTab === "stats" && (
                <div className="h-full overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">📊</span>
                    <h3 className="font-jua text-xl text-wood-darkest">상세 통계</h3>
                  </div>

                  {/* Stats Grid - Compact */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-300 text-center">
                      <div className="text-2xl mb-1">🎮</div>
                      <p className="text-xs text-blue-700 font-semibold mb-0.5">총 퀴즈</p>
                      <p className="font-jua text-lg text-blue-900">{stats.totalQuizzes}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border border-green-300 text-center">
                      <div className="text-2xl mb-1">✅</div>
                      <p className="text-xs text-green-700 font-semibold mb-0.5">정답률</p>
                      <p className="font-jua text-lg text-green-900">{stats.correctRate}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-300 text-center">
                      <div className="text-2xl mb-1">🔮</div>
                      <p className="text-xs text-purple-700 font-semibold mb-0.5">영상 분석</p>
                      <p className="font-jua text-lg text-purple-900">{stats.totalAnalysis}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-300 text-center">
                      <div className="text-2xl mb-1">📜</div>
                      <p className="text-xs text-amber-700 font-semibold mb-0.5">게시글</p>
                      <p className="font-jua text-lg text-amber-900">{stats.communityPosts}</p>
                    </div>
                  </div>

                  {/* Detailed Stats - Compact */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="p-3 rounded-lg bg-white border border-parchment-border">
                      <h4 className="font-jua text-sm text-wood-darkest mb-2 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-red-500" />
                        커뮤니티
                      </h4>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">게시글</span>
                          <span className="font-jua text-xs">{stats.communityPosts}개</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">좋아요</span>
                          <span className="font-jua text-xs">124개</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">댓글</span>
                          <span className="font-jua text-xs">56개</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-parchment-border">
                      <h4 className="font-jua text-sm text-wood-darkest mb-2 flex items-center gap-1">
                        <Eye className="w-3 h-3 text-blue-500" />
                        분석
                      </h4>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">총 분석</span>
                          <span className="font-jua text-xs">{stats.totalAnalysis}회</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">발견</span>
                          <span className="font-jua text-xs">8개</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-wood-dark">정확도</span>
                          <span className="font-jua text-xs">85%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress Chart - Compact */}
                  <div className="p-3 rounded-lg bg-white border border-parchment-border">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2">레벨 진행도</h4>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-wood-dark">현재 레벨</span>
                          <span className="font-jua">Lv. {user.level}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                            style={{ width: `${(user.xp / ((user.level + 1) * 1000)) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-wood-dark">현재 XP</p>
                          <p className="font-jua text-sm">{user.xp}</p>
                        </div>
                        <div>
                          <p className="text-wood-dark">필요 XP</p>
                          <p className="font-jua text-sm">{(user.level + 1) * 1000 - user.xp}</p>
                        </div>
                        <div>
                          <p className="text-wood-dark">다음 레벨</p>
                          <p className="font-jua text-sm">Lv. {user.level + 1}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="h-full overflow-y-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">⚙️</span>
                    <h3 className="font-jua text-xl text-wood-darkest">설정</h3>
                  </div>

                  {/* Avatar Selection - Compact */}
                  <div className="p-3 rounded-lg bg-white border border-parchment-border mb-3">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2">아바타 변경</h4>
                    <div className="grid grid-cols-6 gap-2">
                      {avatarOptions.map((emoji, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedAvatar(emoji)}
                          className={`aspect-square rounded-lg flex items-center justify-center text-2xl border-2 transition-colors ${
                            selectedAvatar === emoji
                              ? "border-orange-500 bg-orange-50"
                              : "border-parchment-border bg-white hover:border-orange-300"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <Button 
                      disabled={selectedAvatar === user.avatarEmoji}
                      className={`w-full mt-2 font-jua text-sm py-2 ${
                        selectedAvatar === user.avatarEmoji
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                      }`}
                    >
                      아바타 저장
                    </Button>
                  </div>

                  {/* Nickname Edit - Compact */}
                  <div className="p-3 rounded-lg bg-white border border-parchment-border mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-jua text-sm text-wood-darkest">닉네임</h4>
                      {!isEditingNickname ? (
                        <Button
                          onClick={() => {
                            setIsEditingNickname(true);
                            setEditedNickname(user.nickname);
                          }}
                          className="font-jua text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 h-auto"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          수정
                        </Button>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            onClick={() => {
                              // TODO: API call
                              setIsEditingNickname(false);
                            }}
                            className="font-jua text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-2 h-auto"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            저장
                          </Button>
                          <Button
                            onClick={() => {
                              setIsEditingNickname(false);
                              setEditedNickname(user.nickname);
                            }}
                            className="font-jua text-xs bg-gray-500 hover:bg-gray-600 text-white py-1 px-2 h-auto"
                          >
                            <X className="w-3 h-3 mr-1" />
                            취소
                          </Button>
                        </div>
                      )}
                    </div>
                    {isEditingNickname ? (
                      <Input
                        value={editedNickname}
                        onChange={(e) => setEditedNickname(e.target.value)}
                        className="font-jua text-sm py-2 rounded-lg border border-parchment-border"
                        placeholder="새 닉네임 입력"
                      />
                    ) : (
                      <p className="font-jua text-base text-wood-dark">{user.nickname}</p>
                    )}
                  </div>

                  {/* Account Info - Compact */}
                  <div className="p-3 rounded-lg bg-white border border-parchment-border mb-3">
                    <h4 className="font-jua text-sm text-wood-darkest mb-2">계정 정보</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-wood-dark">이메일</span>
                        <span className="font-jua text-xs text-wood-darkest">{user.email}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-wood-dark">가입일</span>
                        <span className="font-jua text-xs text-wood-darkest">
                          {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-wood-dark">구독 상태</span>
                        <Badge className={`font-jua text-xs ${
                          user.subscriptionType === "premium"
                            ? "bg-gradient-to-r from-yellow-400 to-orange-400 text-white"
                            : "bg-gray-200 text-gray-700"
                        }`}>
                          {user.subscriptionType === "premium" ? "⭐ 프리미엄" : "무료"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Premium Upgrade - Compact */}
                  {user.subscriptionType === "free" && (
                    <div className="p-3 rounded-lg bg-gradient-to-br from-yellow-50 to-orange-50 border border-orange-300">
                      <div className="flex items-center gap-2 mb-2">
                        <Crown className="w-5 h-5 text-orange-600" />
                        <h4 className="font-jua text-base text-orange-900">프리미엄 업그레이드</h4>
                      </div>
                      <p className="text-xs text-wood-dark mb-2">
                        프리미엄 회원이 되어 더 많은 혜택을 누리세요!
                      </p>
                      <ul className="space-y-1 mb-2 text-xs text-wood-dark">
                        <li className="flex items-center gap-1">
                          <span className="text-green-600">✓</span>
                          무제한 퀴즈 도전
                        </li>
                        <li className="flex items-center gap-1">
                          <span className="text-green-600">✓</span>
                          고급 영상 분석
                        </li>
                        <li className="flex items-center gap-1">
                          <span className="text-green-600">✓</span>
                          특별 아바타
                        </li>
                      </ul>
                      <Button
                        onClick={() => navigate("/shop")}
                        className="w-full font-jua text-sm py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg"
                      >
                        <Crown className="w-4 h-4 mr-1" />
                        프리미엄 구독하기
                      </Button>
                    </div>
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
