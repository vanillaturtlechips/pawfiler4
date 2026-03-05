import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import QuizManagePage from "./pages/QuizManagePage";
import AdminHomePage from "./pages/AdminHomePage";
import AdminCommunityPage from "./pages/AdminCommunityPage";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/admin/quiz" element={<QuizManagePage />} />
        <Route path="/admin/community" element={<AdminCommunityPage />} />
        <Route path="/quiz" element={<Navigate to="/admin/quiz" replace />} />
        <Route path="/community" element={<Navigate to="/admin/community" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
