import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import ParallaxBackground from "@/components/ParallaxBackground";
import Header from "@/components/Header";
import UserProfile from "@/components/UserProfile";
import TreasureChest from "@/components/TreasureChest";
import HomePage from "@/pages/HomePage";
import GamePage from "@/pages/GamePage";
import AnalysisPage from "@/pages/AnalysisPage";
import CommunityPage from "@/pages/CommunityPage";
import ShopPage from "@/pages/ShopPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ParallaxBackground>
            <Header />
            <UserProfile />
            <TreasureChest />
            <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
              <div className="mx-auto h-full w-full max-w-[1500px] px-5">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/game" element={<AuthGuard><GamePage /></AuthGuard>} />
                    <Route path="/analysis" element={<AuthGuard><AnalysisPage /></AuthGuard>} />
                    <Route path="/community" element={<AuthGuard><CommunityPage /></AuthGuard>} />
                    <Route path="/shop" element={<AuthGuard><ShopPage /></AuthGuard>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AnimatePresence>
              </div>
            </main>
          </ParallaxBackground>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
