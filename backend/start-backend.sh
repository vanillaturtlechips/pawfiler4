#!/bin/bash

echo "🚀 Starting PawFiler Backend Services..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "📦 Starting PostgreSQL..."
docker-compose up -d postgres

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

echo "🎮 Starting Quiz Service..."
docker-compose up -d quiz-service

echo "⏳ Waiting for Quiz Service to be ready..."
sleep 5

echo "🔄 Starting Quiz Proxy (REST API)..."
docker-compose up -d quiz-proxy

echo "💬 Starting Community Service..."
docker-compose up -d community-service

echo ""
echo "✅ Backend services started!"
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🔗 Available APIs:"
echo "  - Quiz API (REST):      http://localhost:3001/api/quiz"
echo "  - Community API (HTTP): http://localhost:50053"
echo "  - PostgreSQL:           localhost:5432"
echo ""
echo "📝 To view logs:"
echo "  docker-compose logs -f quiz-service"
echo "  docker-compose logs -f community-service"
echo "  docker-compose logs -f quiz-proxy"
echo ""
echo "🛑 To stop all services:"
echo "  docker-compose down"
