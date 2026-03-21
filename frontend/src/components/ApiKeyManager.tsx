import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchApiKeys, generateApiKey, revokeApiKey, type ApiKeyItem } from "@/lib/api";
import { toast } from "sonner";

const ApiKeyManager = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null); // 생성 직후 원문
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
    <ParchmentPanel className="flex flex-col gap-4">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div>
          <h3 className="font-jua text-2xl" style={{ color: "hsl(var(--wood-darkest))" }}>
            🔑 외부 API 키 관리
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "hsl(var(--wood-dark))" }}>
            외부 서비스에서 영상 분석 API를 직접 호출할 수 있어요
          </p>
        </div>
        <span className="text-2xl">{isOpen ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-4 overflow-hidden"
          >
            {/* 사용 예시 */}
            <div className="rounded-xl p-4 text-sm font-mono" style={{ background: "#0a0a0a", color: "#4ade80" }}>
              <div className="opacity-50 mb-1"># 사용 예시</div>
              <div>curl -X POST https://api.pawfiler.com/v1/analyze \</div>
              <div className="pl-4">-H "X-API-Key: pf_your_key_here" \</div>
              <div className="pl-4">-F "video=@your_video.mp4"</div>
            </div>

            {/* 키 생성 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="키 이름 (예: my-app)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                className="flex-1 rounded-xl border-2 px-4 py-2 font-gothic text-sm outline-none"
                style={{ borderColor: "hsl(var(--parchment-border))", color: "hsl(var(--parchment-text))" }}
              />
              <GameButton variant="blue" className="text-sm px-4" onClick={handleGenerate}>
                {loading ? "..." : "+ 생성"}
              </GameButton>
            </div>

            {/* 생성 직후 원문 표시 */}
            {revealedKey && (
              <div className="rounded-xl p-3 bg-green-50 border-2 border-green-400">
                <div className="text-xs font-jua text-green-700 mb-1">⚠️ 지금만 확인 가능해요. 복사해두세요!</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all font-mono text-green-800">{revealedKey}</code>
                  <button
                    className="text-xs px-2 py-1 rounded-lg font-jua bg-green-500 text-white flex-shrink-0"
                    onClick={() => handleCopy(revealedKey)}
                  >복사</button>
                  <button
                    className="text-xs px-2 py-1 rounded-lg font-jua bg-gray-300 flex-shrink-0"
                    onClick={() => setRevealedKey(null)}
                  >닫기</button>
                </div>
              </div>
            )}

            {/* 키 목록 */}
            {keys.length === 0 ? (
              <div className="text-center py-6 text-sm opacity-50 font-jua" style={{ color: "hsl(var(--wood-dark))" }}>
                아직 발급된 API 키가 없어요
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: "white", border: "2px solid hsl(var(--parchment-border))" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-jua text-sm" style={{ color: "hsl(var(--wood-darkest))" }}>{k.name}</div>
                      <div className="font-mono text-xs mt-0.5" style={{ color: "hsl(var(--wood-dark))" }}>
                        {k.key_prefix}••••••••••••••••••••
                      </div>
                      <div className="text-xs opacity-50 mt-0.5" style={{ color: "hsl(var(--wood-dark))" }}>
                        생성: {new Date(k.created_at).toLocaleDateString("ko-KR")}
                        {k.last_used_at && ` · 마지막 사용: ${new Date(k.last_used_at).toLocaleDateString("ko-KR")}`}
                      </div>
                    </div>
                    <button
                      className="text-xs px-2 py-1 rounded-lg font-jua flex-shrink-0"
                      style={{ background: "hsl(var(--destructive))", color: "white" }}
                      onClick={() => handleRevoke(k.id)}
                    >삭제</button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs opacity-50 font-gothic" style={{ color: "hsl(var(--wood-dark))" }}>
              ⚠️ API 키 원문은 생성 직후에만 확인 가능해요. 안전한 곳에 보관하세요.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </ParchmentPanel>
  );
};

export default ApiKeyManager;
