import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Loader2, Image, Video } from "lucide-react";
import type { CommunityPost } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPost: CommunityPost | null;
  formTitle: string;
  setFormTitle: (v: string) => void;
  formBody: string;
  setFormBody: (v: string) => void;
  formTags: string;
  setFormTags: (v: string) => void;
  mediaPreview: string | null;
  mediaType: "image" | "video" | null;
  isCorrect: boolean | null;
  setIsCorrect: (v: boolean | null) => void;
  isSubmitting: boolean;
  isDragging: boolean;
  onMediaSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClearMedia: () => void;
  onSubmit: () => void;
};

export default function WriteModal({
  open, onOpenChange, editingPost,
  formTitle, setFormTitle, formBody, setFormBody, formTags, setFormTags,
  mediaPreview, mediaType, isCorrect, setIsCorrect,
  isSubmitting, isDragging,
  onMediaSelect, onDragOver, onDragLeave, onDrop, onClearMedia, onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-parchment border-parchment-border w-[95vw] max-w-[1100px] rounded-3xl p-0 overflow-hidden border-[6px] h-[90vh] flex flex-col">
        <div className="px-8 pt-6 pb-4 border-b-4 border-parchment-border flex-shrink-0">
          <DialogTitle className="font-jua text-3xl text-wood-darkest">
            {editingPost ? "📝 게시글 수정" : "✍️ 새 글 작성"}
          </DialogTitle>
          <DialogDescription className="font-jua text-base text-muted-foreground mt-1">
            이미지 또는 영상을 첨부하고 탐정들과 정보를 공유하세요
          </DialogDescription>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽: 미디어 (새 글 작성 시에만 표시) */}
          {!editingPost && (
            <div className="w-[42%] border-r-4 border-parchment-border p-6 flex flex-col gap-3">
              <label className="font-jua text-lg text-wood-dark">
                미디어 <span className="text-red-500 text-sm">(필수)</span>
              </label>
              {mediaPreview ? (
                <div className="relative rounded-2xl overflow-hidden border-4 border-parchment-border bg-black flex-1 flex items-center justify-center">
                  {mediaType === "video"
                    ? <video src={mediaPreview} controls className="w-full h-full object-contain" />
                    : <img src={mediaPreview} alt="미리보기" className="w-full h-full object-contain" />
                  }
                  <button
                    onClick={onClearMedia}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
                    disabled={isSubmitting}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <label
                  className={`flex-1 flex flex-col items-center justify-center gap-4 rounded-2xl border-4 border-dashed transition-all cursor-pointer
                    ${isDragging ? "border-orange-500 bg-orange-50/60 scale-[1.01]" : "border-parchment-border bg-white hover:border-orange-400 hover:bg-orange-50/30"}
                    ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <div className={`flex gap-4 ${isDragging ? "text-orange-500" : "text-muted-foreground"}`}>
                    <Image size={40} /><Video size={40} />
                  </div>
                  <span className="font-jua text-base text-wood-dark text-center">
                    {isDragging ? "여기에 놓으세요!" : "클릭 또는 드래그로 업로드"}
                  </span>
                  <span className="text-xs text-muted-foreground text-center px-4">
                    최대 100MB · jpg, png, gif, webp, mp4, mov, webm
                  </span>
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={onMediaSelect} disabled={isSubmitting} />
                </label>
              )}

              <div className="flex flex-col gap-2 mt-1">
                <label className="font-jua text-lg text-wood-dark">이 영상/사진은?</label>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setIsCorrect(isCorrect === true ? null : true)}
                    className={`flex-1 py-3 rounded-xl border-4 font-jua text-lg transition-all
                      ${isCorrect === true ? "border-green-500 bg-green-100 text-green-700 shadow-md scale-[1.02]" : "border-parchment-border bg-white text-wood-dark hover:border-green-400 hover:bg-green-50"}`}
                  >✅ 정답</button>
                  <button type="button"
                    onClick={() => setIsCorrect(isCorrect === false ? null : false)}
                    className={`flex-1 py-3 rounded-xl border-4 font-jua text-lg transition-all
                      ${isCorrect === false ? "border-red-500 bg-red-100 text-red-700 shadow-md scale-[1.02]" : "border-parchment-border bg-white text-wood-dark hover:border-red-400 hover:bg-red-50"}`}
                  >❌ 오답</button>
                </div>
                {isCorrect === null && (
                  <p className="text-xs text-red-500 font-jua">정답 또는 오답을 선택해주세요 (필수)</p>
                )}
              </div>
            </div>
          )}

          {/* 오른쪽: 텍스트 */}
          <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <label className="font-jua text-lg text-wood-dark">제목</label>
              <Input placeholder="제목을 입력하세요" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                className="h-12 text-base rounded-xl border-2 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400"
                disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="font-jua text-lg text-wood-dark">내용</label>
              <Textarea placeholder="내용을 입력하세요" value={formBody} onChange={e => setFormBody(e.target.value)}
                className="flex-1 min-h-[200px] text-base py-3 rounded-xl border-2 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400 leading-relaxed resize-none"
                disabled={isSubmitting} />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-jua text-lg text-wood-dark">태그 (쉼표로 구분)</label>
              <Input placeholder="예: 팁, 분석, 주의사항" value={formTags} onChange={e => setFormTags(e.target.value)}
                className="h-12 text-base rounded-xl border-2 border-parchment-border focus-visible:ring-orange-500 font-jua bg-white text-gray-900 placeholder:text-gray-400"
                disabled={isSubmitting} />
            </div>
          </div>
        </div>

        <div className="px-8 py-4 border-t-4 border-parchment-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}
            className="font-jua text-lg h-12 px-8 rounded-xl border-2 border-wood-darkest bg-white hover:bg-wood-dark/10 text-wood-darkest"
            disabled={isSubmitting}>
            취소
          </Button>
          <Button onClick={onSubmit}
            className="font-jua text-lg h-12 px-10 bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting || !formTitle.trim() || !formBody.trim() || (!editingPost && isCorrect === null)}>
            {isSubmitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />처리 중...</>
              : editingPost ? "수정 완료" : "등록하기"
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
