import { Skeleton } from "@/components/ui/skeleton";

export function GamePageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* 퀴즈 카드 */}
      <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
        {/* 미디어 */}
        <Skeleton className="w-full h-64 rounded-lg" />
        
        {/* 질문 */}
        <Skeleton className="h-6 w-3/4" />
        
        {/* 선택지 */}
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        
        {/* 버튼 */}
        <Skeleton className="h-12 w-32 ml-auto" />
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

export function CommunityPageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* 검색바 */}
      <Skeleton className="h-12 w-full" />

      {/* 게시글 목록 */}
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalysisPageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <Skeleton className="h-8 w-64 mx-auto" />
      
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 업로드 영역 */}
        <Skeleton className="h-64 w-full rounded-lg" />
        
        {/* 버튼 */}
        <Skeleton className="h-12 w-full" />
        
        {/* 결과 영역 */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
