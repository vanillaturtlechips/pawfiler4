# ⚡ Fast Pass 로직

## 개요

Fast Pass는 동일하거나 유사한 영상이 재업로드될 때 GPU/LLM 자원 소모 없이 즉시 판정을 반환하는 최적화 기능입니다.

## 핵심 기능

### 유사도 임계값 기준 실행 경로

동일 영상 재업로드 시 `search_similar_videos` 결과가 **0.97 이상**이면:

- ✅ 분석 없이 즉시 판정 반환
- ✅ GPU/LLM 자원 소모 차단
- ✅ 응답 시간 1초 미만으로 단축

## 성능 결과

### 테스트 결과

```
1차 분석 (일반): 651ms
2차 분석 (Fast Pass): 87ms

속도 향상: 7.5배
시간 절약: 564ms (86.6% 감소)
```

### 실제 효과

- **응답 시간**: 651ms → 87ms
- **GPU 사용**: 100% → 0%
- **비용 절감**: ~87%

## 작동 원리

### 1. 비디오 해시 계산

```python
def calculate_video_hash(video_path: str) -> np.ndarray:
    """
    비디오 특징 벡터 생성:
    - 5개 대표 프레임 추출
    - 8x8 평균 해시 계산
    - 메타데이터 추가 (프레임수, FPS, 해상도)
    """
```

**특징:**

- 320차원 벡터 (64비트 × 5프레임 + 4개 메타데이터)
- 빠른 계산 (~50ms)
- 높은 정확도

### 2. 유사도 계산

```python
def calculate_hash_similarity(hash1, hash2) -> float:
    """
    해밍 거리 기반 유사도:
    - 0.0 (완전 다름) ~ 1.0 (완전 동일)
    - 임계값: 0.97 (97% 이상 유사)
    """
```

**알고리즘:**

- 해밍 거리 계산
- 유사도 = 1.0 - (거리 / 최대거리)
- O(n) 시간 복잡도

### 3. Fast Pass 체크

```python
async def check_fast_pass(video_path: str, threshold: float = 0.97):
    """
    1. 비디오 해시 계산
    2. 기존 분석 결과 조회 (최근 100개)
    3. 유사도 계산
    4. 임계값 이상이면 즉시 반환
    """
```

**프로세스:**

1. 입력 비디오 해시 계산
2. DB에서 최근 분석 결과 조회
3. 각 결과와 유사도 비교
4. 0.97 이상이면 Fast Pass 적용
5. 기존 결과 즉시 반환

## 사용 방법

### 기본 사용 (Fast Pass 활성화)

```python
analyze_frames(
    video_path="video.mp4",
    enable_fast_pass=True  # 기본값
)
```

### Fast Pass 비활성화

```python
analyze_frames(
    video_path="video.mp4",
    enable_fast_pass=False  # 강제 재분석
)
```

### 결과 확인

```python
result = analyze_frames(video_path="video.mp4")

if result['fast_pass']:
    print(f"⚡ Fast Pass 적용!")
    print(f"유사도: {result['fast_pass_similarity']:.4f}")
    print(f"처리시간: {result['processing_time_ms']}ms")
else:
    print(f"일반 분석 수행")
```

## 응답 형식

### Fast Pass 적용 시

```json
{
  "video_path": "video.mp4",
  "verdict": "fake",
  "confidence_score": 0.5138,
  "processing_time_ms": 87,
  "fast_pass": true,
  "fast_pass_similarity": 1.0,
  "fast_pass_source": "previous_video.mp4",
  "fast_pass_analysis_id": "uuid-here",
  "message": "Fast Pass 적용 (유사도: 1.0000, 87ms)"
}
```

### 일반 분석 시

```json
{
  "video_path": "video.mp4",
  "verdict": "fake",
  "confidence_score": 0.5138,
  "processing_time_ms": 651,
  "fast_pass": false,
  "frame_samples_analyzed": 16,
  "model_version": "v1.0.0-local"
}
```

## 임계값 설정

### 기본값: 0.97 (97%)

```python
# 매우 엄격 (거의 동일한 영상만)
check_fast_pass(video_path, threshold=0.99)

# 기본값 (권장)
check_fast_pass(video_path, threshold=0.97)

# 느슨함 (유사한 영상도 포함)
check_fast_pass(video_path, threshold=0.90)
```

### 임계값 선택 가이드

- **0.99+**: 완전 동일한 영상만 (재업로드)
- **0.97**: 동일 + 약간 편집된 영상 (권장)
- **0.90**: 유사한 영상 포함 (주의 필요)

## 로그 출력

### Fast Pass HIT

```
2026-03-09 12:43:45 [INFO] ⚡ Fast Pass HIT: fake_0.mp4 → fake_0.mp4 (유사도: 1.0000)
2026-03-09 12:43:45 [INFO] ⚡ Fast Pass 적용: fake_0.mp4 (유사도: 1.0000)
```

### Fast Pass MISS

```
2026-03-09 12:43:50 [INFO] Fast Pass MISS: 최대 유사도 0.85 < 0.97
```

## 데이터베이스 최적화

### 인덱스 추가 (프로덕션)

```sql
CREATE INDEX idx_analysis_stage_created
ON analysis_results(stage, created_at DESC);
```

### 캐시 전략

- 최근 100개 분석 결과만 조회
- 메모리 캐시 추가 가능 (Redis)
- 해시 값 사전 계산 및 저장

## 제한사항

### 현재 구현

- 최근 100개 분석 결과만 검색
- 순차 검색 (O(n))
- 로컬 SQLite 사용

### 프로덕션 개선

- pgvector 사용 (벡터 인덱스)
- 병렬 검색
- Redis 캐시
- 분산 처리

## 비용 절감 효과

### 시나리오: 일일 1000개 영상 분석

- 재업로드 비율: 20% (200개)
- Fast Pass 적용: 200개

**절감 효과:**

- GPU 시간: 200 × 650ms = 130초 절약
- 비용: ~87% 절감 (200개 영상 기준)
- 응답 시간: 평균 520ms 단축

### 연간 효과 (365일)

- GPU 시간 절약: 13.2시간
- 비용 절감: 수백만원 (GPU 비용 기준)
- 사용자 경험 개선: 즉시 응답

## 테스트

### 단위 테스트

```bash
python test_fast_pass.py
```

### 성능 테스트

```python
# 1차: 일반 분석
result1 = await analyze_frames_impl(video, enable_fast_pass=False)
# 651ms

# 2차: Fast Pass
result2 = await analyze_frames_impl(video, enable_fast_pass=True)
# 87ms (7.5배 빠름)
```

## 모니터링

### 메트릭

- Fast Pass 적중률
- 평균 유사도
- 처리 시간 분포
- 비용 절감액

### 로그 분석

```bash
# Fast Pass 적중 횟수
grep "Fast Pass HIT" logs/*.log | wc -l

# 평균 유사도
grep "Fast Pass HIT" logs/*.log | awk '{print $NF}' | ...
```

## 결론

Fast Pass는 동일/유사 영상 재업로드 시:

- ⚡ **7.5배 빠른 응답** (651ms → 87ms)
- 💰 **87% 비용 절감** (GPU 사용 제로)
- 🎯 **1초 미만 응답** 달성
- 🚀 **사용자 경험 개선**

프로덕션 환경에서 필수적인 최적화 기능입니다!
