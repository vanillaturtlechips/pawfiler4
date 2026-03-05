#!/bin/bash

# Quiz questions를 덤프해서 init-db.sql에 자동으로 업데이트하는 스크립트

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_DB_FILE="$SCRIPT_DIR/init-db.sql"
TEMP_FILE="/tmp/quiz_dump.sql"
BACKUP_FILE="$SCRIPT_DIR/init-db.sql.backup"

echo "🔄 Dumping quiz questions from database..."

# DB에서 quiz questions 덤프
docker exec pawfiler-postgres pg_dump -U pawfiler -d pawfiler -t quiz.questions --data-only --column-inserts 2>/dev/null | grep "INSERT INTO" > "$TEMP_FILE"

if [ ! -s "$TEMP_FILE" ]; then
    echo "❌ No questions found or dump failed"
    rm -f "$TEMP_FILE"
    exit 1
fi

# 문제 개수 확인
QUESTION_COUNT=$(wc -l < "$TEMP_FILE")
echo "📊 Found $QUESTION_COUNT questions in database"

# 백업 생성
cp "$INIT_DB_FILE" "$BACKUP_FILE"
echo "💾 Backup created: init-db.sql.backup"

# init-db.sql에서 quiz questions 섹션 찾아서 교체
# "-- Insert sample quiz questions" 부터 다음 섹션 전까지 교체
awk -v questions="$(cat $TEMP_FILE)" '
BEGIN { in_quiz_section = 0; printed_questions = 0 }
/-- Insert sample quiz questions/ {
    print
    print questions ";"
    printed_questions = 1
    in_quiz_section = 1
    next
}
/-- Insert sample community posts/ {
    in_quiz_section = 0
}
!in_quiz_section || !printed_questions {
    if (!/^INSERT INTO quiz\.questions/) {
        print
    }
}
' "$BACKUP_FILE" > "$INIT_DB_FILE"

# 정리
rm -f "$TEMP_FILE"

echo "✅ init-db.sql updated successfully!"
echo "📝 Quiz questions section has been replaced with current database content"
echo ""
echo "🎯 Next steps:"
echo "   1. Review the changes: git diff backend/scripts/init-db.sql"
echo "   2. Commit if satisfied: git add backend/scripts/init-db.sql && git commit -m 'update: quiz questions'"
