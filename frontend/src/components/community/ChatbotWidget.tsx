import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";
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
      content:
        "안녕하세요! PawFiler AI 도우미입니다. 서비스에 대해 궁금한 것을 물어보세요 🐾",
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
    setInput("");
    setLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch(`${config.aiAgentBaseUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + data.text }
                    : m
                )
              );
            }
          }
        }
      }
    } catch {
      // HTTP/2 프로토콜 에러는 스트리밍 완료 후 발생할 수 있음 - 내용이 있으면 정상 처리
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId && m.content === ""
            ? { ...m, content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." }
            : m
        )
      );
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg flex items-center justify-center transition-all"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 h-[480px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-violet-700">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <span className="text-white font-semibold text-sm">
                PawFiler AI 도우미
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-violet-600 text-white rounded-br-sm"
                      : "bg-gray-700 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.content ||
                    (loading &&
                      msg.role === "assistant" && (
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        </span>
                      ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력창 */}
          <div className="p-3 border-t border-gray-700 flex gap-2">
            <input
              className="flex-1 bg-gray-800 text-white text-sm rounded-xl px-3 py-2 outline-none placeholder-gray-500 border border-gray-700 focus:border-violet-500"
              placeholder="질문을 입력하세요..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && sendMessage()
              }
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center transition-colors"
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
