import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import ParallaxBackground from "@/components/ParallaxBackground";
import Header from "@/components/Header";
import HomePage from "@/pages/HomePage";
import GamePage from "@/pages/GamePage";
import AnalysisPage from "@/pages/AnalysisPage";
import CommunityPage from "@/pages/CommunityPage";
import CommunityPostPage from "@/pages/CommunityPostPage";
import ShopPage from "@/pages/ShopPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "./pages/NotFound";
import { useState, useCallback } from "react";

const queryClient = new QueryClient();

const AppContent = () => {
  const location = useLocation();
  const [showHeader, setShowHeader] = useState(false);
  const isHomePage = location.pathname === '/';

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isHomePage) {
      const { clientY } = e;
      // 메인 페이지에서만 마우스 호버로 헤더 표시
      if (clientY < 50) {
        setShowHeader(true);
      } else {
        setShowHeader(false);
      }
    }
  }, [isHomePage]);

  return (
    <ParallaxBackground>
      <div 
        className="min-h-screen"
        onMouseMove={handleMouseMove}
      >
        {/* 메인 페이지가 아니면 항상 헤더 표시 */}
        <Header isVisible={!isHomePage || showHeader} />
        <main className="flex-1 overflow-hidden pt-20">
          <div className="mx-auto h-full w-full max-w-[1800px] px-8">
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/game" element={<AuthGuard><GamePage /></AuthGuard>} />
                <Route path="/analysis" element={<AuthGuard><AnalysisPage /></AuthGuard>} />
                <Route path="/community" element={<AuthGuard><CommunityPage /></AuthGuard>} />
                <Route path="/community/:postId" element={<AuthGuard><CommunityPostPage /></AuthGuard>} />
                <Route path="/shop" element={<AuthGuard><ShopPage /></AuthGuard>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ParallaxBackground>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
