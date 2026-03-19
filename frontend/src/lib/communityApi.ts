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
      authorNickname: post.authorNickname || post.author_nickname || "익명",
      authorEmoji: post.authorEmoji || post.author_emoji || "👤",
      title: post.title,
      body: post.body,
      likes: post.likes || 0,
      comments: post.comments || 0,
      createdAt: post.createdAt || post.created_at || new Date().toISOString(),
      tags: post.tags || [],
      userId: post.authorId || post.author_id,
      mediaUrl: post.mediaUrl || post.media_url,
      mediaType: post.mediaType || post.media_type,
      isAdminPost: post.isAdminPost || post.is_admin_post || false,
    })) || [];

    return {
      posts: transformedPosts,
      totalCount: data.totalCount || data.total_count || 0,
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
    // 1. 미디어 파일이 있으면 먼저 업로드 (gRPC로 변경)
    let mediaUrl = "";
    let mediaType = "";
    if (req.mediaFile) {
      // 파일을 base64로 변환
      const arrayBuffer = await req.mediaFile.arrayBuffer();
      const base64Content = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const uploadResponse = await fetch(`${config.communityBaseUrl}/community.CommunityService/UploadMedia`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_name: req.mediaFile.name,
          content: base64Content,
          content_type: req.mediaFile.type,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error("미디어 업로드 실패");
      }

      const uploadData = await uploadResponse.json();
      mediaUrl = uploadData.media_url || uploadData.mediaUrl || "";
      mediaType = uploadData.media_type || uploadData.mediaType || "";
    }

    // 2. JSON으로 게시글 생성 (gRPC Gateway는 JSON만 받음)
    const requestBody: any = {
      user_id: req.userId,
      author_nickname: req.authorNickname,
      author_emoji: req.authorEmoji,
      title: req.title,
      body: req.body,
      tags: req.tags,
      is_admin_post: req.isAdminPost || false,
    };

    if (mediaUrl) {
      requestBody.media_url = mediaUrl;
      requestBody.media_type = mediaType;
    }

    if (req.isCorrect !== undefined) {
      requestBody.is_correct = req.isCorrect;
    }

    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/CreatePost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Failed to create post`);
    }

    const data = await response.json();
    return {
      id: data.id,
      authorNickname: data.authorNickname || data.author_nickname || req.authorNickname,
      authorEmoji: data.author_emoji || data.authorEmoji || req.authorEmoji,
      title: data.title,
      body: data.body,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.createdAt || data.created_at || new Date().toISOString(),
      tags: data.tags || [],
      userId: data.authorId || data.author_id || req.userId,
      mediaUrl: data.mediaUrl || data.media_url,
      mediaType: data.media_type || data.mediaType,
      isAdminPost: data.isAdminPost || data.is_admin_post || false,
      isCorrect: data.isCorrect ?? data.is_correct,
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

    const data = await response.json();
    return {
      id: data.id,
      authorNickname: data.authorNickname || data.author_nickname || "익명",
      authorEmoji: data.authorEmoji || data.author_emoji || "🕵️",
      title: data.title || req.title,
      body: data.body || req.body,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.createdAt || data.created_at || new Date().toISOString(),
      tags: data.tags || req.tags,
      userId: data.authorId || data.author_id || req.userId,
      mediaUrl: data.mediaUrl || data.media_url,
      mediaType: data.mediaType || data.media_type,
      isAdminPost: data.isAdminPost || data.is_admin_post || false,
      trueVotes: data.trueVotes || data.true_votes || 0,
      falseVotes: data.falseVotes || data.false_votes || 0,
      isCorrect: data.isCorrect ?? data.is_correct,
    };
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
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody.message || errBody.error || `HTTP ${response.status}`;
      console.error('[DeletePost] 실패:', { status: response.status, postId, userId, msg });
      throw new Error(msg);
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
      authorNickname: data.authorNickname || data.author_nickname || '익명',
      authorEmoji: data.author_emoji || data.authorEmoji || '🐾',
      title: data.title,
      body: data.body,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.createdAt || data.created_at || new Date().toISOString(),
      tags: data.tags || [],
      userId: data.authorId || data.author_id || data.userId,
      mediaUrl: data.mediaUrl || data.media_url,
      mediaType: data.media_type || data.mediaType,
      isAdminPost: data.isAdminPost || data.is_admin_post || false,
      trueVotes: data.trueVotes || data.true_votes || 0,
      falseVotes: data.falseVotes || data.false_votes || 0,
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
      authorNickname: comment.authorNickname || comment.author_nickname || "익명",
      authorEmoji: comment.author_emoji || "👤",
      body: comment.body,
      createdAt: comment.createdAt || comment.created_at || new Date().toISOString(),
      userId: comment.authorId || comment.author_id,
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

    const data = await response.json();
    return {
      id: data.id,
      postId: data.postId || data.post_id || req.postId,
      authorNickname: data.authorNickname || data.author_nickname || req.authorNickname,
      authorEmoji: data.authorEmoji || data.author_emoji || req.authorEmoji,
      body: data.body || req.body,
      createdAt: data.createdAt || data.created_at || new Date().toISOString(),
      userId: data.authorId || data.author_id || req.userId,
    };
  } catch (error) {
    return handleApiError(error, '댓글 작성');
  }
};

export const deleteCommunityComment = async (commentId: string, userId: string): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/DeleteComment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment_id: commentId, user_id: userId }),
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
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to like post: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      success: data.success ?? true,
      alreadyLiked: data.alreadyLiked ?? data.already_liked ?? false,
    };
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
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to unlike post: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: data.success ?? true };
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
      body: JSON.stringify({ post_id: postId, user_id: userId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to check like: ${response.statusText}`);
    }

    const data = await response.json();
    return data.liked ?? false;
  } catch (error) {
    console.error('Failed to check like:', error);
    return false;
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

// Community Voting (현재 백엔드 이슈로 인해 기본값 반환)
export const votePost = async (postId: string, userId: string, vote: boolean): Promise<{ success: boolean; alreadyVoted: boolean; xpEarned: number }> => {
  try {
    const response = await fetch(`${config.communityBaseUrl}/community.CommunityService/VotePost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: postId, user_id: userId, vote }),
    });
    if (!response.ok) throw new Error("투표 실패");
    const data = await response.json();
    return {
      success: data.success ?? true,
      alreadyVoted: data.alreadyVoted ?? data.already_voted ?? false,
      xpEarned: data.xpEarned ?? data.xp_earned ?? 0,
    };
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
      trueVotes: data.trueVotes || data.true_votes || 0,
      falseVotes: data.falseVotes || data.false_votes || 0,
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
    const data = await response.json();
    return { voted: data.voted ?? false, vote: data.vote };
  } catch (error) {
    console.error("Failed to get user vote:", error);
    return { voted: false };
  }
};