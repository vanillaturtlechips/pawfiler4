import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import QuizManagePage from "./pages/QuizManagePage";

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Navigate to="/quiz" replace />} />
        <Route path="/quiz" element={<QuizManagePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
