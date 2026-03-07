FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 바스쳔에서 port-forward로 접근하므로 localhost 고정
ARG VITE_ADMIN_API_URL=http://localhost:8082
ARG VITE_API_BASE_URL=http://localhost:8080

RUN VITE_ADMIN_API_URL=$VITE_ADMIN_API_URL \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
