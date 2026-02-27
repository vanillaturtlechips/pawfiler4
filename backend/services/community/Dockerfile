FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod ./
RUN go mod download || true

# Copy source code
COPY main_simple.go ./main.go

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o community-service .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/community-service .

EXPOSE 50053

CMD ["./community-service"]
