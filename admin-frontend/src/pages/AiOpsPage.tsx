import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, Clock, Send, Bot, User, RefreshCw } from "lucide-react";
import { getStatus, getHistory, ask, AnalysisResult } from "../lib/aiopsApi";

interface ChatMessage { role: "user" | "assistant"; content: string; timestamp: number; }

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function AiOpsPage() {
  const [status, setStatus]   = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [selected, setSelected] = useState<AnalysisResult | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant",
    content: "안녕하세요! 클러스터에 대해 무엇이든 물어보세요.\n예: quiz-service 왜 느려? / 지금 이상 있어? / 최근 에러 알려줘",
    timestamp: Date.now() / 1000,
  }]);
  const [asking, setAsking]   = useState(false);
  const [loading, setLoading] = useState(true);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getStatus().then(s => { setStatus(s); setSelected(s); }),
      getHistory(20).then(r => setHistory(r.history)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAsk = async () => {
    if (!question.trim() || asking) return;
    const userMsg: ChatMessage = { role: "user", content: question, timestamp: Date.now() / 1000 };
    setMessages(prev => [...prev, userMsg]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await ask(userMsg.content);
      setMessages(prev => [...prev, { role: "assistant", content: res.answer, timestamp: res.timestamp }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `오류: ${e.message}`, timestamp: Date.now() / 1000 }]);
    } finally {
      setAsking(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">로딩 중...</div>;

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">

      {/* ── 좌측: 보고서 타임라인 ── */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        {/* 현재 상태 배너 */}
        <div className={`rounded-xl border p-3 ${status?.anomaly ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              {status?.anomaly
                ? <AlertTriangle className="h-4 w-4 text-red-500" />
                : <CheckCircle className="h-4 w-4 text-green-500" />}
              <span className="text-sm font-semibold">{status?.anomaly ? "이상 감지" : "정상"}</span>
            </div>
            <button onClick={load} className="p-1 hover:bg-white/50 rounded">
              <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>
          {status?.timestamp && (
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {timeAgo(status.timestamp)} 분석
            </div>
          )}
        </div>

        {/* 타임라인 */}
        <div className="flex-1 overflow-y-auto space-y-1">
          <div className="text-xs text-gray-400 px-1 mb-2">보고서 히스토리 (5분 주기)</div>
          {history.length === 0
            ? <div className="text-xs text-gray-400 px-1">아직 분석 결과가 없습니다.</div>
            : history.map((h, i) => (
                <button key={i} onClick={() => setSelected(h)}
                  className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${selected === h ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}>
                  <div className="flex items-center gap-2">
                    {h.anomaly
                      ? <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${selected === h ? "text-red-300" : "text-red-500"}`} />
                      : <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${selected === h ? "text-green-300" : "text-green-500"}`} />}
                    <span className={`text-xs font-medium ${selected === h ? "text-white" : "text-gray-700"}`}>
                      {formatTime(h.timestamp)}
                    </span>
                    {i === 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ml-auto ${selected === h ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>최신</span>
                    )}
                  </div>
                  <div className={`text-xs mt-0.5 line-clamp-1 ${selected === h ? "text-gray-300" : "text-gray-400"}`}>
                    {h.anomaly ? "이상 감지" : "정상"}
                  </div>
                </button>
              ))}
        </div>
      </div>

      {/* ── 중앙: 선택된 보고서 ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {selected ? (
          <div className="flex-1 border rounded-xl bg-white overflow-y-auto p-5">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b">
              {selected.anomaly
                ? <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
                : <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-500" /></div>}
              <div>
                <div className="font-semibold">{selected.anomaly ? "이상 감지" : "클러스터 정상"}</div>
                <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {new Date(selected.timestamp * 1000).toLocaleString("ko-KR")} · {timeAgo(selected.timestamp)}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {selected.summary}
            </div>
          </div>
        ) : (
          <div className="flex-1 border rounded-xl bg-white flex items-center justify-center text-gray-400 text-sm">
            좌측에서 보고서를 선택하세요
          </div>
        )}
      </div>

      {/* ── 우측: 챗봇 ── */}
      <div className="w-80 shrink-0 border rounded-xl bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Bot className="h-4 w-4 text-gray-700" />
          <span className="text-sm font-semibold">AI 질문</span>
          <span className="text-xs text-gray-400 ml-auto">Claude 기반</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${msg.role === "assistant" ? "bg-gray-900" : "bg-blue-500"}`}>
                {msg.role === "assistant" ? <Bot className="h-3.5 w-3.5 text-white" /> : <User className="h-3.5 w-3.5 text-white" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${msg.role === "assistant" ? "bg-gray-100 text-gray-800 rounded-tl-sm" : "bg-blue-500 text-white rounded-tr-sm"}`}>
                {msg.content}
                <div className={`text-xs mt-1 ${msg.role === "assistant" ? "text-gray-400" : "text-blue-200"}`}>{timeAgo(msg.timestamp)}</div>
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex gap-2">
              <div className="shrink-0 w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2.5 flex gap-1">
                {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        <div className="border-t p-2 flex gap-2">
          <input ref={inputRef}
            className="flex-1 border rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-300"
            placeholder="질문하세요..."
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAsk()}
            disabled={asking}
          />
          <button onClick={handleAsk} disabled={asking || !question.trim()}
            className="px-3 py-1.5 bg-gray-900 text-white rounded-xl disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
