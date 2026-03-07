FROM --platform=$BUILDPLATFORM golang:1.21-alpine AS builder
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o admin-service .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/admin-service .

EXPOSE 8082

CMD ["./admin-service"]
