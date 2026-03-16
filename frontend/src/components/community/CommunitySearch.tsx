import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

type SearchProps = {
  query: string;
  setQuery: (query: string) => void;
  searchType: "title" | "body" | "all";
  setSearchType: (type: "title" | "body" | "all") => void;
};

export default function CommunitySearch({ 
  query, 
  setQuery, 
  searchType, 
  setSearchType 
}: SearchProps) {
  return (
    <div className="flex gap-4">
      <div className="relative group flex-1">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors"
          size={22}
        />
        <Input
          placeholder={
            searchType === "title"
              ? "제목으로 검색..."
              : searchType === "body"
              ? "내용으로 검색..."
              : "제목 + 내용으로 검색..."
          }
          className="pl-12 py-6 text-lg rounded-2xl border-4 border-parchment-border bg-white text-gray-900 placeholder:text-gray-400 backdrop-blur-sm focus-visible:ring-orange-500/50 font-jua"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => setSearchType("title")}
          variant={searchType === "title" ? "default" : "outline"}
          className={`font-jua text-lg rounded-2xl px-6 py-6 border-4 border-wood-darkest transition-all ${
            searchType === "title"
              ? "bg-orange-500 hover:bg-orange-600 text-white"
              : "bg-white hover:bg-orange-50 text-wood-darkest"
          }`}
        >
          제목
        </Button>
        <Button
          onClick={() => setSearchType("body")}
          variant={searchType === "body" ? "default" : "outline"}
          className={`font-jua text-lg rounded-2xl px-6 py-6 border-4 border-wood-darkest transition-all ${
            searchType === "body"
              ? "bg-orange-500 hover:bg-orange-600 text-white"
              : "bg-white hover:bg-orange-50 text-wood-darkest"
          }`}
        >
          내용
        </Button>
        <Button
          onClick={() => setSearchType("all")}
          variant={searchType === "all" ? "default" : "outline"}
          className={`font-jua text-lg rounded-2xl px-6 py-6 border-4 border-wood-darkest transition-all ${
            searchType === "all"
              ? "bg-orange-500 hover:bg-orange-600 text-white"
              : "bg-white hover:bg-orange-50 text-wood-darkest"
          }`}
        >
          전체
        </Button>
      </div>
    </div>
  );
}