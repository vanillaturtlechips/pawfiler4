import { useState, useEffect, useRef } from "react";
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
  const isEditMode = !!question;
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhancingOption, setEnhancingOption] = useState<number | null>(null);
  
  // Common fields (shared across all question types in multi-mode)
  const [mediaType, setMediaType] = useState<string>(question?.media_type || "image");
  const [mediaUrl, setMediaUrl] = useState<string>(question?.media_url || "");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [difficulty, setDifficulty] = useState<string>(question?.difficulty || "easy");
  const [category, setCategory] = useState<string>(question?.category || "ai-generated-detection");
  const [isDragging, setIsDragging] = useState(false);
  
  // Multi-question mode: activation toggles
  const [enableOX, setEnableOX] = useState(false);
  const [enableMultipleChoice, setEnableMultipleChoice] = useState(false);
  const [enableRegionSelect, setEnableRegionSelect] = useState(false);
  const [enableComparison, setEnableComparison] = useState(false);
  
  // Edit mode: single question type
  const [type, setType] = useState<string>(question?.type || "multiple_choice");
  
  // OX Quiz fields
  const [oxExplanation, setOxExplanation] = useState<string>(
    question?.type === "true_false" ? (question?.explanation || "") : ""
  );
  const [oxCorrectAnswer, setOxCorrectAnswer] = useState<boolean>(
    question?.type === "true_false" ? (question?.correct_answer || false) : false
  );
  
  // Multiple Choice fields
  const [mcExplanation, setMcExplanation] = useState<string>(
    question?.type === "multiple_choice" ? (question?.explanation || "") : ""
  );
  const [mcOptions, setMcOptions] = useState<string[]>(
    question?.type === "multiple_choice" ? (question?.options || ["", ""]) : ["", ""]
  );
  const [mcCorrectIndex, setMcCorrectIndex] = useState<number>(
    question?.type === "multiple_choice" ? (question?.correct_index || 0) : 0
  );
  
  // Region Select fields
  const [rsExplanation, setRsExplanation] = useState<string>(
    question?.type === "region_select" ? (question?.explanation || "") : ""
  );
  const [rsRegionX, setRsRegionX] = useState<number>(question?.correct_regions?.[0]?.x || 0);
  const [rsRegionY, setRsRegionY] = useState<number>(question?.correct_regions?.[0]?.y || 0);
  const [rsRegionRadius, setRsRegionRadius] = useState<number>(question?.correct_regions?.[0]?.radius || 50);
  const [rsTolerance, setRsTolerance] = useState<number>(question?.tolerance || 50);
  const [rsImagePreview, setRsImagePreview] = useState<string>("");
  const rsImgRef = useRef<HTMLImageElement>(null);
  
  // Comparison fields
  const [compExplanation, setCompExplanation] = useState<string>(
    question?.type === "comparison" ? (question?.explanation || "") : ""
  );
  const [comparisonMediaUrl, setComparisonMediaUrl] = useState<string>(question?.comparison_media_url || "");
  const [comparisonFile, setComparisonFile] = useState<File | null>(null);
  const [compCorrectSide, setCompCorrectSide] = useState<string>(question?.correct_side || "left");

  // Auto-set media type to image for region_select and comparison
  useEffect(() => {
    if (isEditMode) {
      if (type === "region_select" || type === "comparison") {
        setMediaType("image");
      }
    } else {
      // Multi-mode: if region select or comparison is enabled, force image
      if ((enableRegionSelect || enableComparison) && mediaType !== "image") {
        setMediaType("image");
      }
    }
  }, [type, enableRegionSelect, enableComparison, mediaType, isEditMode]);

  // Create preview URL when file is selected (for region select)
  useEffect(() => {
    if (mediaFile && mediaFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setRsImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(mediaFile);
    }
  }, [mediaFile]);

  // Handle paste event for image upload
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            setMediaFile(file);
            setMediaUrl("");
            toast.success("이미지가 붙여넣기되었습니다");
          }
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent, isComparison: boolean = false) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const expectedType = mediaType === "image" ? "image/" : "video/";

    if (!file.type.startsWith(expectedType)) {
      toast.error(`${mediaType === "image" ? "이미지" : "비디오"} 파일만 업로드 가능합니다`);
      return;
    }

    if (isComparison) {
      setComparisonFile(file);
      setComparisonMediaUrl("");
    } else {
      setMediaFile(file);
      setMediaUrl("");
    }
    
    toast.success("파일이 추가되었습니다");
  };

  const handleMediaUpload = async (file: File): Promise<string> => {
    const result = await uploadMedia(file, category, mediaType as "image" | "video", difficulty as "easy" | "medium" | "hard");
    return result.url;
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    // 원본 이미지 픽셀 기준으로 정규화 (display 크기와 무관하게 일관된 좌표)
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    setRsRegionX(x);
    setRsRegionY(y);
    toast.success(`좌표 설정: (${x}, ${y}) [원본 이미지 픽셀 기준]`);
  };

  const handleEnhanceExplanation = async (questionType: string, currentExplanation: string, setExplanation: (text: string) => void) => {
    if (!currentExplanation.trim()) {
      toast.error("먼저 간단한 설명을 입력해주세요");
      return;
    }

    setEnhancing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        toast.error("Gemini API 키가 설정되지 않았습니다");
        return;
      }

      const categoryText = category === "ai-generated-detection" 
        ? "AI 생성 이미지 탐지" 
        : "영상 합성 탐지 (딥페이크)";

      let prompt = "";

      // 문제 유형별로 다른 프롬프트 생성
      if (questionType === "true_false") {
        // OX 퀴즈: 정답에 따라 AI인 이유 또는 실제인 이유만
        const answerType = oxCorrectAnswer ? "실제" : "AI 생성";
        prompt = `당신은 딥페이크와 AI 생성 콘텐츠 탐지 교육 전문가입니다.

카테고리: ${categoryText}
난이도: ${difficulty === "easy" ? "쉬움" : difficulty === "medium" ? "보통" : "어려움"}
정답: ${answerType}

사용자 입력 키워드:
${currentExplanation}

이 이미지/영상이 ${answerType}인 이유를 1-2문장으로 설명해주세요.
- 일반 사용자도 이해할 수 있도록 쉽게 설명하세요
- 존댓말을 사용하세요
- 이모지는 사용하지 마세요
- 구체적인 특징을 언급하세요

설명만 출력하세요:`;
      } else if (questionType === "multiple_choice") {
        // 객관식: 정답 선택지에 대한 설명
        const correctOption = mcOptions[mcCorrectIndex] || "";
        prompt = `당신은 딥페이크와 AI 생성 콘텐츠 탐지 교육 전문가입니다.

카테고리: ${categoryText}
난이도: ${difficulty === "easy" ? "쉬움" : difficulty === "medium" ? "보통" : "어려움"}
정답 선택지: ${correctOption}

사용자 입력 키워드:
${currentExplanation}

정답 선택지("${correctOption}")가 왜 정답인지 1-2문장으로 설명해주세요.
- 일반 사용자도 이해할 수 있도록 쉽게 설명하세요
- 존댓말을 사용하세요
- 이모지는 사용하지 마세요
- 구체적인 특징을 언급하세요

설명만 출력하세요:`;
      } else if (questionType === "region_select") {
        // 틀린부분찾기: 입력한 이유를 튜닝
        prompt = `당신은 딥페이크와 AI 생성 콘텐츠 탐지 교육 전문가입니다.

카테고리: ${categoryText}
난이도: ${difficulty === "easy" ? "쉬움" : difficulty === "medium" ? "보통" : "어려움"}

사용자가 입력한 틀린 부분에 대한 설명:
${currentExplanation}

위 설명을 더 자세하고 교육적으로 개선해주세요.
- 왜 이 부분이 AI 생성의 증거인지 구체적으로 설명하세요
- 1-2문장으로 간결하게 작성하세요
- 일반 사용자도 이해할 수 있도록 쉽게 설명하세요
- 존댓말을 사용하세요
- 이모지는 사용하지 마세요

개선된 설명만 출력하세요:`;
      } else if (questionType === "comparison") {
        // 비교하기: AI 이미지에 대한 이유 설명
        const aiSide = compCorrectSide === "left" ? "왼쪽" : "오른쪽";
        prompt = `당신은 딥페이크와 AI 생성 콘텐츠 탐지 교육 전문가입니다.

카테고리: ${categoryText}
난이도: ${difficulty === "easy" ? "쉬움" : difficulty === "medium" ? "보통" : "어려움"}
AI 이미지 위치: ${aiSide}

사용자 입력 키워드:
${currentExplanation}

${aiSide} 이미지가 AI 생성물인 이유를 1-2문장으로 설명해주세요.
- 실제 이미지와 비교하여 어떤 차이가 있는지 구체적으로 설명하세요
- 일반 사용자도 이해할 수 있도록 쉽게 설명하세요
- 존댓말을 사용하세요
- 이모지는 사용하지 마세요

설명만 출력하세요:`;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("API 요청 한도 초과 (분당 15회 제한). 잠시 후 다시 시도해주세요.");
        }
        throw new Error("Gemini API 호출 실패");
      }

      const data = await response.json();
      const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (enhancedText) {
        setExplanation(enhancedText.trim());
        toast.success("설명이 개선되었습니다!");
      } else {
        toast.error("응답을 처리할 수 없습니다");
      }
    } catch (error) {
      console.error("Enhancement error:", error);
      const errorMessage = error instanceof Error ? error.message : "설명 개선 실패";
      toast.error(errorMessage);
    } finally {
      setEnhancing(false);
    }
  };

  const handleEnhanceOption = async (index: number) => {
    const optionText = mcOptions[index];
    if (!optionText.trim()) {
      toast.error("먼저 선택지를 입력해주세요");
      return;
    }

    setEnhancingOption(index);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        toast.error("Gemini API 키가 설정되지 않았습니다");
        return;
      }

      const prompt = `다음 객관식 선택지를 개선해주세요:

"${optionText}"

요구사항:
- 10-20자 이내
- ~워요 체 사용 (예: 자연스러워요, 어색해요)
- 이모지 금지
- 마침표 없이 출력
- 하나의 완성된 문장만 출력

답변:`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 800,
              candidateCount: 1,
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("API 요청 한도 초과 (분당 15회 제한). 잠시 후 다시 시도해주세요.");
        }
        throw new Error("Gemini API 호출 실패");
      }

      const data = await response.json();
      const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (enhancedText) {
        const newOptions = [...mcOptions];
        // 마침표 제거
        newOptions[index] = enhancedText.trim().replace(/\.$/, '');
        setMcOptions(newOptions);
        toast.success("선택지가 개선되었습니다!");
      } else {
        toast.error("응답을 처리할 수 없습니다");
      }
    } catch (error) {
      console.error("Enhancement error:", error);
      const errorMessage = error instanceof Error ? error.message : "선택지 개선 실패";
      toast.error(errorMessage);
    } finally {
      setEnhancingOption(null);
    }
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

      if (!finalMediaUrl) {
        toast.error("미디어 업로드 실패");
        return;
      }

      // Edit mode: update single question
      if (isEditMode) {
        const data: CreateQuestionRequest = {
          type,
          media_type: mediaType,
          media_url: finalMediaUrl,
          thumbnail_emoji: "🎯",
          difficulty,
          category,
          explanation: mcExplanation,
        };

        // Add type-specific fields
        if (type === "multiple_choice") {
          data.options = mcOptions.filter(o => o.trim() !== "");
          data.correct_index = mcCorrectIndex;
        } else if (type === "true_false") {
          data.correct_answer = oxCorrectAnswer;
          data.explanation = oxExplanation;
        } else if (type === "comparison") {
          if (comparisonFile) {
            toast.info("비교 미디어 업로드 중...");
            finalComparisonUrl = await handleMediaUpload(comparisonFile);
          }
          if (!finalComparisonUrl) {
            toast.error("비교 미디어를 선택해주세요");
            return;
          }
          data.comparison_media_url = finalComparisonUrl;
          data.correct_side = compCorrectSide;
          data.explanation = compExplanation;
        } else if (type === "region_select") {
          if (rsRegionX === 0 || rsRegionY === 0) {
            toast.error("이미지에서 틀린 부분을 클릭해주세요");
            return;
          }
          data.correct_regions = [{ x: rsRegionX, y: rsRegionY, radius: rsRegionRadius }];
          data.tolerance = rsTolerance;
          data.explanation = rsExplanation;
        }

        await updateQuestion(question!.id, data);
        toast.success("문제가 수정되었습니다");
        onClose();
        return;
      }

      // Create mode: create multiple questions based on enabled types
      const questionsToCreate: Array<{ type: string; data: CreateQuestionRequest }> = [];

      // OX Quiz
      if (enableOX) {
        if (!oxExplanation.trim()) {
          toast.error("OX 퀴즈 설명을 입력해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        questionsToCreate.push({
          type: "OX 퀴즈",
          data: {
            type: "true_false",
            media_type: mediaType,
            media_url: finalMediaUrl,
            thumbnail_emoji: "🎯",
            difficulty,
            category,
            explanation: oxExplanation,
            correct_answer: oxCorrectAnswer,
          },
        });
      }

      // Multiple Choice
      if (enableMultipleChoice) {
        const validOptions = mcOptions.filter(o => o.trim() !== "");
        if (validOptions.length < 2) {
          toast.error("객관식 선택지를 최소 2개 입력해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        if (!mcExplanation.trim()) {
          toast.error("객관식 설명을 입력해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        questionsToCreate.push({
          type: "객관식",
          data: {
            type: "multiple_choice",
            media_type: mediaType,
            media_url: finalMediaUrl,
            thumbnail_emoji: "🎯",
            difficulty,
            category,
            explanation: mcExplanation,
            options: validOptions,
            correct_index: mcCorrectIndex,
          },
        });
      }

      // Region Select
      if (enableRegionSelect) {
        if (mediaType !== "image") {
          toast.error("틀린부분찾기는 이미지만 가능합니다");
          setLoading(false);
          setUploading(false);
          return;
        }
        if (rsRegionX === 0 || rsRegionY === 0) {
          toast.error("틀린부분찾기: 이미지에서 틀린 부분을 클릭해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        if (!rsExplanation.trim()) {
          toast.error("틀린부분찾기 설명을 입력해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        questionsToCreate.push({
          type: "틀린부분찾기",
          data: {
            type: "region_select",
            media_type: "image",
            media_url: finalMediaUrl,
            thumbnail_emoji: "🎯",
            difficulty,
            category,
            explanation: rsExplanation,
            correct_regions: [{ x: rsRegionX, y: rsRegionY, radius: rsRegionRadius }],
            tolerance: rsTolerance,
          },
        });
      }

      // Comparison
      if (enableComparison) {
        if (mediaType !== "image") {
          toast.error("비교하기는 이미지만 가능합니다");
          setLoading(false);
          setUploading(false);
          return;
        }
        if (!comparisonFile && !comparisonMediaUrl) {
          toast.error("비교하기: 비교 미디어를 선택해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }
        if (!compExplanation.trim()) {
          toast.error("비교하기 설명을 입력해주세요");
          setLoading(false);
          setUploading(false);
          return;
        }

        // Upload comparison media if needed
        if (comparisonFile) {
          toast.info("비교 미디어 업로드 중...");
          finalComparisonUrl = await handleMediaUpload(comparisonFile);
        }

        questionsToCreate.push({
          type: "비교하기",
          data: {
            type: "comparison",
            media_type: "image",
            media_url: finalMediaUrl,
            thumbnail_emoji: "🎯",
            difficulty,
            category,
            explanation: compExplanation,
            comparison_media_url: finalComparisonUrl,
            correct_side: compCorrectSide,
          },
        });
      }

      if (questionsToCreate.length === 0) {
        toast.error("최소 하나의 문제 유형을 활성화해주세요");
        setLoading(false);
        setUploading(false);
        return;
      }

      // Create all questions sequentially
      let successCount = 0;
      for (const { type: qType, data } of questionsToCreate) {
        try {
          await createQuestion(data);
          successCount++;
          toast.success(`${qType} 문제 생성 완료 (${successCount}/${questionsToCreate.length})`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
          toast.error(`${qType} 문제 생성 실패: ${errorMessage}`);
          console.error(`Failed to create ${qType}:`, error);
        }
      }

      if (successCount > 0) {
        toast.success(`총 ${successCount}개 문제가 생성되었습니다!`);
        onClose();
      } else {
        toast.error("모든 문제 생성에 실패했습니다");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      toast.error(`문제 생성 실패: ${errorMessage}`);
      console.error("Submit error:", error);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Question Type - Edit mode only */}
      {isEditMode && (
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
      )}

      {/* Multi-question toggles - Create mode only */}
      {!isEditMode && (
        <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">생성할 문제 유형 선택</Label>
            <span className="text-xs text-gray-600">여러 개 선택 가능</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={enableOX}
                onChange={(e) => setEnableOX(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-medium">OX 퀴즈</span>
            </label>
            
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={enableMultipleChoice}
                onChange={(e) => setEnableMultipleChoice(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-medium">객관식</span>
            </label>
            
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={enableRegionSelect}
                onChange={(e) => setEnableRegionSelect(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-medium">틀린부분찾기</span>
            </label>
            
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-white transition-colors">
              <input
                type="checkbox"
                checked={enableComparison}
                onChange={(e) => setEnableComparison(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-medium">비교하기</span>
            </label>
          </div>
          
          {(enableRegionSelect || enableComparison) && mediaType !== "image" && (
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ 틀린부분찾기와 비교하기는 이미지만 가능합니다. 미디어 타입이 자동으로 이미지로 변경됩니다.
            </p>
          )}
        </div>
      )}

      {/* Media Type */}
      <div className="space-y-2">
        <Label>미디어 타입</Label>
        <Select 
          value={mediaType} 
          onValueChange={setMediaType}
          disabled={isEditMode ? (type === "region_select" || type === "comparison") : (enableRegionSelect || enableComparison)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="image">이미지</SelectItem>
            {(isEditMode ? (type !== "region_select" && type !== "comparison") : (!enableRegionSelect && !enableComparison)) && (
              <SelectItem value="video">비디오</SelectItem>
            )}
          </SelectContent>
        </Select>
        {((isEditMode && (type === "region_select" || type === "comparison")) || (!isEditMode && (enableRegionSelect || enableComparison))) && (
          <p className="text-xs text-gray-500">틀린부분찾기와 비교하기는 이미지만 사용 가능합니다</p>
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
        {(mediaFile || mediaUrl) ? (
          <div className="border-2 border-green-500 bg-green-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-xl">
                  ✓
                </div>
                <div>
                  <div className="font-medium text-green-900">
                    {mediaFile?.name || "파일 선택됨"}
                  </div>
                  <div className="text-sm text-green-700">
                    제출 시 업로드됩니다
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMediaFile(null);
                  setMediaUrl("");
                }}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                변경
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, false)}
          >
            <div className="text-center space-y-2">
              <div className="text-sm text-gray-600">
                파일을 드래그하거나 Ctrl+V로 붙여넣기, 또는 클릭하여 선택
              </div>
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
                className="cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Comparison Media (for comparison type) */}
      {type === "comparison" && (
        <div className="space-y-2">
          <Label>비교 미디어</Label>
          {(comparisonFile || comparisonMediaUrl) ? (
            <div className="border-2 border-green-500 bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-xl">
                    ✓
                  </div>
                  <div>
                    <div className="font-medium text-green-900">
                      {comparisonFile?.name || "파일 선택됨"}
                    </div>
                    <div className="text-sm text-green-700">
                      제출 시 업로드됩니다
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setComparisonFile(null);
                    setComparisonMediaUrl("");
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  변경
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, true)}
            >
              <div className="text-center space-y-2">
                <div className="text-sm text-gray-600">
                  파일을 드래그하거나 클릭하여 선택
                </div>
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
                  className="cursor-pointer"
                />
              </div>
            </div>
          )}
          <div className="space-y-2 mt-4">
            <Label>정답 (어느 쪽이 가짜인가요?)</Label>
            <Select value={compCorrectSide} onValueChange={setCompCorrectSide}>
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
      {((isEditMode && type === "multiple_choice") || (!isEditMode && enableMultipleChoice)) && (
        <div className="space-y-2">
          {!isEditMode && <Label className="text-lg font-semibold text-blue-600">📝 객관식 문제</Label>}
          <Label>선택지 (최소 2개, 최대 4개)</Label>
          {mcOptions.map((option, index) => (
            <div key={index} className="flex gap-2 items-center">
              <div className="flex-1 flex gap-2">
                <Input
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...mcOptions];
                    newOptions[index] = e.target.value;
                    setMcOptions(newOptions);
                  }}
                  placeholder={`선택지 ${index + 1}`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleEnhanceOption(index)}
                  disabled={enhancingOption === index || !option.trim()}
                  className="whitespace-nowrap"
                >
                  {enhancingOption === index ? "개선 중..." : "✨ AI 개선"}
                </Button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md hover:bg-gray-50">
                <input
                  type="radio"
                  name="mcCorrect"
                  checked={mcCorrectIndex === index}
                  onChange={() => setMcCorrectIndex(index)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">정답</span>
              </label>
              {mcOptions.length > 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newOptions = mcOptions.filter((_, i) => i !== index);
                    setMcOptions(newOptions);
                    if (mcCorrectIndex === index) {
                      setMcCorrectIndex(0);
                    } else if (mcCorrectIndex > index) {
                      setMcCorrectIndex(mcCorrectIndex - 1);
                    }
                  }}
                >
                  삭제
                </Button>
              )}
            </div>
          ))}
          {mcOptions.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMcOptions([...mcOptions, ""])}
            >
              선택지 추가
            </Button>
          )}
          
          {/* MC Explanation */}
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <Label>설명</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEnhanceExplanation("multiple_choice", mcExplanation, setMcExplanation)}
                disabled={enhancing || !mcExplanation.trim()}
                className="text-xs"
              >
                {enhancing ? "개선 중..." : "✨ AI로 설명 개선"}
              </Button>
            </div>
            <Textarea
              value={mcExplanation}
              onChange={(e) => setMcExplanation(e.target.value)}
              placeholder="정답에 대한 간단한 설명을 입력하세요"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* True/False Answer */}
      {((isEditMode && type === "true_false") || (!isEditMode && enableOX)) && (
        <div className="space-y-2">
          {!isEditMode && <Label className="text-lg font-semibold text-blue-600">⭕ OX 퀴즈</Label>}
          <Label>정답</Label>
          <Select value={oxCorrectAnswer ? "true" : "false"} onValueChange={(v) => setOxCorrectAnswer(v === "true")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">진짜 (O)</SelectItem>
              <SelectItem value="false">가짜 (X)</SelectItem>
            </SelectContent>
          </Select>
          
          {/* OX Explanation */}
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <Label>설명</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEnhanceExplanation("true_false", oxExplanation, setOxExplanation)}
                disabled={enhancing || !oxExplanation.trim()}
                className="text-xs"
              >
                {enhancing ? "개선 중..." : "✨ AI로 설명 개선"}
              </Button>
            </div>
            <Textarea
              value={oxExplanation}
              onChange={(e) => setOxExplanation(e.target.value)}
              placeholder="정답에 대한 간단한 설명을 입력하세요"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Region Select */}
      {((isEditMode && type === "region_select") || (!isEditMode && enableRegionSelect)) && rsImagePreview && (
        <div className="space-y-4">
          {!isEditMode && <Label className="text-lg font-semibold text-blue-600">🔍 틀린부분찾기</Label>}
          <div className="space-y-2">
            <Label>틀린 부분을 클릭하세요</Label>
            <div className="relative inline-block border-2 border-gray-300 rounded-lg overflow-hidden">
              <img
                ref={rsImgRef}
                src={rsImagePreview}
                alt="Preview"
                className="max-w-full h-auto cursor-crosshair"
                onClick={handleImageClick}
                style={{ maxHeight: "500px" }}
              />
              {rsRegionX > 0 && rsRegionY > 0 && (() => {
                const img = rsImgRef.current;
                if (!img || !img.naturalWidth) return null;
                // natural pixels → display CSS pixels
                const dX = (rsRegionX / img.naturalWidth) * img.offsetWidth;
                const dY = (rsRegionY / img.naturalHeight) * img.offsetHeight;
                const dR = (rsRegionRadius / img.naturalWidth) * img.offsetWidth;
                return (
                  <div
                    className="absolute border-4 border-red-500 rounded-full pointer-events-none"
                    style={{
                      left: `${dX}px`,
                      top: `${dY}px`,
                      width: `${dR * 2}px`,
                      height: `${dR * 2}px`,
                      transform: "translate(-50%, -50%)",
                      backgroundColor: "rgba(255, 0, 0, 0.1)",
                    }}
                  />
                );
              })()}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>X 좌표</Label>
              <Input
                type="number"
                value={rsRegionX}
                onChange={(e) => setRsRegionX(Number(e.target.value))}
                placeholder="X"
              />
            </div>
            <div className="space-y-2">
              <Label>Y 좌표</Label>
              <Input
                type="number"
                value={rsRegionY}
                onChange={(e) => setRsRegionY(Number(e.target.value))}
                placeholder="Y"
              />
            </div>
            <div className="space-y-2">
              <Label>반지름 (원본 이미지 픽셀)</Label>
              <Input
                type="number"
                value={rsRegionRadius}
                onChange={(e) => setRsRegionRadius(Number(e.target.value))}
                placeholder="200"
                min="50"
                max="2000"
              />
            </div>
            <div className="space-y-2">
              <Label>허용 오차 (원본 이미지 픽셀)</Label>
              <Input
                type="number"
                step="1"
                value={rsTolerance}
                onChange={(e) => setRsTolerance(Number(e.target.value))}
                placeholder="200"
                min="0"
                max="2000"
              />
            </div>
          </div>
          
          {rsRegionX > 0 && rsRegionY > 0 && (
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              <p>선택된 영역: ({rsRegionX}, {rsRegionY})</p>
              <p>반지름: {rsRegionRadius}px</p>
              <p>허용 오차: {rsTolerance}px</p>
            </div>
          )}
          
          {/* RS Explanation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>설명</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEnhanceExplanation("region_select", rsExplanation, setRsExplanation)}
                disabled={enhancing || !rsExplanation.trim()}
                className="text-xs"
              >
                {enhancing ? "개선 중..." : "✨ AI로 설명 개선"}
              </Button>
            </div>
            <Textarea
              value={rsExplanation}
              onChange={(e) => setRsExplanation(e.target.value)}
              placeholder="틀린 부분에 대한 간단한 설명을 입력하세요"
              rows={3}
            />
          </div>
        </div>
      )}

      {((isEditMode && type === "region_select") || (!isEditMode && enableRegionSelect)) && !rsImagePreview && !mediaFile && (
        <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
          이미지를 선택하면 클릭하여 좌표를 설정할 수 있습니다.
        </div>
      )}

      {/* Comparison */}
      {((isEditMode && type === "comparison") || (!isEditMode && enableComparison)) && (
        <div className="space-y-4">
          {!isEditMode && <Label className="text-lg font-semibold text-blue-600">🔄 비교하기</Label>}
          <div className="space-y-2">
            <Label>정답 (어느 쪽이 가짜인가요?)</Label>
            <Select value={compCorrectSide} onValueChange={setCompCorrectSide}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">왼쪽</SelectItem>
                <SelectItem value="right">오른쪽</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Comp Explanation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>설명</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEnhanceExplanation("comparison", compExplanation, setCompExplanation)}
                disabled={enhancing || !compExplanation.trim()}
                className="text-xs"
              >
                {enhancing ? "개선 중..." : "✨ AI로 설명 개선"}
              </Button>
            </div>
            <Textarea
              value={compExplanation}
              onChange={(e) => setCompExplanation(e.target.value)}
              placeholder="AI 이미지에 대한 간단한 설명을 입력하세요"
              rows={3}
            />
          </div>
        </div>
      )}

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
