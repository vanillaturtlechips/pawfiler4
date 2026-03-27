import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { fetchApiKeys, generateApiKey, revokeApiKey, type ApiKeyItem } from "@/lib/api";
import { toast } from "sonner";

const ApiKeyManager = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user?.id) {
      fetchApiKeys(user.id).then(setKeys);
    }
  }, [isOpen, user?.id]);

  const handleGenerate = async () => {
    if (!newKeyName.trim() || !user?.id) {
      toast.error("키 이름을 입력해주세요");
      return;
    }
    setLoading(true);
    try {
      const created = await generateApiKey(user.id, newKeyName.trim());
      setKeys((prev) => [created, ...prev]);
      setRevealedKey(created.key ?? null);
      setNewKeyName("");
      toast.success("API 키가 생성됐어요!");
    } catch {
      toast.error("키 생성에 실패했어요");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!user?.id) return;
    await revokeApiKey(user.id, keyId);
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
    toast.success("API 키가 삭제됐어요");
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("클립보드에 복사됐어요!");
  };

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px)",
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      {/* Header / Toggle */}
      <button
        className="flex items-center justify-between w-full text-left px-6 py-5 cursor-pointer"
        onClick={() => setIsOpen((v) => !v)}
        style={{ background: "none", border: "none" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.08))",
            }}
          >
            🔑
          </div>
          <div>
            <h3 className="font-jua text-lg text-foreground/90">외부 API 키 관리</h3>
            <p className="font-gothic text-xs text-foreground/35 mt-0.5">
              외부 서비스에서 영상 분석 API를 직접 호출
            </p>
          </div>
        </div>
        <motion.span
          className="text-foreground/30 text-sm"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 flex flex-col gap-4">
              {/* Code example */}
              <div
                className="rounded-xl p-4 text-xs font-mono leading-relaxed overflow-x-auto"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(74,222,128,0.9)",
                }}
              >
                <div style={{ color: "rgba(255,255,255,0.25)" }}># 사용 예시</div>
                <div className="mt-1">
                  <span style={{ color: "rgba(96,165,250,0.8)" }}>curl</span> -X POST https://api.pawfiler.com/v1/analyze \
                </div>
                <div className="pl-4">
                  -H <span style={{ color: "rgba(251,191,36,0.8)" }}>"X-API-Key: pf_your_key_here"</span> \
                </div>
                <div className="pl-4">
                  -F <span style={{ color: "rgba(251,191,36,0.8)" }}>"video=@your_video.mp4"</span>
                </div>
              </div>

              {/* Key creation */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="키 이름 (예: my-app)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  className="flex-1 rounded-xl px-4 py-2.5 font-gothic text-sm outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.8)",
                  }}
                />
                <motion.button
                  className="rounded-xl px-5 py-2.5 font-jua text-sm border-none cursor-pointer"
                  style={{
                    background: "linear-gradient(135deg, rgba(99,102,241,0.6), rgba(99,102,241,0.3))",
                    color: "white",
                    boxShadow: "0 4px 15px rgba(99,102,241,0.2)",
                  }}
                  whileHover={{ scale: 1.03, boxShadow: "0 6px 20px rgba(99,102,241,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGenerate}
                >
                  {loading ? "..." : "+ 생성"}
                </motion.button>
              </div>

              {/* Revealed key */}
              {revealedKey && (
                <motion.div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-xs font-jua mb-2" style={{ color: "rgba(74,222,128,0.9)" }}>
                    ⚠️ 지금만 확인 가능해요. 복사해두세요!
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs break-all font-mono" style={{ color: "rgba(74,222,128,0.8)" }}>
                      {revealedKey}
                    </code>
                    <motion.button
                      className="text-xs px-3 py-1.5 rounded-lg font-jua border-none cursor-pointer"
                      style={{ background: "rgba(34,197,94,0.3)", color: "rgba(74,222,128,1)" }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCopy(revealedKey)}
                    >복사</motion.button>
                    <motion.button
                      className="text-xs px-3 py-1.5 rounded-lg font-jua border-none cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setRevealedKey(null)}
                    >닫기</motion.button>
                  </div>
                </motion.div>
              )}

              {/* Key list */}
              {keys.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2 opacity-30">🔐</div>
                  <div className="text-sm font-jua text-foreground/25">아직 발급된 API 키가 없어요</div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {keys.map((k, i) => (
                    <motion.div
                      key={k.id}
                      className="rounded-xl p-4 flex items-center gap-3"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "rgba(99,102,241,0.1)" }}>
                        🔑
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-jua text-sm text-foreground/80">{k.name}</div>
                        <div className="font-mono text-xs mt-0.5 text-foreground/30">
                          {k.key_prefix}••••••••••••
                        </div>
                        <div className="text-xs text-foreground/20 mt-0.5 font-gothic">
                          {new Date(k.created_at).toLocaleDateString("ko-KR")}
                          {k.last_used_at && ` · 마지막: ${new Date(k.last_used_at).toLocaleDateString("ko-KR")}`}
                        </div>
                      </div>
                      <motion.button
                        className="text-xs px-3 py-1.5 rounded-lg font-jua border-none cursor-pointer flex-shrink-0"
                        style={{
                          background: "rgba(220,38,38,0.15)",
                          color: "rgba(252,165,165,0.9)",
                          border: "1px solid rgba(220,38,38,0.2)",
                        }}
                        whileHover={{ scale: 1.05, background: "rgba(220,38,38,0.25)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRevoke(k.id)}
                      >삭제</motion.button>
                    </motion.div>
                  ))}
                </div>
              )}

              <p className="text-xs text-foreground/20 font-gothic">
                ⚠️ API 키 원문은 생성 직후에만 확인 가능해요. 안전한 곳에 보관하세요.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ApiKeyManager;
