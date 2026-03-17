import { config } from "./config";
import { handleApiError } from "./api";
import type { 
  CommunityPost, 
  CommunityFeed, 
  CommunityComment 
} from "./types";
import { toast } from "sonner";

// Community Feed & Posts
export const fetchCommunityFeed = async (
  page = 1, 
  pageSize = config.communityPageSize,
  searchQuery?: string,
  searchType: "title" | "body" | "all" = "title"
): Promise<CommunityFeed> => {
  try {
    const requestBody: any = {
      page,
      pageSize,
    };
    
    if (searchQuery && searchQuery.trim()) {
      requestBody.searchQuery = searchQuery.trim();
      requestBody.searchType = searchType;
    }
    
    const response = await fetch(
      `${config.communityBaseUrl}/community.CommunityService/GetFeed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.statusText}`);
    }

    const data = await response.json();
    
    // gRPC snake_case를 camelCase로 변환
    const transformedPosts: CommunityPost[] = data.posts?.map((post: any) => ({
      id: post.id,
      authorNickname: post.author_nickname || "익명",
      authorEmoji: post.author_emoji || "👤",
      title: post.title,
      body: post.body,
      likes: post.likes || 0,
      comments: post.comments || 0,
      createdAt: post.created_at || new Date().toISOString(),
      tags: post.tags || [],
      userId: post.author_id,
      mediaUrl: post.media_url || post.mediaUrl,
      mediaType: post.media_type || post.mediaType,
      isAdminPost: post.is_admin_post || post.isAdminPost || false,
    })) || [];

    return {
      posts: transformedPosts,
      totalCount: data.total_count || 0,
      page: data.page || page,
    };
  } catch (error) {
    return handleApiError(error, '커뮤니티 피드 로드');
  }
};

export const createCommunityPost = async (req: {
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  title: string;
  body: string;
  tags: string[];
  mediaFile?: File;
  isAdminPost?: boolean;
  isCorrect?: boolean;
}): Promise<CommunityPost> => {
  try {
    const formData = new FormData();
    formData.append('user_id', req.userId);
    formData.append('author_nickname', req.authorNickname);
    formData.append('author_emoji', req.authorEmoji);
    formData.append('title', req.title);
    formData.append('body', req.body);
    formData.append('tags', JSON.stringify(req.tags));
    formData.append('is_admin_post', String(req.isAdminPost || false));
    
    if (req.isCorrect !== undefined) {
      formData.append('is_correct', String(req.isCorrect));
    }
    
    if (req.mediaFile) {
      formData.append('file', req.mediaFile);
    }

    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CreatePost`, {
      method: "POST",
      body: formData, // FormData 사용 (Content-Type 헤더 자동 설정)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Failed to create post`);
    }

    const data = await response.json();
    return {
      id: data.id,
      authorNickname: data.author_nickname || data.authorNickname || req.authorNickname,
      authorEmoji: data.author_emoji || data.authorEmoji || req.authorEmoji,
      title: data.title,
      body: data.body,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.created_at || data.createdAt || new Date().toISOString(),
      tags: data.tags || [],
      userId: data.author_id || req.userId,
      mediaUrl: data.media_url || data.mediaUrl,
      mediaType: data.media_type || data.mediaType,
      isAdminPost: data.is_admin_post || data.isAdminPost || false,
    };
  } catch (error) {
    return handleApiError(error, '게시글 작성');
  }
};

export const updateCommunityPost = async (req: {
  postId: string;
  userId: string;
  title: string;
  body: string;
  tags: string[];
}): Promise<CommunityPost> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/UpdatePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post_id: req.postId,
        user_id: req.userId,
        title: req.title,
        body: req.body,
        tags: req.tags,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '게시글 수정');
  }
};

export const deleteCommunityPost = async (postId: string, userId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/DeletePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '게시글 삭제');
  }
};

export const getPost = async (postId: string): Promise<CommunityPost> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetPost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ post_id: postId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch post: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      authorNickname: data.author_nickname || data.authorNickname || '익명',
      authorEmoji: data.author_emoji || data.authorEmoji || '🐾',
      title: data.title,
      body: data.body,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.created_at || data.createdAt || new Date().toISOString(),
      tags: data.tags || [],
      userId: data.author_id || data.userId,
      mediaUrl: data.media_url || data.mediaUrl,
      mediaType: data.media_type || data.mediaType,
      isAdminPost: data.is_admin_post || data.isAdminPost || false,
      trueVotes: data.true_votes || data.trueVotes || 0,
      falseVotes: data.false_votes || data.falseVotes || 0,
    };
  } catch (error) {
    return handleApiError(error, '게시글 로드');
  }
};

// Community Comments
export const fetchCommunityComments = async (postId: string): Promise<CommunityComment[]> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetComments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch comments: ${response.statusText}`);
    }

    const data = await response.json();
    
    // gRPC snake_case를 camelCase로 변환
    const transformedComments: CommunityComment[] = data.comments?.map((comment: any) => ({
      id: comment.id,
      postId: comment.post_id,
      authorNickname: comment.author_nickname || "익명",
      authorEmoji: comment.author_emoji || "👤",
      body: comment.body,
      createdAt: comment.created_at || new Date().toISOString(),
      userId: comment.author_id,
    })) || [];
    
    return transformedComments;
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return [];
  }
};

export const createCommunityComment = async (req: {
  postId: string;
  userId: string;
  authorNickname: string;
  authorEmoji: string;
  body: string;
}): Promise<CommunityComment> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CreateComment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Failed to create comment: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '댓글 작성');
  }
};

export const deleteCommunityComment = async (commentId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/DeleteComment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ commentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete comment: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '댓글 삭제');
  }
};

// Community Likes
export const likePost = async (postId: string, userId: string): Promise<{ success: boolean; alreadyLiked?: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/LikePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to like post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '좋아요');
  }
};

export const unlikePost = async (postId: string, userId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/UnlikePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to unlike post: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    return handleApiError(error, '좋아요 취소');
  }
};

export const checkLike = async (postId: string, userId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CheckLike`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId, userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to check like: ${response.statusText}`);
    }

    const data = await response.json();
    return data.liked || false;
  } catch (error) {
    console.error('Failed to check like:', error);
    return false;
  }
};

// Community Dashboard
export const fetchNotices = async (): Promise<Array<{ id: string; title: string }>> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetNotices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch notices: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch notices:', error);
    return [];
  }
};

export const fetchTopDetective = async (): Promise<{ authorNickname: string; authorEmoji: string; totalLikes: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetTopDetective`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch top detective: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch top detective:', error);
    return { authorNickname: "아직 없음", authorEmoji: "🏆", totalLikes: 0 };
  }
};

export const fetchHotTopic = async (): Promise<{ tag: string; count: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetHotTopic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hot topic: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch hot topic:', error);
    return { tag: "없음", count: 0 };
  }
};

// Community Media
export const uploadCommunityMedia = async (file: File): Promise<{ mediaUrl: string; mediaType: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const response = await fetch(`${config.communityBaseUrl}/community/upload-media`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || "미디어 업로드 실패");
    }
    const data = await response.json();
    return {
      mediaUrl: data.media_url || data.mediaUrl || "",
      mediaType: data.media_type || data.mediaType || "",
    };
  } catch (error) {
    console.error("미디어 업로드 실패:", error);
    toast.error("미디어 업로드에 실패했습니다.");
    throw error;
  }
};

// Community Voting (현재 백엔드 이슈로 인해 기본값 반환)
export const votePost = async (postId: string, userId: string, vote: boolean): Promise<{ success: boolean; alreadyVoted: boolean; xpEarned: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/VotePost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, user_id: userId, vote }),
    });
    if (!response.ok) throw new Error("투표 실패");
    return await response.json();
  } catch (error) {
    return handleApiError(error, "투표");
  }
};

export const getVoteResult = async (postId: string): Promise<{ trueVotes: number; falseVotes: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetVoteResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId }),
    });
    if (!response.ok) throw new Error("투표 결과 조회 실패");
    const data = await response.json();
    return {
      trueVotes: data.true_votes || data.trueVotes || 0,
      falseVotes: data.false_votes || data.falseVotes || 0,
    };
  } catch (error) {
    // 투표 기능이 아직 완전히 구현되지 않았으므로 조용히 기본값 반환
    return { trueVotes: 0, falseVotes: 0 };
  }
};

export const getUserVote = async (postId: string, userId: string): Promise<{ voted: boolean; vote?: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/GetUserVote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });
    if (!response.ok) throw new Error("투표 여부 조회 실패");
    return await response.json();
  } catch (error) {
    console.error("Failed to get user vote:", error);
    return { voted: false };
  }
};