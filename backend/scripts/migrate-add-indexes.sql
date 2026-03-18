-- Performance indexes for VU 1500-2000 load test
-- Run with: psql $DATABASE_URL -f migrate-add-indexes.sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_posts_author ON community.posts(author_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_posts_created ON community.posts(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_likes_post ON community.likes(post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_likes_user ON community.likes(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_community_comments_post ON community.comments(post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_answers_user ON quiz.user_answers(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_profiles_user ON quiz.user_profiles(user_id);
