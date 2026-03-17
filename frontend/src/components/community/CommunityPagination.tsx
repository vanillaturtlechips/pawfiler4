import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  totalCount: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
};

export default function CommunityPagination({
  page,
  totalCount,
  pageSize,
  loading,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (totalCount <= pageSize) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-4 py-8">
      <Button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1 || loading}
        variant="outline"
        size="lg"
        className="font-jua text-lg gap-2 rounded-2xl px-6 py-6 border-4 border-wood-darkest"
      >
        <ChevronLeft size={24} />
        이전
      </Button>
      <div className="flex items-center gap-2">
        {(() => {
          const maxVisiblePages = 10;
          let startPage = Math.max(
            1,
            page - Math.floor(maxVisiblePages / 2)
          );
          let endPage = Math.min(
            totalPages,
            startPage + maxVisiblePages - 1
          );

          // Adjust start if we're near the end
          if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
          }

          const pages = [];

          // First page
          if (startPage > 1) {
            pages.push(
              <Button
                key={1}
                onClick={() => onPageChange(1)}
                disabled={loading}
                className="font-jua text-lg w-12 h-12 rounded-xl transition-all bg-white hover:bg-orange-50 text-wood-darkest border-2 border-wood-darkest"
              >
                1
              </Button>
            );
            if (startPage > 2) {
              pages.push(
                <span key="ellipsis1" className="px-2">
                  ...
                </span>
              );
            }
          }

          // Visible pages
          for (let i = startPage; i <= endPage; i++) {
            const isCurrentPage = i === page;
            pages.push(
              <Button
                key={i}
                onClick={() => onPageChange(i)}
                disabled={loading}
                className={`font-jua text-lg w-12 h-12 rounded-xl transition-all ${
                  isCurrentPage
                    ? "bg-orange-500 hover:bg-orange-600 text-white shadow-lg"
                    : "bg-white hover:bg-orange-50 text-wood-darkest border-2 border-wood-darkest"
                }`}
              >
                {i}
              </Button>
            );
          }

          // Last page
          if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
              pages.push(
                <span key="ellipsis2" className="px-2">
                  ...
                </span>
              );
            }
            pages.push(
              <Button
                key={totalPages}
                onClick={() => onPageChange(totalPages)}
                disabled={loading}
                className="font-jua text-lg w-12 h-12 rounded-xl transition-all bg-white hover:bg-orange-50 text-wood-darkest border-2 border-wood-darkest"
              >
                {totalPages}
              </Button>
            );
          }

          return pages;
        })()}
      </div>
      <Button
        onClick={() =>
          onPageChange(Math.min(totalPages, page + 1))
        }
        disabled={page === totalPages || loading}
        variant="outline"
        size="lg"
        className="font-jua text-lg gap-2 rounded-2xl px-6 py-6 border-4 border-wood-darkest"
      >
        다음
        <ChevronRight size={24} />
      </Button>
    </div>
  );
}