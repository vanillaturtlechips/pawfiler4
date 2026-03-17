import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import QuizManagePage from "./pages/QuizManagePage";
import AdminHomePage from "./pages/AdminHomePage";
import AdminCommunityPage from "./pages/AdminCommunityPage";
import AdminShopPage from "./pages/AdminShopPage";
import AdminUsersPage from "./pages/AdminUsersPage";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/quiz" element={<QuizManagePage />} />
          <Route path="/admin/community" element={<AdminCommunityPage />} />
          <Route path="/admin/shop" element={<AdminShopPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
