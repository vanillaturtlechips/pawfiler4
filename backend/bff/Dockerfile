FROM node:20-alpine
WORKDIR /app
COPY bff/package*.json ./
RUN npm ci --production
COPY bff/ .
COPY proto /proto
EXPOSE 3000
CMD ["node", "server.js"]
