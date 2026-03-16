#!/usr/bin/env python3
"""S3 직접 읽기/쓰기 전처리"""
import s3fs
import numpy as np
import cv2
import zipfile
import io
from pathlib import Path
from tqdm import tqdm

s3 = s3fs.S3FileSystem(anon=False, client_kwargs={'region_name': 'ap-northeast-2'})

def extract_frames(video_bytes, fps=1, max_frames=32):
    temp = '/tmp/video.mp4'
    with open(temp, 'wb') as f:
        f.write(video_bytes)
    
    cap = cv2.VideoCapture(temp)
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    interval = max(1, int(video_fps / fps))
    
    frames = []
    idx = 0
    
    while len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % interval == 0:
            frames.append(cv2.resize(frame, (224, 224)))
        idx += 1
    
    cap.release()
    return np.array(frames) if frames else None

def preprocess_aigvdbench():
    bucket = 'ai-preprocessing'
    models = {
        'ClosedSource': ['Sora', 'Gen2', 'Gen3', 'Pika'],
        'OpenSource/T2V': ['AnimateDiff', 'EasyAnimate']
    }
    
    for cat, names in models.items():
        for name in names:
            zip_path = f's3://{bucket}/AIGVDBench_RawData/AIGVDBench/{cat}/{name}.zip'
            if not s3.exists(zip_path):
                continue
            
            print(f"Processing {name}...")
            with s3.open(zip_path, 'rb') as f:
                with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
                    for vf in [n for n in zf.namelist() if n.endswith('.mp4')]:
                        frames = extract_frames(zf.read(vf))
                        if frames is None:
                            continue
                        
                        vid = Path(vf).stem
                        out = f's3://{bucket}/preprocessed/aigvdbench/{name}/{vid}.npz'
                        with s3.open(out, 'wb') as of:
                            np.savez_compressed(of, frames=frames, label=name)

if __name__ == "__main__":
    preprocess_aigvdbench()
    print("Done!")
