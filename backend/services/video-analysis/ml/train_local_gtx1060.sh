#!/bin/bash
# GTX 1060 3GB 로컬 학습 (메모리 최적화)

echo "=== GTX 1060 3GB 최적화 학습 ==="
echo "샘플: celeb_df (10개 mp4)"
echo "최적화: batch_size=1, mixed precision, gradient checkpointing"
echo ""

# CUDA 메모리 최적화
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128

python3 train.py \
  --data-dir /media/user/eb0a27dd-868a-4423-9f75-a9a61440d1f4/preprocessed_samples \
  --output-dir ./models \
  --epochs 20 \
  --batch-size 1 \
  --lr 0.0001 \
  --num-workers 2

echo ""
echo "=== 학습 완료 ==="
echo "예상 시간: ~15-20분 (10개 샘플, 20 epochs)"
echo "모델: ./models/mobilevit_v2_best.pth"
echo "ONNX: ./models/mobilevit_v2.onnx"
