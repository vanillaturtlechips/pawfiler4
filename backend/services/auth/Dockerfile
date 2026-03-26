FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
# go mod tidy로 go.sum 자동 생성 (신규 dep 추가 시 필요)
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o auth-service .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/auth-service .
EXPOSE 8084
CMD ["./auth-service"]
