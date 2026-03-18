import boto3
import tarfile
import io
import json
import random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

SOURCE_BUCKET = 'ai-preprocessing'
SOURCE_PREFIX = 'preprocessed/'
DEST_PREFIX = 'webdataset/'
META_KEY = 'webdataset/meta/chunks.json'
FILES_PER_TAR = 5000
MAX_WORKERS = 8

s3 = boto3.client('s3', region_name='ap-northeast-2')

def get_label(key):
    parts = key.split('/')
    dataset = parts[1]
    if dataset == 'aigvdbench':
        return parts[2]
    elif dataset == 'celeb-df':
        return 'real' if 'real' in parts[2].lower() else 'fake'
    elif dataset == 'wilddeepfake':
        return 'fake' if 'fake' in key else 'real'
    elif dataset == 'dfadd':
        return 'audio_fake'
    return 'unknown'

def already_done(idx):
    try:
        s3.head_object(Bucket=SOURCE_BUCKET, Key=f"{DEST_PREFIX}dataset_{idx:05d}.tar")
        return True
    except:
        return False

def build_and_save_chunks():
    """파일 목록 스캔 후 S3에 청크 메타데이터 저장"""
    print("S3 스캔 중...")
    label_keys = defaultdict(list)
    paginator = s3.get_paginator('list_objects_v2')
    count = 0
    for page in paginator.paginate(Bucket=SOURCE_BUCKET, Prefix=SOURCE_PREFIX):
        for obj in page.get('Contents', []):
            k = obj['Key']
            if k.endswith('.npz'):
                label_keys[get_label(k)].append(k)
                count += 1
                if count % 100000 == 0:
                    print(f"  {count:,}개 스캔됨")

    for l, keys in label_keys.items():
        random.shuffle(keys)
        print(f"  {l}: {len(keys):,}")

    # Round-Robin 균등 분배
    balanced, iters = [], {l: iter(k) for l, k in label_keys.items()}
    active = list(iters)
    while active:
        for l in list(active):
            try:
                balanced.append((next(iters[l]), l))
            except StopIteration:
                active.remove(l)

    # 청크로 나눠서 S3에 저장 (메모리 해제)
    del label_keys, iters
    chunks = [balanced[i:i+FILES_PER_TAR] for i in range(0, len(balanced), FILES_PER_TAR)]
    total = len(chunks)
    del balanced

    print(f"총 {total}개 tar 예정. S3에 메타데이터 저장 중...")
    s3.put_object(
        Bucket=SOURCE_BUCKET,
        Key=META_KEY,
        Body=json.dumps({'total': total, 'chunks': chunks}).encode()
    )
    del chunks
    print("메타데이터 저장 완료")
    return total

def load_chunk(idx):
    """S3에서 특정 청크만 읽기"""
    obj = s3.get_object(Bucket=SOURCE_BUCKET, Key=META_KEY)
    data = json.loads(obj['Body'].read())
    return data['chunks'][idx]

def make_tar(idx):
    if already_done(idx):
        return f"SKIP dataset_{idx:05d}.tar"
    chunk = load_chunk(idx)
    buf = io.BytesIO()
    try:
        with tarfile.open(fileobj=buf, mode='w') as tar:
            for i, (key, label) in enumerate(chunk):
                data = s3.get_object(Bucket=SOURCE_BUCKET, Key=key)['Body'].read()
                for name, content in [(f"{i:05d}.npz", data), (f"{i:05d}.cls", label.encode())]:
                    info = tarfile.TarInfo(name=name)
                    info.size = len(content)
                    tar.addfile(info, io.BytesIO(content))
        buf.seek(0)
        s3.upload_fileobj(buf, SOURCE_BUCKET, f"{DEST_PREFIX}dataset_{idx:05d}.tar")
        return f"OK  dataset_{idx:05d}.tar ({len(chunk)} files)"
    except Exception as e:
        return f"ERR dataset_{idx:05d}.tar: {e}"
    finally:
        buf.close()

if __name__ == '__main__':
    # 메타데이터 없으면 스캔, 있으면 재사용
    try:
        s3.head_object(Bucket=SOURCE_BUCKET, Key=META_KEY)
        total = json.loads(s3.get_object(Bucket=SOURCE_BUCKET, Key=META_KEY)['Body'].read())['total']
        print(f"기존 메타데이터 재사용: {total}개 tar")
    except:
        total = build_and_save_chunks()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for f in as_completed({ex.submit(make_tar, i): i for i in range(total)}):
            print(f.result())
    print("완료!")
