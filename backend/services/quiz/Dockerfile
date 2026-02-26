# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Set working directory
WORKDIR /build

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY main.go ./
COPY internal/ ./internal/
COPY proto/ ./proto/
COPY pkg/ ./pkg/

# Build the binary with optimizations
# -ldflags="-s -w" strips debug information to reduce binary size
# CGO_ENABLED=0 creates a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o quiz-service \
    ./main.go

# Runtime stage - using distroless for minimal image size and security
FROM gcr.io/distroless/static-debian12:nonroot

# Copy CA certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Set working directory
WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/quiz-service .

# Expose gRPC port
EXPOSE 50052

# Run as non-root user (distroless nonroot user)
USER nonroot:nonroot

# Run the service
ENTRYPOINT ["/app/quiz-service"]
