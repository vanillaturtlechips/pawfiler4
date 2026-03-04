const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Load proto file
const PROTO_PATH = path.join(__dirname, '../proto/quiz.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const quizProto = grpc.loadPackageDefinition(packageDefinition).quiz;

// Create gRPC client
const QUIZ_SERVICE_URL = process.env.QUIZ_SERVICE_URL || 'quiz-service:50052';
const client = new quizProto.QuizService(
  QUIZ_SERVICE_URL,
  grpc.credentials.createInsecure()
);

console.log(`Connecting to Quiz Service at ${QUIZ_SERVICE_URL}`);

// REST endpoints
app.post('/api/quiz/random', (req, res) => {
  const { user_id, difficulty, type } = req.body;
  
  client.GetRandomQuestion({ user_id, difficulty, type }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

app.post('/api/quiz/submit', (req, res) => {
  const request = req.body;
  
  client.SubmitAnswer(request, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    console.log('SubmitAnswer response:', JSON.stringify(response, null, 2));
    console.log('SubmitAnswer response.correct_index:', response.correct_index);
    console.log('SubmitAnswer response.correctIndex:', response.correctIndex);
    console.log('SubmitAnswer response keys:', Object.keys(response));
    
    // gRPC 응답을 JSON으로 변환하면서 correct_index 필드 명시적으로 포함
    const jsonResponse = {
      correct: response.correct,
      xp_earned: response.xp_earned,
      coins_earned: response.coins_earned,
      explanation: response.explanation,
      streak_count: response.streak_count,
    };
    
    // correct_index가 있으면 포함 (camelCase와 snake_case 둘 다 확인)
    if (response.correct_index !== undefined && response.correct_index !== null) {
      jsonResponse.correct_index = response.correct_index;
      console.log('Added correct_index (snake_case):', response.correct_index);
    }
    if (response.correctIndex !== undefined && response.correctIndex !== null) {
      jsonResponse.correct_index = response.correctIndex;
      console.log('Added correct_index (camelCase):', response.correctIndex);
    }
    
    console.log('JSON response:', JSON.stringify(jsonResponse, null, 2));
    res.json(jsonResponse);
  });
});

app.post('/api/quiz/stats', (req, res) => {
  const { user_id } = req.body;
  
  client.GetUserStats({ user_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Quiz proxy server running on port ${PORT}`);
});
