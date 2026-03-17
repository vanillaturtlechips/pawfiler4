import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { fetchRanking } from "@/lib/api";
import {
  createCommunityPost,
  updateCommunityPost,
  deleteCommunityPost,
  fetchTopDetective,
  fetchHotTopic,
} from "@/lib/communityApi";
import { PlusCircle } from "lucide-react";
import type { CommunityPost, MediaType } from "@/lib/types";
import { toast } from "sonner";

// 분리된 컴포넌트들
import CommunityDashboard from "@/components/community/CommunityDashboard";
import CommunitySearch from "@/components/community/CommunitySearch";
import CommunityPostTable from "@/components/community/CommunityPostTable";
import CommunityPagination from "@/components/community/CommunityPagination";
import WriteModal from "@/components/community/WriteModal";
import { useCommunitySearch } from "@/hooks/useCommunitySearch";

const CommunityPage = () => {
  const { token, user } = useAuth();
  
  // 검색 및 피드 관련 상태는 커스텀 훅으로 이동
  const {
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
    handlePageChange,
  } = useCommunitySearch(token);

  // Dashboard State
  const [topDetective, setTopDetective] = useState<{
    authorNickname: string;
    authorEmoji: string;
    totalLikes: number;
  }>({
    authorNickname: "아직 없음",
    authorEmoji: "🏆",
    totalLikes: 0,
  });
  const [hotTopic, setHotTopic] = useState<{ tag: string; count: number }>({
    tag: "없음",
    count: 0,
  });

  // Ranking Modal State
  const [ranking, setRanking] = useState<
    Array<{
      rank: number;
      userId: string;
      nickname: string;
      avatarEmoji: string;
      tier: string;
      level: number;
      totalExp: number;
      totalCoins: number;
      totalAnswered: number;
      correctCount: number;
      accuracy: number;
    }>
  >([]);
  const [featuredPosts, setFeaturedPosts] = useState<
    Array<{
      id: string;
      title: string;
      authorNickname: string;
      likes: number;
    }>
  >([]);

  // WriteModal State (분리된 컴포넌트용)
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formTags, setFormTags] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadDashboardData();
  }, [token]);

  const loadDashboardData = async () => {
    try {
      const [detectiveData, topicData, rankingData] = await Promise.all([
        fetchTopDetective(),
        fetchHotTopic(),
        fetchRanking("tier"),
      ]);
      setTopDetective(detectiveData);
      setHotTopic(topicData);
      setRanking(rankingData);
      
      // 추천 글은 현재 posts에서 좋아요 순으로 정렬
      const sorted = [...posts]
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 3);
      setFeaturedPosts(
        sorted.map((p) => ({
          id: p.id,
          title: p.title,
          authorNickname: p.authorNickname,
          likes: p.likes,
        }))
      );
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    }
  };

  // posts가 변경될 때마다 추천 글 업데이트
  useEffect(() => {
    if (posts.length > 0) {
      const sorted = [...posts]
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 3);
      setFeaturedPosts(
        sorted.map((p) => ({
          id: p.id,
          title: p.title,
          authorNickname: p.authorNickname,
          likes: p.likes,
        }))
      );
    }
  }, [posts]);
  // WriteModal 관련 함수들
  const handleOpenCreate = () => {
    setEditingPost(null);
    setFormTitle("");
    setFormBody("");
    setFormTags("");
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    setIsCorrect(null);
    setWriteModalOpen(true);
  };

  const handleOpenEdit = (e: React.MouseEvent, post: CommunityPost) => {
    e.stopPropagation();
    setEditingPost(post);
    setFormTitle(post.title);
    setFormBody(post.body);
    setFormTags(post.tags.join(", "));
    setMediaPreview(post.mediaUrl || null);
    setMediaType(post.mediaType || null);
    setIsCorrect(post.isCorrect);
    setWriteModalOpen(true);
  };

  const handleDelete = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!confirm("정말 이 게시글을 삭제하시겠습니까?")) return;
    if (!user) return;

    try {
      await deleteCommunityPost(postId, user.id);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      toast.success("게시글이 삭제되었습니다.");
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("게시글 삭제에 실패했습니다.");
    }
  };

  // 미디어 파일 처리
  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      toast.error("파일 크기는 100MB 이하여야 합니다.");
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      toast.error("이미지 또는 비디오 파일만 업로드 가능합니다.");
      return;
    }

    setMediaFile(file);
    setMediaType(isVideo ? "video" : "image");

    const reader = new FileReader();
    reader.onload = (e) => setMediaPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };
  // 드래그 앤 드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error("파일 크기는 100MB 이하여야 합니다.");
        return;
      }

      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (!isVideo && !isImage) {
        toast.error("이미지 또는 비디오 파일만 업로드 가능합니다.");
        return;
      }

      setMediaFile(file);
      setMediaType(isVideo ? "video" : "image");

      const reader = new FileReader();
      reader.onload = (e) => setMediaPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error("제목과 내용을 입력해주세요.");
      return;
    }

    if (!editingPost && isCorrect === null) {
      toast.error("정답 또는 오답을 선택해주세요.");
      return;
    }

    const tags = formTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t !== "");

    setIsSubmitting(true);
    try {
      if (editingPost) {
        if (!user) return;
        const updated = await updateCommunityPost({
          postId: editingPost.id,
          userId: user.id,
          title: formTitle,
          body: formBody,
          tags,
        });
        setPosts((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
        toast.success("게시글이 수정되었습니다.");
      } else {
        if (!user) return;
        const created = await createCommunityPost({
          userId: user.id,
          authorNickname: user.nickname || "익명 탐정",
          authorEmoji: user.avatarEmoji || "🕵️",
          title: formTitle,
          body: formBody,
          tags,
          ...(mediaFile && { mediaFile }),
          isCorrect: isCorrect!,
        });
        // 검색 중이 아닐 때만 목록에 추가
        if (!query) {
          setPosts((prev) => [created, ...prev]);
        }
        setTotalCount((prev) => prev + 1);
        toast.success("새 게시글이 등록되었습니다.");
      }
      setWriteModalOpen(false);
      setFormTitle("");
      setFormBody("");
      setFormTags("");
      clearMedia();
    } catch (error) {
      console.error("Failed to submit post:", error);
      toast.error("게시글 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagClick = (tag: string) => {
    setQuery(tag);
  };
  return (
    <div
      className="h-[calc(100vh-5rem)] w-full overflow-y-auto"
      style={{ scrollbarGutter: "stable" }}
    >
      <motion.div
        className="flex flex-col gap-6 p-6 max-w-[1400px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header Section */}
        <header className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="text-6xl">📜</div>
              <div className="flex flex-col">
                <h1 className="font-jua text-5xl text-foreground text-shadow-glow tracking-tight">
                  동물들의 광장
                </h1>
                <p className="text-muted-foreground font-jua text-lg opacity-80">
                  탐정들의 비밀 정보 교환소
                </p>
              </div>
            </div>
            <Button
              onClick={handleOpenCreate}
              size="lg"
              className="font-jua text-xl bg-orange-500 hover:bg-orange-600 text-white gap-3 shadow-lg hover:shadow-orange-500/20 transform hover:-translate-y-1 transition-all rounded-2xl px-8 py-6"
            >
              <PlusCircle size={24} />
              글쓰기
            </Button>
          </div>
          <CommunitySearch
            query={query}
            setQuery={setQuery}
            searchType={searchType}
            setSearchType={setSearchType}
          />
        </header>
        {/* Dashboard Panels */}
        <CommunityDashboard
          featuredPosts={featuredPosts}
          ranking={ranking}
          hotTopic={hotTopic}
          topDetective={topDetective}
          onTagClick={handleTagClick}
        />

        {/* Post Table */}
        <CommunityPostTable
          posts={posts}
          loading={loading}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
        />

        {/* Pagination */}
        <CommunityPagination
          page={page}
          totalCount={totalCount}
          pageSize={pageSize}
          loading={loading}
          onPageChange={handlePageChange}
        />

        {/* WriteModal */}
        <WriteModal
          open={writeModalOpen}
          onOpenChange={setWriteModalOpen}
          editingPost={editingPost}
          formTitle={formTitle}
          setFormTitle={setFormTitle}
          formBody={formBody}
          setFormBody={setFormBody}
          formTags={formTags}
          setFormTags={setFormTags}
          mediaPreview={mediaPreview}
          mediaType={mediaType}
          isCorrect={isCorrect}
          setIsCorrect={setIsCorrect}
          isSubmitting={isSubmitting}
          isDragging={isDragging}
          onMediaSelect={handleMediaSelect}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClearMedia={clearMedia}
          onSubmit={handleSubmit}
        />
      </motion.div>
    </div>
  );
};

export default CommunityPage;