import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string | null;
}

// TODO: 백엔드 연결 시 실제 API 호출로 교체
const mockGenerateKey = (name: string): ApiKey => ({
  id: crypto.randomUUID(),
  name,
  key: "pf_" + Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""),
  createdAt: new Date().toISOString(),
  lastUsed: null,
});

const ApiKeyManager = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const handleGenerate = () => {
    if (!newKeyName.trim()) {
      toast.error("키 이름을 입력해주세요");
      return;
    }
    const key = mockGenerateKey(newKeyName.trim());
    setKeys((prev) => [key, ...prev]);
    setNewKeyName("");
    setRevealedId(key.id);
    toast.success("API 키가 생성됐어요!");
  };

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("클립보드에 복사됐어요!");
  };

  const handleRevoke = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success("API 키가 삭제됐어요");
  };

  return (
    <ParchmentPanel className="flex flex-col gap-4">
      {/* 헤더 토글 */}
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
            {/* 사용 방법 */}
            <div
              className="rounded-xl p-4 text-sm font-mono"
              style={{ background: "#0a0a0a", color: "#4ade80" }}
            >
              <div className="opacity-50 mb-1"># 사용 예시</div>
              <div>curl -X POST https://api.pawfiler.com/v1/analyze \</div>
              <div className="pl-4">-H "X-API-Key: pf_your_key_here" \</div>
              <div className="pl-4">-F "video=@your_video.mp4"</div>
            </div>

            {/* 키 생성 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="키 이름 (예: my-app, test-server)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                className="flex-1 rounded-xl border-2 px-4 py-2 font-gothic text-sm outline-none"
                style={{
                  borderColor: "hsl(var(--parchment-border))",
                  color: "hsl(var(--parchment-text))",
                }}
              />
              <GameButton variant="blue" className="text-sm px-4" onClick={handleGenerate}>
                + 생성
              </GameButton>
            </div>

            {/* 키 목록 */}
            {keys.length === 0 ? (
              <div
                className="text-center py-6 text-sm opacity-50 font-jua"
                style={{ color: "hsl(var(--wood-dark))" }}
              >
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
                      <div className="font-jua text-sm" style={{ color: "hsl(var(--wood-darkest))" }}>
                        {k.name}
                      </div>
                      <div className="font-mono text-xs mt-0.5 truncate" style={{ color: "hsl(var(--wood-dark))" }}>
                        {revealedId === k.id ? k.key : k.key.slice(0, 8) + "••••••••••••••••••••"}
                      </div>
                      <div className="text-xs opacity-50 mt-0.5" style={{ color: "hsl(var(--wood-dark))" }}>
                        생성: {new Date(k.createdAt).toLocaleDateString("ko-KR")}
                        {k.lastUsed && ` · 마지막 사용: ${new Date(k.lastUsed).toLocaleDateString("ko-KR")}`}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        className="text-xs px-2 py-1 rounded-lg font-jua"
                        style={{ background: "hsl(var(--parchment-border))", color: "hsl(var(--wood-darkest))" }}
                        onClick={() => setRevealedId(revealedId === k.id ? null : k.id)}
                      >
                        {revealedId === k.id ? "숨기기" : "보기"}
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded-lg font-jua"
                        style={{ background: "hsl(199,97%,37%)", color: "white" }}
                        onClick={() => handleCopy(k.key)}
                      >
                        복사
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded-lg font-jua"
                        style={{ background: "hsl(var(--destructive))", color: "white" }}
                        onClick={() => handleRevoke(k.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs opacity-50 font-gothic" style={{ color: "hsl(var(--wood-dark))" }}>
              ⚠️ API 키는 생성 직후에만 전체 확인 가능해요. 안전한 곳에 보관하세요.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </ParchmentPanel>
  );
};

export default ApiKeyManager;
