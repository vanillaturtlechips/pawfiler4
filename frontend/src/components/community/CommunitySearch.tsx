import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

type SearchProps = {
  query: string;
  setQuery: (query: string) => void;
  searchType: "title" | "body" | "all";
  setSearchType: (type: "title" | "body" | "all") => void;
};

const TYPES: { value: "title" | "body" | "all"; label: string }[] = [
  { value: "title", label: "제목" },
  { value: "body", label: "내용" },
  { value: "all", label: "전체" },
];

export default function CommunitySearch({ query, setQuery, searchType, setSearchType }: SearchProps) {
  return (
    <div
      className="flex items-stretch rounded-xl overflow-hidden"
      style={{
        border: "2px solid hsl(var(--parchment-border))",
        background: "hsl(var(--parchment))",
      }}
    >
      {/* 검색 아이콘 + 입력창 */}
      <div className="relative group flex-1 flex items-center">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none"
          size={14}
          style={{ color: "hsl(var(--wood-light))" }}
        />
        <Input
          placeholder={
            searchType === "title" ? "제목으로 검색..." :
            searchType === "body" ? "내용으로 검색..." :
            "제목 + 내용으로 검색..."
          }
          className="pl-9 pr-9 h-10 text-sm border-0 bg-transparent text-wood-darkest placeholder:text-wood-light focus-visible:ring-0 focus-visible:ring-offset-0 font-jua rounded-none"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors rounded-full p-0.5 hover:bg-orange-100"
            style={{ color: "hsl(var(--wood-light))" }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* 구분선 */}
      <div
        className="w-px self-stretch my-2 shrink-0"
        style={{ background: "hsl(var(--parchment-border))" }}
      />

      {/* 세그먼트 탭 */}
      <div className="flex items-stretch shrink-0">
        {TYPES.map((t, i) => (
          <button
            key={t.value}
            onClick={() => setSearchType(t.value)}
            className={`px-4 text-xs font-jua transition-all duration-150 ${
              searchType === t.value
                ? "bg-orange-500 text-white"
                : "text-wood-base hover:bg-orange-50 hover:text-orange-500"
            } ${i < TYPES.length - 1 ? "border-r" : ""}`}
            style={i < TYPES.length - 1 ? { borderColor: "hsl(var(--parchment-border))" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
