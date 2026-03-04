import { useState, useEffect } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listQuestions, deleteQuestion, type Question } from "@/lib/adminApi";
import QuestionForm from "@/components/admin/QuestionForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function QuizManagePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  
  // Filter states
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    loadQuestions();
  }, [page, filterType, filterDifficulty, filterCategory, searchQuery]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const data = await listQuestions(page, 20);
      let filtered = data.questions || [];
      
      // Apply filters
      if (filterType !== "all") {
        filtered = filtered.filter(q => q.type === filterType);
      }
      if (filterDifficulty !== "all") {
        filtered = filtered.filter(q => q.difficulty === filterDifficulty);
      }
      if (filterCategory !== "all") {
        filtered = filtered.filter(q => q.category === filterCategory);
      }
      if (searchQuery) {
        filtered = filtered.filter(q => 
          q.explanation.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      
      setQuestions(filtered);
      setTotal(filtered.length);
    } catch (error) {
      toast.error("문제 목록을 불러오는데 실패했습니다");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;

    try {
      await deleteQuestion(id);
      toast.success("문제가 삭제되었습니다");
      loadQuestions();
    } catch (error) {
      toast.error("문제 삭제에 실패했습니다");
      console.error(error);
    }
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingQuestion(null);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingQuestion(null);
    loadQuestions();
  };

  const getDifficultyBadge = (difficulty: string) => {
    const colors = {
      easy: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      hard: "bg-red-100 text-red-800",
    };
    return colors[difficulty as keyof typeof colors] || colors.easy;
  };

  const getTypeBadge = (type: string) => {
    const labels = {
      multiple_choice: "객관식",
      true_false: "OX",
      region_select: "틀린부분찾기",
      comparison: "비교하기",
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getCategoryLabel = (category: string) => {
    const labels = {
      "ai-generated-detection": "AI 생성 이미지",
      "video-synthesis-detection": "영상 합성 (딥페이크)",
      "deepfake-detection": "딥페이크",
    };
    return labels[category as keyof typeof labels] || category;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">퀴즈 관리</h1>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          문제 추가
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-sm font-medium mb-2 block">검색</label>
          <Input
            placeholder="설명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">유형</label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="multiple_choice">객관식</SelectItem>
              <SelectItem value="true_false">OX</SelectItem>
              <SelectItem value="region_select">틀린부분찾기</SelectItem>
              <SelectItem value="comparison">비교하기</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">난이도</label>
          <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="easy">쉬움</SelectItem>
              <SelectItem value="medium">보통</SelectItem>
              <SelectItem value="hard">어려움</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">카테고리</label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="ai-generated-detection">AI 생성 이미지</SelectItem>
              <SelectItem value="video-synthesis-detection">영상 합성 (딥페이크)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">로딩 중...</div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>유형</TableHead>
                  <TableHead>미디어</TableHead>
                  <TableHead>난이도</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((question) => (
                  <TableRow key={question.id}>
                    <TableCell>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                        {getTypeBadge(question.type)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">
                        {question.media_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-sm ${getDifficultyBadge(question.difficulty)}`}>
                        {question.difficulty}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{getCategoryLabel(question.category)}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {question.explanation}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(question)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(question.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              총 {total}개 문제
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                이전
              </Button>
              <Button
                variant="outline"
                disabled={page * 20 >= total}
                onClick={() => setPage(page + 1)}
              >
                다음
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? "문제 수정" : "문제 추가"}
            </DialogTitle>
          </DialogHeader>
          <QuestionForm
            question={editingQuestion}
            onClose={handleFormClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
