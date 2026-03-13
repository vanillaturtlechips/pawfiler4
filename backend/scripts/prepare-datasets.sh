#!/bin/bash
# PawFiler 데이터셋 준비 스크립트
# 집에서 전처리 전에 데이터셋 다운로드 및 구조 확인

set -e

DATASET_DIR="./datasets"
mkdir -p "$DATASET_DIR"

echo "🚀 PawFiler 데이터셋 준비 시작..."

# 1. AIGVDBench (AI Generated Video Detection Benchmark)
echo ""
echo "📦 1. AIGVDBench 준비..."
echo "   - 23개 AI 모델 라벨링 데이터셋"
echo "   - Sora, Runway, Pika, Stable Video Diffusion 등"
echo ""
echo "   다운로드 방법:"
echo "   1) 논문: https://arxiv.org/abs/2406.xxxxx (검색 필요)"
echo "   2) GitHub: https://github.com/... (검색 필요)"
echo "   3) Hugging Face: https://huggingface.co/datasets/..."
echo ""
echo "   저장 위치: $DATASET_DIR/AIGVDBench/"
echo "   예상 구조:"
echo "     AIGVDBench/"
echo "       ├── sora/"
echo "       ├── runway/"
echo "       ├── pika/"
echo "       ├── labels.csv"
echo "       └── metadata.json"

# 2. Celeb-DF (v2)
echo ""
echo "📦 2. Celeb-DF v2 준비..."
echo "   - 고품질 딥페이크 (얼굴 합성)"
echo ""
echo "   다운로드 방법:"
echo "   1) 공식 사이트: https://github.com/yuezunli/celeb-deepfakeforensics"
echo "   2) 신청서 작성 후 다운로드 링크 수령"
echo ""
echo "   저장 위치: $DATASET_DIR/Celeb-DF/"
echo "   예상 구조:"
echo "     Celeb-DF/"
echo "       ├── Celeb-real/"
echo "       ├── Celeb-synthesis/"
echo "       ├── YouTube-real/"
echo "       └── List_of_testing_videos.txt"

# 3. WildDeepfake
echo ""
echo "📦 3. WildDeepfake 준비..."
echo "   - 실제 인터넷 수집 딥페이크"
echo ""
echo "   다운로드 방법:"
echo "   1) GitHub: https://github.com/deepfakeinthewild/deepfake-in-the-wild"
echo "   2) Google Drive 링크"
echo ""
echo "   저장 위치: $DATASET_DIR/WildDeepfake/"
echo "   예상 구조:"
echo "     WildDeepfake/"
echo "       ├── real/"
echo "       ├── fake/"
echo "       └── labels.json"

# 4. MLAAD (Multi-Level Audio-visual Anti-spoofing Dataset)
echo ""
echo "📦 4. MLAAD 준비..."
echo "   - 오디오-비주얼 멀티모달"
echo ""
echo "   다운로드 방법:"
echo "   1) 논문: https://arxiv.org/abs/... (검색 필요)"
echo "   2) 공식 사이트에서 신청"
echo ""
echo "   저장 위치: $DATASET_DIR/MLAAD/"
echo "   예상 구조:"
echo "     MLAAD/"
echo "       ├── videos/"
echo "       ├── audios/"
echo "       └── annotations.csv"

# 데이터셋 체크리스트 생성
cat > "$DATASET_DIR/CHECKLIST.md" << 'EOF'
# 데이터셋 다운로드 체크리스트

## 필수 데이터셋

- [ ] **AIGVDBench** (23개 AI 모델)
  - 용도: AI 모델 분류 학습
  - 우선순위: ⭐⭐⭐⭐⭐
  - 크기: ~100GB (예상)

- [ ] **Celeb-DF v2** (고품질 딥페이크)
  - 용도: 기본 탐지 능력 학습
  - 우선순위: ⭐⭐⭐⭐⭐
  - 크기: ~5GB

- [ ] **WildDeepfake** (실전 데이터)
  - 용도: 실제 환경 적응
  - 우선순위: ⭐⭐⭐⭐
  - 크기: ~10GB

- [ ] **MLAAD** (멀티모달)
  - 용도: 오디오-비주얼 학습
  - 우선순위: ⭐⭐⭐
  - 크기: ~20GB

## 다운로드 후 확인사항

1. 파일 무결성 확인 (MD5/SHA256)
2. 압축 해제
3. 디렉토리 구조 확인
4. 라벨 파일 존재 확인
5. 샘플 영상 재생 테스트

## 예상 총 용량

약 135GB (여유 공간 200GB 권장)
EOF

echo ""
echo "✅ 데이터셋 준비 가이드 생성 완료!"
echo "📄 체크리스트: $DATASET_DIR/CHECKLIST.md"
echo ""
echo "💡 다음 단계:"
echo "   1. 각 데이터셋 공식 사이트 방문"
echo "   2. 다운로드 신청 (필요 시)"
echo "   3. $DATASET_DIR 에 저장"
echo "   4. CHECKLIST.md 확인"
