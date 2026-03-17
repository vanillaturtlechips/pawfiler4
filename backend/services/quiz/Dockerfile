FROM --platform=$BUILDPLATFORM golang:1.25rc1-alpine AS builder
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH
ENV GOTOOLCHAIN=auto
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o quiz-service ./cmd/server

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/quiz-service .
EXPOSE 50052 8080
CMD ["./quiz-service"]
