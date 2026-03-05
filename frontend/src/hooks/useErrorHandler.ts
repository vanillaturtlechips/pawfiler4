import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function useErrorHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      toast.error("예상치 못한 오류가 발생했습니다");
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const handleAuthError = () => {
    toast.error("로그인이 필요합니다");
    navigate("/login");
  };

  const handleNetworkError = () => {
    toast.error("네트워크 연결을 확인해주세요", {
      action: {
        label: "새로고침",
        onClick: () => window.location.reload(),
      },
    });
  };

  const handleNotFoundError = () => {
    toast.error("요청한 페이지를 찾을 수 없습니다");
    navigate("/");
  };

  return {
    handleAuthError,
    handleNetworkError,
    handleNotFoundError,
  };
}
