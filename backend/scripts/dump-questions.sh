#!/bin/bash

# Quiz questions를 덤프해서 init-db.sql에 자동으로 업데이트하는 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_DB_FILE="$SCRIPT_DIR/init-db.sql"
TEMP_DUMP="$SCRIPT_DIR/temp_questions.sql"
BACKUP_FILE="$SCRIPT_DIR/init-db.sql.backup"

echo "🔄 Dumping quiz questions from database..."

# DB에서 quiz questions 덤프
docker exec -e PGPASSWORD=dev_password pawfiler-postgres pg_dump -U pawfiler -d pawfiler -t quiz.questions --data-only --column-inserts 2>/dev/null | grep "INSERT INTO" > "$TEMP_DUMP"

if [ ! -s "$TEMP_DUMP" ]; then
    echo "❌ No questions found or dump failed"
    rm -f "$TEMP_DUMP"
    exit 1
fi

# 문제 개수 확인
QUESTION_COUNT=$(wc -l < "$TEMP_DUMP")
echo "📊 Found $QUESTION_COUNT questions in database"

# 백업 생성
cp "$INIT_DB_FILE" "$BACKUP_FILE"
echo "💾 Backup created: init-db.sql.backup"

# init-db.sql을 3개 부분으로 나눔
# 1. quiz questions 섹션 이전
# 2. quiz questions 섹션 (교체할 부분)
# 3. community posts 섹션 이후

# 1. quiz questions 이전 부분 추출
sed -n '1,/-- Insert sample quiz questions/p' "$BACKUP_FILE" > "$INIT_DB_FILE"

# 2. 새로운 quiz questions 추가
cat "$TEMP_DUMP" >> "$INIT_DB_FILE"
echo "" >> "$INIT_DB_FILE"

# 3. community posts 이후 부분 추가
sed -n '/-- Insert sample community posts/,$p' "$BACKUP_FILE" >> "$INIT_DB_FILE"

# 정리
rm -f "$TEMP_DUMP"

echo "✅ init-db.sql updated successfully!"
echo "📝 Quiz questions section has been replaced with current database content"
echo ""
echo "🎯 Next steps:"
echo "   1. Review the changes: git diff backend/scripts/init-db.sql"
echo "   2. Commit if satisfied: git add backend/scripts/init-db.sql && git commit -m 'update: quiz questions'"
