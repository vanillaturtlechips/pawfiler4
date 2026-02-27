FROM node:20-alpine
WORKDIR /app
COPY quiz-proxy/package*.json ./
RUN npm ci --production
COPY quiz-proxy/ .
COPY proto /proto
EXPOSE 3001
CMD ["node", "server.js"]
