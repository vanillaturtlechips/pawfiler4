#!/usr/bin/env python3
"""
모델 준비 스크립트 — EFS 배포 전 포맷 변환 + 검증
================================================

사용법:
    python prepare_models.py \
        --video-ckpt mobilevit_phase2.pt \
        --xgb-ckpt xgboost_phase1.pkl \
        --output-dir ./efs_models

결과:
    ./efs_models/
    ├── video_backbone.pt      (state_dict 포맷으로 정규화)
    └── xgboost_cascade.json   (.pkl → .json 변환)

이후:
    aws s3 cp ./efs_models/ s3://ai-preprocessing/models/ --recursive
"""

import argparse
import pickle
import sys
from pathlib import Path


def convert_xgboost(pkl_path: str, output_path: str):
    """
    XGBoost .pkl → .json 변환.
    
    cascade.py가 xgb.Booster().load_model()을 사용하므로
    pickle 포맷이 아닌 XGBoost 네이티브 JSON이 필요함.
    """
    import xgboost as xgb

    print(f"[XGBoost] Loading pickle: {pkl_path}")

    # pickle로 저장된 경우 여러 형태 가능
    with open(pkl_path, "rb") as f:
        obj = pickle.load(f)

    if isinstance(obj, xgb.Booster):
        booster = obj
    elif isinstance(obj, xgb.XGBClassifier):
        booster = obj.get_booster()
    elif hasattr(obj, "get_booster"):
        booster = obj.get_booster()
    else:
        print(f"  [ERROR] 알 수 없는 타입: {type(obj)}")
        print(f"  지원 타입: xgb.Booster, xgb.XGBClassifier")
        sys.exit(1)

    # JSON 포맷으로 저장
    booster.save_model(output_path)
    print(f"  → 변환 완료: {output_path}")

    # 검증: 다시 로드 가능한지 확인
    test = xgb.Booster()
    test.load_model(output_path)
    print(f"  → 로드 검증 통과")


def prepare_video_model(ckpt_path: str, output_path: str):
    """
    Video 체크포인트 → state_dict 정규화.
    
    models.py의 _load_video_model()이 여러 포맷을 처리할 수 있지만,
    EFS에 올리기 전에 state_dict 형태로 정규화해두면 안전함.
    """
    import torch

    print(f"[Video] Loading checkpoint: {ckpt_path}")
    checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=False)

    # 타입 확인
    if isinstance(checkpoint, dict):
        if "model_state_dict" in checkpoint:
            state = checkpoint["model_state_dict"]
            print(f"  포맷: training checkpoint (epoch={checkpoint.get('epoch', '?')})")
        elif "state_dict" in checkpoint:
            state = checkpoint["state_dict"]
            print(f"  포맷: lightning checkpoint")
        else:
            # state_dict 자체이거나 다른 dict
            # key들이 weight 이름처럼 보이는지 체크
            sample_key = next(iter(checkpoint.keys()), "")
            if "." in sample_key and ("weight" in sample_key or "bias" in sample_key):
                state = checkpoint
                print(f"  포맷: raw state_dict")
            else:
                state = checkpoint
                print(f"  포맷: unknown dict (keys: {list(checkpoint.keys())[:5]})")
    elif isinstance(checkpoint, torch.nn.Module):
        state = checkpoint.state_dict()
        print(f"  포맷: full model object → state_dict 추출")
    else:
        print(f"  [ERROR] 알 수 없는 타입: {type(checkpoint)}")
        sys.exit(1)

    # Key 목록 출력 (디버깅용)
    print(f"  Keys ({len(state)}개):")
    for i, k in enumerate(state.keys()):
        shape = tuple(state[k].shape) if hasattr(state[k], "shape") else "?"
        print(f"    {k}: {shape}")
        if i >= 9:
            print(f"    ... ({len(state) - 10}개 더)")
            break

    # 저장
    torch.save(state, output_path)
    print(f"  → 저장: {output_path}")

    # 검증: 다시 로드 가능한지 확인
    loaded = torch.load(output_path, map_location="cpu", weights_only=True)
    assert len(loaded) == len(state), "Key 수 불일치"
    print(f"  → 로드 검증 통과")

    # ── Key 매칭 검증 (선택) ──
    try:
        import timm
        from models import VideoModel
        test_model = VideoModel(backbone_name="mobilevitv2_100")
        missing, unexpected = test_model.load_state_dict(loaded, strict=False)
        if missing:
            print(f"\n  ⚠️  Missing keys ({len(missing)}개) — 이 레이어는 랜덤 초기화됨:")
            for k in missing[:5]:
                print(f"      {k}")
        if unexpected:
            print(f"\n  ⚠️  Unexpected keys ({len(unexpected)}개) — 무시됨:")
            for k in unexpected[:5]:
                print(f"      {k}")
        if not missing and not unexpected:
            print(f"\n  ✅ VideoModel 구조와 완벽 매칭!")
    except Exception as e:
        print(f"\n  ℹ️  VideoModel 매칭 검증 생략: {e}")


def main():
    parser = argparse.ArgumentParser(description="PawFiler 모델 준비")
    parser.add_argument("--video-ckpt", type=str, help="mobilevit_phase2.pt 경로")
    parser.add_argument("--xgb-ckpt", type=str, help="xgboost_phase1.pkl 경로")
    parser.add_argument("--output-dir", type=str, default="./efs_models", help="출력 디렉토리")
    args = parser.parse_args()

    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)

    print(f"출력 디렉토리: {output}\n")

    if args.video_ckpt:
        prepare_video_model(args.video_ckpt, str(output / "video_backbone.pt"))
        print()

    if args.xgb_ckpt:
        convert_xgboost(args.xgb_ckpt, str(output / "xgboost_cascade.json"))
        print()

    print("=" * 50)
    print("다음 단계:")
    print(f"  aws s3 cp {output}/ s3://ai-preprocessing/models/ --recursive")
    print("  → EFS DataSync 또는 수동 복사로 /mnt/efs/models/ 에 적재")


if __name__ == "__main__":
    main()
