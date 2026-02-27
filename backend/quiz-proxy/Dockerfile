FROM node:18-alpine

WORKDIR /app

COPY quiz-proxy/package*.json ./
RUN npm ci --only=production

COPY quiz-proxy/ .
COPY proto /proto

EXPOSE 3001

CMD ["node", "server.js"]
