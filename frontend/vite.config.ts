import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5174,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/quiz.': { target: 'http://localhost:8080', changeOrigin: true },
      '/community.': { target: 'http://localhost:8081', changeOrigin: true },
      '/user.': { target: 'http://localhost:8083', changeOrigin: true },
      '/api/auth': { target: 'http://localhost:8084', changeOrigin: true, rewrite: (p: string) => p.replace('/api/auth', '') },
      '/auth/': { target: 'http://localhost:8084', changeOrigin: true },
      '/api/report': { target: 'http://localhost:8090', changeOrigin: true },
      '/api/upload-video': { target: 'http://localhost:8085', changeOrigin: true },
      '/api/video_analysis.': { target: 'http://localhost:8085', changeOrigin: true },
      '/api/analysis': { target: 'http://localhost:8085', changeOrigin: true },
      '/api/keys': { target: 'http://localhost:8085', changeOrigin: true },
      '/internal': { target: 'http://localhost:8085', changeOrigin: true },
      '/video_analysis.': { target: 'http://localhost:8085', changeOrigin: true, rewrite: (p: string) => '/api' + p },
      '/upload-video': { target: 'http://localhost:8085', changeOrigin: true, rewrite: (p: string) => p.replace('/upload-video', '/api/upload-video') },
      '/ai/': { target: 'http://localhost:8000', changeOrigin: true, rewrite: (p: string) => p.replace('/ai', '') },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
