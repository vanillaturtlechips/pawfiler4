FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY proto/ ./proto/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o quiz-service \
    ./cmd/server/main.go

FROM alpine:latest

WORKDIR /app

COPY --from=builder /build/quiz-service .

EXPOSE 50052

CMD ["./quiz-service"]
