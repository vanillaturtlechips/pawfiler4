import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  createQuestion,
  updateQuestion,
  uploadMedia,
  type Question,
  type CreateQuestionRequest,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuestionFormProps {
  question: Question | null;
  onClose: () => void;
}

export default function QuestionForm({ question, onClose }: QuestionFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form fields
  const [type, setType] = useState<string>(question?.type || "multiple_choice");
  const [mediaType, setMediaType] = useState<string>(question?.media_type || "image");
  const [mediaUrl, setMediaUrl] = useState<string>(question?.media_url || "");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<string>(question?.difficulty || "easy");
  const [category, setCategory] = useState<string>(question?.category || "ai-generated-detection");
  const [explanation, setExplanation] = useState<string>(question?.explanation || "");
  
  // Type-specific fields
  const [options, setOptions] = useState<string[]>(question?.options || ["", ""]);
  const [correctIndex, setCorrectIndex] = useState<number>(question?.correct_index || 0);
  const [correctAnswer, setCorrectAnswer] = useState<boolean>(question?.correct_answer || false);
  const [comparisonMediaUrl, setComparisonMediaUrl] = useState<string>(question?.comparison_media_url || "");
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [correctSide, setCorrectSide] = useState<string>(question?.correct_side || "left");
  
  // Region select fields
  const [regionX, setRegionX] = useState<number>(question?.correct_regions?.[0]?.x || 0);
  const [regionY, setRegionY] = useState<number>(question?.correct_regions?.[0]?.y || 0);
  const [regionRadius, setRegionRadius] = useState<number>(question?.correct_regions?.[0]?.radius || 50);
  const [tolerance, setTolerance] = useState<number>(question?.tolerance || 50);
  const [imagePreview, setImagePreview] = useState<string>("");

  // Auto-set media type to image for region_select and comparison
  useEffect(() => {
    if (type === "region_select" || type === "comparison") {
      setMediaType("image");
    }
  }, [type]);

  // Create preview URL when file is selected
  useEffect(() => {
    if (mediaFile && type === "region_select" && mediaFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(mediaFile);
    }
  }, [mediaFile, type]);

  const handleMediaUpload = async (file: File): Promise<string> => {
    const result = await uploadMedia(file, category, mediaType as "image" | "video", difficulty as "easy" | "medium" | "hard");
    return result.url;
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    
    setRegionX(x);
    setRegionY(y);
    toast.success(`좌표 설정: (${x}, ${y})`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mediaFile && !mediaUrl) {
      toast.error("미디어 파일을 선택해주세요");
      return;
    }

    if (!category || !difficulty) {
      toast.error("카테고리와 난이도를 선택해주세요");
      return;
    }

    setLoading(true);
    setUploading(true);
    
    try {
      // Upload media files first
      let finalMediaUrl = mediaUrl;
      let finalComparisonUrl = comparisonMediaUrl;

      if (mediaFile) {
        toast.info("메인 미디어 업로드 중...");
        finalMediaUrl = await handleMediaUpload(mediaFile);
      }

      if (type === "comparison" && comparisonFile) {
        toast.info("비교 미디어 업로드 중...");
        finalComparisonUrl = await handleMediaUpload(comparisonFile);
      }

      if (!finalMediaUrl) {
        toast.error("미디어 업로드 실패");
        return;
      }

      const data: CreateQuestionRequest = {
        type,
        media_type: mediaType,
        media_url: finalMediaUrl,
        thumbnail_emoji: "🎯",
        difficulty,
        category,
        explanation,
      };

      // Add type-specific fields
      if (type === "multiple_choice") {
        data.options = options.filter(o => o.trim() !== "");
        data.correct_index = correctIndex;
      } else if (type === "true_false") {
        data.correct_answer = correctAnswer;
      } else if (type === "comparison") {
        if (!finalComparisonUrl) {
          toast.error("비교 미디어를 선택해주세요");
          return;
        }
        data.comparison_media_url = finalComparisonUrl;
        data.correct_side = correctSide;
      } else if (type === "region_select") {
        if (regionX === 0 || regionY === 0) {
          toast.error("이미지에서 틀린 부분을 클릭해주세요");
          return;
        }
        data.correct_regions = [{ x: regionX, y: regionY, radius: regionRadius }];
        data.tolerance = tolerance;
      }

      if (question) {
        await updateQuestion(question.id, data);
        toast.success("문제가 수정되었습니다");
      } else {
        await createQuestion(data);
        toast.success("문제가 추가되었습니다");
      }
      
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      toast.error(question ? `문제 수정 실패: ${errorMessage}` : `문제 추가 실패: ${errorMessage}`);
      console.error("Submit error:", error);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Question Type */}
      <div className="space-y-2">
        <Label>문제 유형</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="multiple_choice">객관식</SelectItem>
            <SelectItem value="true_false">OX 퀴즈</SelectItem>
            <SelectItem value="region_select">틀린부분찾기</SelectItem>
            <SelectItem value="comparison">비교하기</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Media Type */}
      <div className="space-y-2">
        <Label>미디어 타입</Label>
        <Select 
          value={mediaType} 
          onValueChange={setMediaType}
          disabled={type === "region_select" || type === "comparison"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="image">이미지</SelectItem>
            {type !== "region_select" && type !== "comparison" && (
              <SelectItem value="video">비디오</SelectItem>
            )}
          </SelectContent>
        </Select>
        {(type === "region_select" || type === "comparison") && (
          <p className="text-xs text-gray-500">이 문제 유형은 이미지만 사용 가능합니다</p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label>카테고리</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai-generated-detection">AI 생성 이미지 탐지</SelectItem>
            <SelectItem value="video-synthesis-detection">영상 합성 탐지 (딥페이크)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Difficulty */}
      <div className="space-y-2">
        <Label>난이도</Label>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">쉬움</SelectItem>
            <SelectItem value="medium">보통</SelectItem>
            <SelectItem value="hard">어려움</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Media Upload */}
      <div className="space-y-2">
        <Label>메인 미디어</Label>
        <div className="flex gap-2">
          <Input
            type="file"
            accept={mediaType === "image" ? "image/*" : "video/*"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setMediaFile(file);
                setMediaUrl(""); // Clear existing URL
              }
            }}
            disabled={uploading}
          />
        </div>
        {(mediaFile || mediaUrl) && (
          <div className="text-sm text-green-600">✓ 파일 선택됨 (제출 시 업로드)</div>
        )}
      </div>

      {/* Comparison Media (for comparison type) */}
      {type === "comparison" && (
        <div className="space-y-2">
          <Label>비교 미디어</Label>
          <div className="flex gap-2">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setComparisonFile(file);
                  setComparisonMediaUrl(""); // Clear existing URL
                }
              }}
              disabled={uploading}
            />
          </div>
          {(comparisonFile || comparisonMediaUrl) && (
            <div className="text-sm text-green-600">✓ 파일 선택됨 (제출 시 업로드)</div>
          )}
          <div className="space-y-2 mt-4">
            <Label>정답 (어느 쪽이 가짜인가요?)</Label>
            <Select value={correctSide} onValueChange={setCorrectSide}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">왼쪽</SelectItem>
                <SelectItem value="right">오른쪽</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Multiple Choice Options */}
      {type === "multiple_choice" && (
        <div className="space-y-2">
          <Label>선택지 (최소 2개, 최대 4개)</Label>
          {options.map((option, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                value={option}
                onChange={(e) => {
                  const newOptions = [...options];
                  newOptions[index] = e.target.value;
                  setOptions(newOptions);
                }}
                placeholder={`선택지 ${index + 1}`}
                className="flex-1"
              />
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md hover:bg-gray-50">
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === index}
                  onChange={() => setCorrectIndex(index)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">정답</span>
              </label>
              {options.length > 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newOptions = options.filter((_, i) => i !== index);
                    setOptions(newOptions);
                    if (correctIndex === index) {
                      setCorrectIndex(0);
                    } else if (correctIndex > index) {
                      setCorrectIndex(correctIndex - 1);
                    }
                  }}
                >
                  삭제
                </Button>
              )}
            </div>
          ))}
          {options.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOptions([...options, ""])}
            >
              선택지 추가
            </Button>
          )}
        </div>
      )}

      {/* True/False Answer */}
      {type === "true_false" && (
        <div className="space-y-2">
          <Label>정답</Label>
          <Select value={correctAnswer ? "true" : "false"} onValueChange={(v) => setCorrectAnswer(v === "true")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">진짜 (O)</SelectItem>
              <SelectItem value="false">가짜 (X)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Region Select */}
      {type === "region_select" && imagePreview && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>틀린 부분을 클릭하세요</Label>
            <div className="relative inline-block border-2 border-gray-300 rounded-lg overflow-hidden">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-w-full h-auto cursor-crosshair"
                onClick={handleImageClick}
                style={{ maxHeight: "500px" }}
              />
              {regionX > 0 && regionY > 0 && (
                <div
                  className="absolute border-4 border-red-500 rounded-full pointer-events-none"
                  style={{
                    left: `${regionX}px`,
                    top: `${regionY}px`,
                    width: `${regionRadius * 2}px`,
                    height: `${regionRadius * 2}px`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(255, 0, 0, 0.1)",
                  }}
                />
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>X 좌표</Label>
              <Input
                type="number"
                value={regionX}
                onChange={(e) => setRegionX(Number(e.target.value))}
                placeholder="X"
              />
            </div>
            <div className="space-y-2">
              <Label>Y 좌표</Label>
              <Input
                type="number"
                value={regionY}
                onChange={(e) => setRegionY(Number(e.target.value))}
                placeholder="Y"
              />
            </div>
            <div className="space-y-2">
              <Label>반지름 (픽셀)</Label>
              <Input
                type="number"
                value={regionRadius}
                onChange={(e) => setRegionRadius(Number(e.target.value))}
                placeholder="50"
                min="10"
                max="200"
              />
            </div>
            <div className="space-y-2">
              <Label>허용 오차 (0.0 ~ 1.0)</Label>
              <Input
                type="number"
                step="1"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                placeholder="50"
                min="0"
                max="200"
              />
            </div>
          </div>
          
          {regionX > 0 && regionY > 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              <p>선택된 영역: ({regionX}, {regionY})</p>
              <p>반지름: {regionRadius}px</p>
              <p>허용 오차: {tolerance}px</p>
            </div>
          )}
        </div>
      )}

      {type === "region_select" && !imagePreview && !mediaFile && (
        <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
          이미지를 선택하면 클릭하여 좌표를 설정할 수 있습니다.
        </div>
      )}

      {/* Explanation */}
      <div className="space-y-2">
        <Label>설명</Label>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="문제에 대한 설명을 입력하세요"
          rows={4}
        />
      </div>

      {/* Submit Buttons */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {uploading ? "업로드 중..." : loading ? "저장 중..." : question ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  );
}
