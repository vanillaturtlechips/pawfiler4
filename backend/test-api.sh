#!/bin/bash

echo "🧪 Testing PawFiler Backend APIs..."
echo ""

# Test PostgreSQL
echo "1️⃣ Testing PostgreSQL connection..."
if docker exec pawfiler-postgres pg_isready -U pawfiler > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
fi
echo ""

# Test Quiz API
echo "2️⃣ Testing Quiz API (REST)..."
QUIZ_RESPONSE=$(curl -s -X POST http://localhost:3001/api/quiz/random \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user-123"}' 2>&1)

if echo "$QUIZ_RESPONSE" | grep -q "id"; then
    echo "✅ Quiz API is working"
    echo "Response: $QUIZ_RESPONSE" | head -c 200
    echo "..."
else
    echo "❌ Quiz API failed"
    echo "Response: $QUIZ_RESPONSE"
fi
echo ""

# Test Community API
echo "3️⃣ Testing Community API (HTTP)..."
COMMUNITY_RESPONSE=$(curl -s http://localhost:50053/community.CommunityService/GetFeed 2>&1)

if echo "$COMMUNITY_RESPONSE" | grep -q "posts"; then
    echo "✅ Community API is working"
    echo "Response: $COMMUNITY_RESPONSE" | head -c 200
    echo "..."
else
    echo "❌ Community API failed"
    echo "Response: $COMMUNITY_RESPONSE"
fi
echo ""

echo "🏁 Test completed!"
