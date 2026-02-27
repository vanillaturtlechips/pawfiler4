FROM python:3.11-slim
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/video-analysis/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt grpcio-tools
COPY services/video-analysis/ .
COPY proto /proto
RUN mkdir -p generated && \
    python -m grpc_tools.protoc -I/proto --python_out=generated --grpc_python_out=generated /proto/video_analysis.proto && \
    touch generated/__init__.py && \
    sed -i 's/import video_analysis_pb2/from . import video_analysis_pb2/' generated/video_analysis_pb2_grpc.py
EXPOSE 50054
CMD ["python", "server.py"]
