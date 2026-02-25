import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCommunityFeed } from "@/lib/mockApi";
import type { CommunityPost } from "@/lib/types";

const CommunityPage = () => {
  const { token } = useAuth();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchCommunityFeed(token)
      .then((feed) => setPosts(feed.posts))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <motion.div
      className="flex h-full flex-col gap-5 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <h1 className="font-jua text-4xl text-foreground text-shadow-deep">📜 동물들의 광장</h1>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <ParchmentPanel key={i} className="p-5">
              <Skeleton className="h-6 w-1/3 rounded bg-parchment-border mb-3" />
              <Skeleton className="h-4 w-2/3 rounded bg-parchment-border mb-2" />
              <Skeleton className="h-4 w-1/2 rounded bg-parchment-border" />
            </ParchmentPanel>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto flex-1">
          {posts.map((post) => (
            <motion.div key={post.id} whileHover={{ scale: 1.01 }}>
              <ParchmentPanel className="p-5 cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{post.authorEmoji}</span>
                  <div>
                    <span className="font-jua text-lg" style={{ color: "hsl(var(--wood-darkest))" }}>
                      {post.authorNickname}
                    </span>
                    <span className="text-xs ml-2 opacity-50">
                      {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </div>
                <h3 className="font-jua text-xl mb-1" style={{ color: "hsl(var(--wood-darkest))" }}>
                  {post.title}
                </h3>
                <p className="text-sm" style={{ color: "hsl(var(--wood-dark))" }}>{post.body}</p>
                <div className="flex gap-4 mt-3 text-sm" style={{ color: "hsl(var(--wood-light))" }}>
                  <span>❤️ {post.likes}</span>
                  <span>💬 {post.comments}</span>
                  {post.tags.map((t) => (
                    <span key={t} className="rounded-full bg-parchment-border px-2 py-0.5 text-xs">
                      #{t}
                    </span>
                  ))}
                </div>
              </ParchmentPanel>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default CommunityPage;
