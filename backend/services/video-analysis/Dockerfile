FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY services/video-analysis/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy proto files
COPY proto/video_analysis.proto /app/proto/

# Generate Python gRPC code
# Fix for import path issue: generated code imports relative to root, but it's inside 'generated' package
RUN mkdir -p /app/generated && \
    python -m grpc_tools.protoc -I/app/proto --python_out=/app/generated --grpc_python_out=/app/generated /app/proto/video_analysis.proto && \
    touch /app/generated/__init__.py && \
    # Patch the generated grpc file to use relative import or absolute import from generated package
    sed -i 's/import video_analysis_pb2 as/from . import video_analysis_pb2 as/g' /app/generated/video_analysis_pb2_grpc.py

COPY services/video-analysis/ .

RUN mkdir -p /tmp/videos

CMD ["python", "server.py"]
