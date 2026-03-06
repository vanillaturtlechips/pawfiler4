const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS 설정
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// OPTIONS preflight 처리
app.options('*', cors());

app.use(express.json());

// Load proto files
const QUIZ_PROTO_PATH = path.join('/proto/quiz.proto');
const COMMUNITY_PROTO_PATH = path.join('/proto/community.proto');

const quizPackageDef = protoLoader.loadSync(QUIZ_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const communityPackageDef = protoLoader.loadSync(COMMUNITY_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const quizProto = grpc.loadPackageDefinition(quizPackageDef).quiz;
const communityProto = grpc.loadPackageDefinition(communityPackageDef).community;

// Create gRPC clients
const QUIZ_SERVICE_URL = process.env.QUIZ_SERVICE_URL || 'quiz-service:50052';
const COMMUNITY_SERVICE_URL = process.env.COMMUNITY_SERVICE_URL || 'community-service:50053';

const quizClient = new quizProto.QuizService(
  QUIZ_SERVICE_URL,
  grpc.credentials.createInsecure()
);

const communityClient = new communityProto.CommunityService(
  COMMUNITY_SERVICE_URL,
  grpc.credentials.createInsecure()
);

console.log(`Connecting to Quiz Service at ${QUIZ_SERVICE_URL}`);
console.log(`Connecting to Community Service at ${COMMUNITY_SERVICE_URL}`);

// Helper function to convert snake_case to camelCase
function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  
  const camelObj = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj[key]);
  }
  return camelObj;
}

// Helper function to convert camelCase to snake_case
function toSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  
  const snakeObj = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = toSnakeCase(obj[key]);
  }
  return snakeObj;
}

// Helper to convert gRPC response to camelCase JSON
function grpcToCamelCase(grpcResponse) {
  // Convert protobuf object to plain JavaScript object first
  const plainObj = JSON.parse(JSON.stringify(grpcResponse));
  return toCamelCase(plainObj);
}

// gRPC-Web style endpoints - Quiz
app.post('/quiz.QuizService/GetRandomQuestion', (req, res) => {
  const { user_id, difficulty, type } = req.body;
  
  quizClient.GetRandomQuestion({ user_id, difficulty, type }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

app.post('/quiz.QuizService/SubmitAnswer', (req, res) => {
  const request = req.body;
  
  quizClient.SubmitAnswer(request, (error, response) => {
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

app.post('/quiz.QuizService/GetUserStats', (req, res) => {
  const { user_id } = req.body;
  
  quizClient.GetUserStats({ user_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

// gRPC-Web style endpoints - Community
app.post('/community.CommunityService/GetFeed', (req, res) => {
  const { page, page_size, search_query, search_type } = req.body;
  
  communityClient.GetFeed({
    page: page || 1,
    page_size: page_size || 15,
    search_query: search_query || '',
    search_type: search_type || 'title'
  }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/GetPost', (req, res) => {
  const { post_id } = req.body;
  
  communityClient.GetPost({ post_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      const statusCode = error.code === grpc.status.NOT_FOUND ? 404 : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/CreatePost', (req, res) => {
  communityClient.CreatePost(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      const statusCode = error.code === grpc.status.INVALID_ARGUMENT ? 400 : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    res.status(201).json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/UpdatePost', (req, res) => {
  communityClient.UpdatePost(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      let statusCode = 500;
      if (error.code === grpc.status.NOT_FOUND) statusCode = 404;
      if (error.code === grpc.status.PERMISSION_DENIED) statusCode = 403;
      return res.status(statusCode).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/DeletePost', (req, res) => {
  communityClient.DeletePost(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      let statusCode = 500;
      if (error.code === grpc.status.NOT_FOUND) statusCode = 404;
      if (error.code === grpc.status.PERMISSION_DENIED) statusCode = 403;
      return res.status(statusCode).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/GetComments', (req, res) => {
  const { post_id } = req.body;
  
  communityClient.GetComments({ post_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/CreateComment', (req, res) => {
  communityClient.CreateComment(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      let statusCode = 500;
      if (error.code === grpc.status.NOT_FOUND) statusCode = 404;
      if (error.code === grpc.status.INVALID_ARGUMENT) statusCode = 400;
      return res.status(statusCode).json({ error: error.message });
    }
    res.status(201).json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/DeleteComment', (req, res) => {
  communityClient.DeleteComment(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      let statusCode = 500;
      if (error.code === grpc.status.NOT_FOUND) statusCode = 404;
      if (error.code === grpc.status.PERMISSION_DENIED) statusCode = 403;
      return res.status(statusCode).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/LikePost', (req, res) => {
  communityClient.LikePost(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/UnlikePost', (req, res) => {
  communityClient.UnlikePost(toSnakeCase(req.body), (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/CheckLike', (req, res) => {
  const { post_id, user_id } = req.body;
  
  communityClient.CheckLike({ post_id, user_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/GetNotices', (req, res) => {
  communityClient.GetNotices({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/GetTopDetective', (req, res) => {
  communityClient.GetTopDetective({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.post('/community.CommunityService/GetHotTopic', (req, res) => {
  communityClient.GetHotTopic({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Payment service mock endpoints
app.post('/payment.PaymentService/GetPlans', (req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: '무료',
        price: 0,
        features: ['기본 퀴즈', '커뮤니티 참여']
      },
      {
        id: 'premium',
        name: '프리미엄',
        price: 9900,
        features: ['모든 퀴즈', '영상 분석', '광고 제거']
      }
    ]
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BFF server running on port ${PORT}`);
});
