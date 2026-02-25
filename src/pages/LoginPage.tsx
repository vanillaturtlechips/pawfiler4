import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { useAuth } from "@/contexts/AuthContext";
import { mockLogin, mockSignup } from "@/lib/mockApi";

const AVATARS = ["🦊", "🐱", "🐻", "🦉", "🐰", "🐸", "🐧", "🦁"];

const LoginPage = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("detective@deepfind.io");
  const [password, setPassword] = useState("password123");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🦊");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const result =
        mode === "login"
          ? await mockLogin({ email, password })
          : await mockSignup({ email, password, nickname, avatarEmoji: avatar });
      login(result.token, result.user);
      navigate("/");
    } catch (e: any) {
      setError(e.message || "오류가 발생했어요");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="flex h-full items-center justify-center p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <ParchmentPanel className="flex flex-col items-center w-full max-w-md py-10 px-8 gap-5">
        <motion.div
          className="text-7xl"
          animate={{ y: [-4, 4, -4] }}
          transition={{ repeat: Infinity, duration: 3 }}
        >
          🕵️
        </motion.div>
        <h2
          className="font-jua text-3xl"
          style={{ color: "hsl(var(--wood-darkest))" }}
        >
          {mode === "login" ? "탐정 사무소 입장" : "신규 탐정 등록"}
        </h2>

        {/* Toggle */}
        <div className="flex gap-2 w-full">
          {(["login", "signup"] as const).map((m) => (
            <motion.button
              key={m}
              className={`flex-1 font-jua rounded-xl py-2 text-lg cursor-pointer border-2 ${
                mode === m
                  ? "bg-wood-base text-foreground border-wood-darkest"
                  : "bg-white border-parchment-border"
              }`}
              style={mode === m ? { boxShadow: "0 4px 0 hsl(var(--wood-darkest))" } : {}}
              whileTap={{ scale: 0.95, y: 2 }}
              onClick={() => setMode(m)}
            >
              {m === "login" ? "로그인" : "회원가입"}
            </motion.button>
          ))}
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3 w-full">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border-4 border-parchment-border bg-white px-4 py-3 text-lg font-gothic outline-none"
            style={{ color: "hsl(var(--parchment-text))" }}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border-4 border-parchment-border bg-white px-4 py-3 text-lg font-gothic outline-none"
            style={{ color: "hsl(var(--parchment-text))" }}
          />

          {mode === "signup" && (
            <>
              <input
                type="text"
                placeholder="닉네임"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="rounded-xl border-4 border-parchment-border bg-white px-4 py-3 text-lg font-gothic outline-none"
                style={{ color: "hsl(var(--parchment-text))" }}
              />
              <div className="flex gap-2 justify-center flex-wrap">
                {AVATARS.map((a) => (
                  <motion.button
                    key={a}
                    className={`text-3xl p-1 rounded-xl cursor-pointer border-3 ${
                      avatar === a ? "border-wood-darkest bg-white" : "border-transparent"
                    }`}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setAvatar(a)}
                  >
                    {a}
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm font-bold" style={{ color: "hsl(var(--destructive))" }}>
            ⚠️ {error}
          </p>
        )}

        <GameButton
          variant="green"
          onClick={handleSubmit}
          className={loading ? "opacity-70 pointer-events-none" : ""}
        >
          {loading ? "⏳ 확인 중..." : mode === "login" ? "🦊 입장하기" : "🎉 등록하기"}
        </GameButton>
      </ParchmentPanel>
    </motion.div>
  );
};

export default LoginPage;
