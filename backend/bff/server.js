const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Load proto files
const QUIZ_PROTO_PATH = path.join(__dirname, '../proto/quiz.proto');
const COMMUNITY_PROTO_PATH = path.join(__dirname, '../proto/community.proto');

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

// Helper to convert gRPC response to camelCase JSON
function grpcToCamelCase(grpcResponse) {
  // Convert protobuf object to plain JavaScript object first
  const plainObj = JSON.parse(JSON.stringify(grpcResponse));
  return toCamelCase(plainObj);
}


// REST endpoints - Quiz
app.post('/api/quiz/random', (req, res) => {
  const { user_id, difficulty, type } = req.body;
  
  quizClient.GetRandomQuestion({ user_id, difficulty, type }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

app.post('/api/quiz/submit', (req, res) => {
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

app.post('/api/quiz/stats', (req, res) => {
  const { user_id } = req.body;
  
  quizClient.GetUserStats({ user_id }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(response);
  });
});

// REST endpoints - Community (gRPC)
// Community Feed
app.get('/api/community/feed', (req, res) => {
  const { page, pageSize, search, searchType } = req.query;
  
  communityClient.GetFeed({
    page: parseInt(page) || 1,
    page_size: parseInt(pageSize) || 15,
    search_query: search || '',
    search_type: searchType || 'title'
  }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Get Single Post
app.get('/api/community/post', (req, res) => {
  const { postId } = req.query;
  
  communityClient.GetPost({ post_id: postId }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      const statusCode = error.code === grpc.status.NOT_FOUND ? 404 : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Create Post
app.post('/api/community/post', (req, res) => {
  communityClient.CreatePost(req.body, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      const statusCode = error.code === grpc.status.INVALID_ARGUMENT ? 400 : 500;
      return res.status(statusCode).json({ error: error.message });
    }
    res.status(201).json(grpcToCamelCase(response));
  });
});

// Update Post
app.put('/api/community/post', (req, res) => {
  communityClient.UpdatePost(req.body, (error, response) => {
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

// Delete Post
app.delete('/api/community/post', (req, res) => {
  communityClient.DeletePost(req.body, (error, response) => {
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

// Get Comments
app.get('/api/community/comments', (req, res) => {
  const { postId } = req.query;
  
  communityClient.GetComments({ post_id: postId }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Create Comment
app.post('/api/community/comment', (req, res) => {
  communityClient.CreateComment(req.body, (error, response) => {
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

// Delete Comment
app.delete('/api/community/comment', (req, res) => {
  communityClient.DeleteComment(req.body, (error, response) => {
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

// Like Post
app.post('/api/community/like', (req, res) => {
  communityClient.LikePost(req.body, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Unlike Post
app.post('/api/community/unlike', (req, res) => {
  communityClient.UnlikePost(req.body, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Check Like
app.get('/api/community/check-like', (req, res) => {
  const { postId, userId } = req.query;
  
  communityClient.CheckLike({ post_id: postId, user_id: userId }, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

// Dashboard APIs
app.get('/api/community/notices', (req, res) => {
  communityClient.GetNotices({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.get('/api/community/top-detective', (req, res) => {
  communityClient.GetTopDetective({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

app.get('/api/community/hot-topic', (req, res) => {
  communityClient.GetHotTopic({}, (error, response) => {
    if (error) {
      console.error('gRPC error:', error);
      return res.status(500).json({ error: error.message });
    }
    res.json(grpcToCamelCase(response));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BFF server running on port ${PORT}`);
});
