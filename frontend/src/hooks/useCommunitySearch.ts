import { useState, useEffect } from "react";
import { fetchCommunityFeed } from "@/lib/communityApi";
import type { CommunityPost } from "@/lib/types";
import { toast } from "sonner";

export function useCommunitySearch(token: string | null) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"title" | "body" | "all">("title");
  
  const pageSize = 15;

  const fetchFeed = async (p: number, search?: string) => {
    try {
      setLoading(true);
      const feed = await fetchCommunityFeed(p, pageSize, search, searchType);
      setTotalCount(feed.totalCount);
      setPage(p);
      setPosts(
        feed.posts.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
    } catch (error) {
      console.error("Failed to fetch feed:", error);
      toast.error("게시글을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드
  useEffect(() => {
    if (!token) return;
    fetchFeed(1);
  }, [token]);

  // 검색어 변경 시 디바운싱 적용
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      fetchFeed(1, query || undefined);
    }, 300); // 300ms 디바운싱
    return () => clearTimeout(timer);
  }, [query, searchType, token]);

  const handlePageChange = (newPage: number) => {
    fetchFeed(newPage, query || undefined);
  };

  return {
    posts,
    setPosts,
    loading,
    page,
    totalCount,
    setTotalCount,
    pageSize,
    query,
    setQuery,
    searchType,
    setSearchType,
    fetchFeed,
    handlePageChange,
  };
}