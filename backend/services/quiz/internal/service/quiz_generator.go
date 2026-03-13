package service

import (
	"context"
	"fmt"
	"math/rand"
)

// QuizGenerator AI 모델 기반 퀴즈 자동 생성
type QuizGenerator struct {
	// TODO: 벡터 DB 클라이언트 추가
	// vectorDB *VectorDBClient
}

// AIModelQuizTemplate AI 모델 식별 퀴즈 템플릿
type AIModelQuizTemplate struct {
	AIModel     string   // "Sora", "Runway", etc.
	VideoURL    string   // S3 URL
	Options     []string // 선택지
	Explanation string   // 설명
}

// GenerateAIModelQuiz AI 모델 식별 퀴즈 생성
func (g *QuizGenerator) GenerateAIModelQuiz(ctx context.Context, aiModel string) (*AIModelQuizTemplate, error) {
	// TODO: 벡터 DB에서 해당 AI 모델 샘플 가져오기
	// sample := g.vectorDB.GetRandomSample(aiModel)
	
	// 임시 구현
	options := []string{
		aiModel,
		g.getRandomOtherModel(aiModel),
		g.getRandomOtherModel(aiModel),
		"실제 영상",
	}
	
	// 셔플
	rand.Shuffle(len(options), func(i, j int) {
		options[i], options[j] = options[j], options[i]
	})
	
	return &AIModelQuizTemplate{
		AIModel:     aiModel,
		VideoURL:    fmt.Sprintf("https://cdn.pawfiler.com/quiz/%s/sample.mp4", aiModel),
		Options:     options,
		Explanation: g.generateExplanation(aiModel),
	}, nil
}

// getRandomOtherModel 다른 AI 모델 랜덤 선택
func (g *QuizGenerator) getRandomOtherModel(exclude string) string {
	models := []string{
		"Sora", "Runway", "Pika", "Stable_Video_Diffusion",
		"AnimateDiff", "CogVideo", "ModelScope", "VideoCrafter",
	}
	
	var candidates []string
	for _, m := range models {
		if m != exclude {
			candidates = append(candidates, m)
		}
	}
	
	return candidates[rand.Intn(len(candidates))]
}

// generateExplanation AI 모델별 특징 설명 생성
func (g *QuizGenerator) generateExplanation(aiModel string) string {
	explanations := map[string]string{
		"Sora": "Sora의 특징: 높은 시간적 일관성, 자연스러운 모션, 물리 법칙 준수. " +
			"하지만 작은 객체의 디테일이나 복잡한 상호작용에서 어색함이 나타날 수 있습니다.",
		"Runway": "Runway Gen-2의 특징: 빠른 생성 속도, 스타일 일관성. " +
			"배경과 전경의 경계가 부자연스럽거나 텍스처가 반복되는 패턴이 보일 수 있습니다.",
		"Pika": "Pika의 특징: 짧은 클립 생성에 특화, 애니메이션 스타일 지원. " +
			"프레임 간 전환이 급격하거나 객체가 갑자기 변형되는 경우가 있습니다.",
	}
	
	if exp, ok := explanations[aiModel]; ok {
		return exp
	}
	
	return fmt.Sprintf("%s로 생성된 영상입니다.", aiModel)
}

// TrendAnalyzer 트렌드 분석기
type TrendAnalyzer struct {
	// TODO: 벡터 DB 클라이언트
}

// AnalyzeTrend 최근 업로드된 영상의 AI 모델 분포 분석
func (t *TrendAnalyzer) AnalyzeTrend(ctx context.Context, days int) (*TrendReport, error) {
	// TODO: 벡터 DB에서 최근 N일 분석 결과 집계
	// results := t.vectorDB.GetRecentAnalysis(days)
	
	return &TrendReport{
		Period: fmt.Sprintf("최근 %d일", days),
		ModelDistribution: map[string]int{
			"Sora":   120,
			"Runway": 85,
			"Pika":   45,
		},
		TrendingModels: []string{"Sora", "Runway"},
		Insights: []string{
			"Sora 사용이 지난주 대비 30% 증가했습니다",
			"Runway Gen-3가 새롭게 등장했습니다",
		},
	}, nil
}

// TrendReport 트렌드 리포트
type TrendReport struct {
	Period            string
	ModelDistribution map[string]int
	TrendingModels    []string
	Insights          []string
}

// PersonalizedLearningPath 개인화 학습 경로 추천
type PersonalizedLearningPath struct {
	// TODO: 벡터 DB 클라이언트
}

// RecommendQuizzes 사용자 약점 기반 퀴즈 추천
func (p *PersonalizedLearningPath) RecommendQuizzes(ctx context.Context, userID string) ([]string, error) {
	// TODO: 
	// 1. 사용자 학습 프로필 벡터 가져오기
	// 2. 유사한 약점을 가진 사용자들의 학습 경로 검색
	// 3. 효과적이었던 퀴즈 추천
	
	return []string{
		"sora_detection_basic",
		"runway_vs_pika",
		"voice_synthesis_advanced",
	}, nil
}
