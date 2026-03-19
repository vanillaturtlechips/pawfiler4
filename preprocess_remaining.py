import s3fs
import zipfile
import tarfile
import numpy as np
from pathlib import Path
import cv2
import os
import gc
import shutil
import logging
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
import pytz

KST = pytz.timezone('Asia/Seoul')

class KSTFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, KST)
        return dt.strftime('%Y-%m-%d %H:%M:%S')

handler = logging.StreamHandler()
handler.setFormatter(KSTFormatter('%(asctime)s - %(message)s'))
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(handler)

bucket = 'ai-preprocessing'
IMG_SIZE = (224, 224)

def extract_frames(video_path):
    cv2.setNumThreads(0)
    cap = cv2.VideoCapture(video_path)
    frames = []
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(cv2.resize(frame, IMG_SIZE))
    cap.release()
    return np.array(frames) if frames else None

# ============================================================
# 1. AIGVDBench 중복 모델 (I2V/V2V) - 카테고리 포함 경로
# ============================================================
def process_video_cat(args):
    vf, cat_prefix, name, local_zip, pid = args
    s3 = s3fs.S3FileSystem()
    vid = Path(vf).stem
    out = f's3://{bucket}/preprocessed/aigvdbench/{cat_prefix}_{name}/{vid}.npz'
    if s3.exists(out):
        return vid, True
    temp = f'/tmp/p{pid}_{vid}.mp4'
    try:
        with zipfile.ZipFile(local_zip) as zf:
            with zf.open(vf) as src, open(temp, 'wb') as dst:
                shutil.copyfileobj(src, dst)
        frames = extract_frames(temp)
        if frames is None:
            return vid, False
        with s3.open(out, 'wb') as of:
            np.savez_compressed(of, frames=frames, label=f'{cat_prefix}_{name}')
        del frames
        return vid, True
    except Exception as e:
        logger.error(f'[{vid}] {e}')
        return vid, False
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
        gc.collect()

# ============================================================
# 2. Celeb-DF-v2 (mp4 직접 S3에서 다운로드)
# ============================================================
def process_celeb(args):
    vp, split = args
    s3 = s3fs.S3FileSystem()
    vid = Path(vp).stem
    label = 'real' if 'real' in split.lower() else 'fake'
    out = f's3://{bucket}/preprocessed/celeb-df/{split}/{vid}.npz'
    if s3.exists(out):
        return vid, True
    temp = f'/tmp/celeb_{vid}.mp4'
    try:
        s3.get(vp, temp)
        frames = extract_frames(temp)
        if frames is None:
            return vid, False
        with s3.open(out, 'wb') as of:
            np.savez_compressed(of, frames=frames, label=label)
        del frames
        return vid, True
    except Exception as e:
        logger.error(f'[Celeb {vid}] {e}')
        return vid, False
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
        gc.collect()

# ============================================================
# 3. WildDeepfake (tar.gz 안에 mp4)
# ============================================================
def process_wild(args):
    video_bytes, vid, label = args
    s3 = s3fs.S3FileSystem()
    out = f's3://{bucket}/preprocessed/wilddeepfake/{vid}.npz'
    if s3.exists(out):
        return vid, True
    temp = f'/tmp/wild_{vid}.mp4'
    try:
        with open(temp, 'wb') as f:
            f.write(video_bytes)
        frames = extract_frames(temp)
        if frames is None:
            return vid, False
        with s3.open(out, 'wb') as of:
            np.savez_compressed(of, frames=frames, label=label)
        del frames
        return vid, True
    except Exception as e:
        logger.error(f'[Wild {vid}] {e}')
        return vid, False
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
        gc.collect()

# ============================================================
# 4. dfadd (arrow → mel-spectrogram)
# ============================================================
def process_dfadd_arrow(arrow_path):
    import pyarrow.ipc as ipc
    import librosa
    s3 = s3fs.S3FileSystem()
    logger.info(f'=== dfadd: {Path(arrow_path).name} ===')
    with s3.open(arrow_path, 'rb') as f:
        table = ipc.open_stream(f).read_all()
    processed = 0
    for i in range(len(table)):
        row = table.slice(i, 1)
        label = int(row['label'][0].as_py())
        audio = np.array(row['audio'][0]['array'])
        sr = int(row['audio'][0]['sampling_rate'])
        vid = f'{Path(arrow_path).stem}_{i}'
        out = f's3://{bucket}/preprocessed/dfadd/{vid}.npz'
        if s3.exists(out):
            continue
        try:
            mel = librosa.feature.melspectrogram(y=audio.astype(np.float32), sr=sr, n_mels=128)
            mel_db = librosa.power_to_db(mel, ref=np.max)
            mel_resized = cv2.resize(mel_db, IMG_SIZE)
            with s3.open(out, 'wb') as of:
                np.savez_compressed(of, frames=mel_resized, label=label)
            processed += 1
        except Exception as e:
            logger.error(f'[dfadd {vid}] {e}')
    logger.info(f'Done: {processed}/{len(table)}')


if __name__ == '__main__':
    mp.set_start_method('spawn', force=True)
    s3_main = s3fs.S3FileSystem()

    # ── 1. AIGVDBench 중복 모델 ──────────────────────────────
    duplicate_models = [
        ('OpenSource/I2V', ['EasyAnimate', 'LTX', 'Pyramid-Flow', 'SEINE', 'SVD', 'VideoCrafter']),
        ('OpenSource/V2V', ['Cogvideox1.5', 'LTX']),
    ]
    for cat, names in duplicate_models:
        cat_prefix = cat.replace('/', '_')
        for name in names:
            zip_path = f's3://{bucket}/AIGVDBench_RawData/AIGVDBench/{cat}/{name}.zip'
            if not s3_main.exists(zip_path):
                logger.info(f'Skip: {cat}/{name}')
                continue
            logger.info(f'=== {cat}/{name} ===')
            local_zip = f'/tmp/{cat_prefix}_{name}.zip'
            s3_main.get(zip_path, local_zip)
            with zipfile.ZipFile(local_zip) as zf:
                videos = [n for n in zf.namelist() if n.endswith('.mp4')]
            logger.info(f'{len(videos)} videos')
            args = [(vf, cat_prefix, name, local_zip, i % 30) for i, vf in enumerate(videos)]
            processed = 0
            with ProcessPoolExecutor(max_workers=30) as executor:
                futures = {executor.submit(process_video_cat, arg): arg for arg in args}
                for future in as_completed(futures):
                    _, success = future.result()
                    if success:
                        processed += 1
                        if processed % 200 == 0:
                            logger.info(f'{processed}/{len(videos)}')
            os.unlink(local_zip)
            logger.info(f'Done: {processed}/{len(videos)}')

    # ── 2. Celeb-DF-v2 ───────────────────────────────────────
    for split in ['Celeb-real', 'Celeb-synthesis', 'YouTube-real']:
        logger.info(f'=== Celeb-DF/{split} ===')
        videos = s3_main.glob(f's3://{bucket}/Celeb-DF-v2/{split}/*.mp4')
        logger.info(f'{len(videos)} videos')
        args = [(vp, split) for vp in videos]
        processed = 0
        with ProcessPoolExecutor(max_workers=30) as executor:
            futures = {executor.submit(process_celeb, arg): arg for arg in args}
            for future in as_completed(futures):
                _, success = future.result()
                if success:
                    processed += 1
                    if processed % 100 == 0:
                        logger.info(f'{processed}/{len(videos)}')
        logger.info(f'Done: {processed}/{len(videos)}')

    # ── 3. WildDeepfake ──────────────────────────────────────
    for split in ['fake_test', 'fake_train', 'real_test', 'real_train']:
        label = 'fake' if 'fake' in split else 'real'
        tar_files = s3_main.glob(f's3://{bucket}/WildDeepfake/deepfake_in_the_wild/{split}/*.tar.gz')
        logger.info(f'=== WildDeepfake/{split} ({len(tar_files)} tars) ===')
        for tar_path in tar_files:
            local_tar = f'/tmp/wild_{Path(tar_path).name}'
            s3_main.get(tar_path, local_tar)
            args = []
            with tarfile.open(local_tar) as tf:
                for member in tf.getmembers():
                    if member.name.endswith('.mp4'):
                        vid = f'{split}_{Path(member.name).stem}'
                        args.append((tf.extractfile(member).read(), vid, label))
            processed = 0
            with ProcessPoolExecutor(max_workers=30) as executor:
                futures = {executor.submit(process_wild, arg): arg for arg in args}
                for future in as_completed(futures):
                    _, success = future.result()
                    if success:
                        processed += 1
            logger.info(f'{Path(tar_path).name}: {processed}/{len(args)}')
            os.unlink(local_tar)

    # ── 4. dfadd ─────────────────────────────────────────────
    arrow_base = f's3://{bucket}/isjwdu___dfadd/default/0.0.0/dfc1eeab3cb0068db8e87a2b89a1ebd103665b1f'
    for arrow_path in sorted(s3_main.glob(f'{arrow_base}/*.arrow')):
        process_dfadd_arrow(arrow_path)

    logger.info('All done!')
