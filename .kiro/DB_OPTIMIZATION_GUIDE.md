# DB 최적화 실행 가이드

## 🎯 적용 순서

### 1단계: 백업 (필수)
```bash
# RDS 스냅샷 생성
aws rds create-db-snapshot \
  --db-instance-identifier pawfiler-db-instance \
  --db-snapshot-identifier pawfiler-db-backup-$(date +%Y%m%d) \
  --region ap-northeast-2
```

### 2단계: DB 최적화 스크립트 실행
```bash
# Bastion 포트 포워딩
ssh -i ~/Downloads/silver-guardian-key.pem \
    -L 5432:pawfiler-db-instance.c9osquca0esm.ap-northeast-2.rds.amazonaws.com:5432 \
    ec2-user@13.125.64.130

# 새 터미널에서 실행
psql -h localhost -p 5432 -U pawfiler -d pawfiler_db \
     -f backend/scripts/optimize-db.sql
```

### 3단계: 애플리케이션 재배포
```bash
# Connection Pool 설정 변경 반영
kubectl rollout restart deployment/quiz-service -n pawfiler
kubectl rollout restart deployment/community-service -n pawfiler
```

### 4단계: 모니터링
```bash
# 1주일 후 실행
psql -h localhost -p 5432 -U pawfiler -d pawfiler_db \
     -f backend/scripts/monitor-db.sql
```

---

## 📊 적용된 최적화

### 1. Connection Pool
```
Quiz Service:     100 → 30 연결
Community Service: 50 → 20 연결
Admin Service:     50 → 5 연결 (추정)
Video Analysis:    10 → 5 연결 (추정)
─────────────────────────────────
총:              210 → 60 연결 ✅
```

### 2. HOT 최적화
```sql
quiz.user_stats: fillfactor = 70
community.posts: fillfactor = 80
```

### 3. Autovacuum 튜닝
```sql
quiz.user_stats: 5% 변경 시 vacuum
community.posts: 10% 변경 시 vacuum
```

### 4. 검색 인덱스
```sql
idx_posts_title_trgm (GIN)
idx_posts_body_trgm (GIN)
idx_user_answers_recent (Partial)
```

---

## ⚠️ 주의사항

### 롤백 방법
```sql
-- Fillfactor 원복
ALTER TABLE quiz.user_stats RESET (fillfactor);
ALTER TABLE community.posts RESET (fillfactor);

-- Autovacuum 원복
ALTER TABLE quiz.user_stats RESET (autovacuum_vacuum_scale_factor);
ALTER TABLE community.posts RESET (autovacuum_vacuum_scale_factor);

-- 인덱스 제거
DROP INDEX IF EXISTS idx_posts_title_trgm;
DROP INDEX IF EXISTS idx_posts_body_trgm;
DROP INDEX IF EXISTS idx_user_answers_recent;
```

### Connection Pool 원복
```go
// Quiz Service
sqlDB.SetMaxOpenConns(100)
sqlDB.SetMaxIdleConns(50)

// Community Service
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(25)
```

---

## 📈 예상 효과

### 안정성
- ✅ 연결 고갈 방지 (210 → 60)
- ✅ RDS 한계(87) 대비 여유 확보

### 성능
- ✅ UPDATE 성능 20-30% 향상 (HOT)
- ✅ 검색 속도 10-100배 향상 (Trigram)
- ✅ Bloat 감소 (Autovacuum)

### 비용
- 변동 없음 (RDS db.t3.micro 유지)

---

## 🔍 모니터링 체크리스트

### 매일
- [ ] 연결 수 확인 (< 60)
- [ ] 에러 로그 확인

### 매주
- [ ] `monitor-db.sql` 실행
- [ ] Dead tuple 비율 확인 (< 20%)
- [ ] 캐시 히트율 확인 (> 90%)

### 매월
- [ ] 인덱스 사용률 확인
- [ ] 테이블 크기 추이 확인
- [ ] Slow query 분석

---

## 💡 다음 단계

### 6개월 후
- 실제 데이터 규모 측정
- 실제 QPS 측정
- RDS 업그레이드 필요성 판단

### 1년 후
- 벡터 DB 규모 재평가
- CNPG 마이그레이션 재검토
- 읽기 복제본 필요성 판단

---

## 📚 참고 문서

- `.kiro/DB_OPTIMIZATION_PRACTICAL.md` - 상세 전략
- `.kiro/VECTOR_DB_SCALE_ANALYSIS.md` - 규모 분석
- `.kiro/DB_STRUCTURE.md` - DB 구조
