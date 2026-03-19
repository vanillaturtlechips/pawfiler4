import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import { config } from "@/lib/config";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const ChatbotWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "어서오세요, 모험가님! 🐾 PawFiler에 대해 궁금한 것을 물어보세요!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${config.aiAgentBaseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput }),
      });

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer || "답변을 가져오지 못했습니다.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "마법이 잠시 흔들렸어요... 다시 시도해주세요! 🌙",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{
            background: "linear-gradient(135deg, hsl(27 100% 47%), hsl(16 28% 35%))",
            boxShadow: "0 0 20px hsl(28 100% 65% / 0.5), 0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          <span className="text-2xl">🔮</span>
        </button>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 h-[500px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            background: "hsl(20 68% 9%)",
            border: "2px solid hsl(28 100% 47% / 0.4)",
            boxShadow: "0 0 30px hsl(28 100% 65% / 0.2), 0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* 헤더 */}
          <div
            className="flex items-center justify-between px-4 py-3 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(16 28% 19%), hsl(20 68% 12%))",
              borderBottom: "1px solid hsl(28 100% 47% / 0.3)",
            }}
          >
            {/* 별빛 장식 */}
            <div className="absolute inset-0 pointer-events-none">
              <span className="absolute top-1 left-8 text-[8px] opacity-40">✦</span>
              <span className="absolute top-3 right-16 text-[6px] opacity-30">✧</span>
              <span className="absolute bottom-1 left-24 text-[7px] opacity-35">✦</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🦉</span>
              <div>
                <p className="font-jua text-sm leading-none" style={{ color: "hsl(54 100% 90%)" }}>
                  마법사 포리
                </p>
                <p className="font-jua text-[10px] opacity-50 mt-0.5" style={{ color: "hsl(28 100% 65%)" }}>
                  PawFiler 안내 마법사
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="opacity-50 hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10"
              style={{ color: "hsl(54 100% 90%)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div
            className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide"
            style={{ background: "hsl(20 68% 9%)" }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "hsl(16 28% 25%)", border: "1px solid hsl(28 100% 47% / 0.4)" }}>
                    <span className="text-sm">🦉</span>
                  </div>
                )}
                <div
                  className="max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed font-gothic"
                  style={
                    msg.role === "user"
                      ? {
                          background: "linear-gradient(135deg, hsl(27 100% 40%), hsl(16 40% 30%))",
                          color: "hsl(54 100% 95%)",
                          borderRadius: "18px 18px 4px 18px",
                          boxShadow: "0 2px 8px hsl(27 100% 47% / 0.3)",
                        }
                      : {
                          background: "hsl(16 28% 19%)",
                          color: "hsl(54 100% 90%)",
                          border: "1px solid hsl(28 100% 47% / 0.2)",
                          borderRadius: "18px 18px 18px 4px",
                        }
                  }
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "hsl(27 100% 40%)", border: "1px solid hsl(28 100% 65% / 0.4)" }}>
                    <span className="text-sm">🐾</span>
                  </div>
                )}
              </div>
            ))}

            {/* 로딩 */}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "hsl(16 28% 25%)", border: "1px solid hsl(28 100% 47% / 0.4)" }}>
                  <span className="text-sm">🦉</span>
                </div>
                <div
                  className="px-4 py-3 rounded-2xl"
                  style={{
                    background: "hsl(16 28% 19%)",
                    border: "1px solid hsl(28 100% 47% / 0.2)",
                    borderRadius: "18px 18px 18px 4px",
                  }}
                >
                  <div className="flex gap-1.5 items-center">
                    <span className="text-xs font-jua opacity-60" style={{ color: "hsl(28 100% 65%)" }}>마법을 부리는 중</span>
                    <span className="flex gap-1">
                      {[0, 0.15, 0.3].map((delay, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{
                            background: "hsl(28 100% 65%)",
                            animationDelay: `${delay}s`,
                          }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력창 */}
          <div
            className="p-3 flex gap-2"
            style={{
              background: "hsl(16 28% 14%)",
              borderTop: "1px solid hsl(28 100% 47% / 0.2)",
            }}
          >
            <input
              className="flex-1 text-sm rounded-xl px-3 py-2 outline-none font-gothic transition-all"
              style={{
                background: "hsl(20 68% 9%)",
                color: "hsl(54 100% 90%)",
                border: "1px solid hsl(28 100% 47% / 0.3)",
              }}
              placeholder="✨ 궁금한 걸 물어보세요..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              disabled={loading}
              onFocus={(e) => (e.target.style.borderColor = "hsl(28 100% 47% / 0.7)")}
              onBlur={(e) => (e.target.style.borderColor = "hsl(28 100% 47% / 0.3)")}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, hsl(27 100% 47%), hsl(16 40% 35%))",
                boxShadow: "0 2px 8px hsl(27 100% 47% / 0.4)",
              }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
