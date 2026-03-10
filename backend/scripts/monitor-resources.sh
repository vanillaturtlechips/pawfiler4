#!/bin/bash

# 실시간 리소스 모니터링 스크립트

echo "🔍 PawFiler 리소스 모니터링 시작"
echo "=================================="
echo ""

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "⏰ $TIMESTAMP"
    echo ""
    
    # 1. EKS 노드 리소스 사용률
    echo "📊 EKS 노드 리소스:"
    kubectl top nodes 2>/dev/null || echo "❌ kubectl top nodes 실패"
    echo ""
    
    # 2. Pod 리소스 사용률
    echo "🐳 Pod 리소스 (pawfiler 네임스페이스):"
    kubectl top pods -n pawfiler 2>/dev/null || echo "❌ kubectl top pods 실패"
    echo ""
    
    # 3. Pod 상태
    echo "📋 Pod 상태:"
    kubectl get pods -n pawfiler -o wide 2>/dev/null || echo "❌ kubectl get pods 실패"
    echo ""
    
    # 4. 서비스 응답 확인
    echo "🌐 서비스 응답 테스트:"
    RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" --max-time 5 https://pawfiler.site 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "✅ pawfiler.site 응답: ${RESPONSE_TIME}초"
    else
        echo "❌ pawfiler.site 응답 실패"
    fi
    echo ""
    
    # 5. DB 연결 테스트 (Pod 내부에서)
    echo "🗄️ DB 연결 테스트:"
    
    # 먼저 Quiz Service Pod가 실행 중인지 확인
    QUIZ_POD=$(kubectl get pods -n pawfiler -l app=quiz-service --no-headers 2>/dev/null | head -1 | awk '{print $1}')
    
    if [ -z "$QUIZ_POD" ]; then
        echo "❌ Quiz Service Pod를 찾을 수 없음"
    else
        echo "📍 Quiz Service Pod: $QUIZ_POD"
        
        # Pod 내부에서 DB 연결 테스트
        DB_TEST=$(kubectl exec -n pawfiler "$QUIZ_POD" -- sh -c "command -v pg_isready >/dev/null 2>&1 && pg_isready -h \$DB_HOST -p \$DB_PORT -U \$DB_USER" 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            echo "✅ DB 연결 정상"
        else
            echo "❌ DB 연결 실패 - 상세 확인 중..."
            
            # 환경 변수 확인
            echo "  🔍 DB 환경 변수:"
            kubectl exec -n pawfiler "$QUIZ_POD" -- sh -c "echo '    DB_HOST: '\$DB_HOST; echo '    DB_PORT: '\$DB_PORT; echo '    DB_USER: '\$DB_USER" 2>/dev/null || echo "    환경 변수 확인 실패"
            
            # 네트워크 연결 테스트
            echo "  🌐 네트워크 연결 테스트:"
            kubectl exec -n pawfiler "$QUIZ_POD" -- sh -c "nc -z \$DB_HOST \$DB_PORT" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo "    ✅ DB 서버 포트 접근 가능"
            else
                echo "    ❌ DB 서버 포트 접근 불가"
            fi
        fi
    fi
    echo ""
    
    echo "=================================="
    echo ""
    sleep 10  # 10초마다 체크
done