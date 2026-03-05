import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import QuizManagePage from "./pages/QuizManagePage";
import AdminHomePage from "./pages/AdminHomePage.tsx";
import AdminCommunityPage from "./pages/AdminCommunityPage.tsx";
import AdminCommentsPage from "./pages/AdminCommentsPage.tsx";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/admin/quiz" element={<QuizManagePage />} />
        <Route path="/admin/community" element={<AdminCommunityPage />} />
        <Route path="/admin/comments" element={<AdminCommentsPage />} />
        <Route path="/quiz" element={<Navigate to="/admin/quiz" replace />} />
        <Route path="/community" element={<Navigate to="/admin/community" replace />} />
        <Route path="/comments" element={<Navigate to="/admin/comments" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
