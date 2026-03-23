import boto3
import tarfile
import json
from concurrent.futures import ThreadPoolExecutor

session = boto3.session.Session(region_name='ap-northeast-2')
s3 = session.client('s3', config=boto3.session.Config(max_pool_connections=100))

BUCKET = 'ai-preprocessing'
PREFIX = 'webdataset/'
START, END = 0, 6998
TARGET_CLASSES = {'real', 'opensource_v2v_cogvideox1.5', 'opensource_v2v_ltx'}

def peek_shard(shard_num):
    key = f"{PREFIX}dataset_{shard_num:05d}.tar"
    found = set()
    try:
        response = s3.get_object(Bucket=BUCKET, Key=key)
        with tarfile.open(fileobj=response['Body'], mode='r|*') as tar:
            for member in tar:
                if not (member.name.endswith('.cls') or member.name.endswith('.txt')):
                    continue
                f = tar.extractfile(member)
                if f:
                    label = f.read().decode('utf-8').strip().lower()
                    for t in TARGET_CLASSES:
                        if t in label:
                            found.add(t)
                # 타겟 3개 다 찾으면 조기 종료
                if found == TARGET_CLASSES:
                    break
    except Exception:
        pass
    return shard_num, found

print(f"🚀 인덱싱 시작: {START}~{END} (타겟: {TARGET_CLASSES})")
target_shards = {t: [] for t in TARGET_CLASSES}

from concurrent.futures import ThreadPoolExecutor, as_completed

print(f"🚀 인덱싱 시작: {START}~{END} (타겟: {TARGET_CLASSES})")
target_shards = {t: [] for t in TARGET_CLASSES}
completed = 0

with ThreadPoolExecutor(max_workers=50) as executor:
    futures = {executor.submit(peek_shard, i): i for i in range(START, END + 1)}
    for future in as_completed(futures):
        shard_num, found = future.result()
        key = f"s3://{BUCKET}/{PREFIX}dataset_{shard_num:05d}.tar"
        for t in found:
            target_shards[t].append(key)
        if found:
            print(f"✅ {shard_num:05d}: {found}", flush=True)
        completed += 1
        if completed % 100 == 0:
            total = sum(len(v) for v in target_shards.values())
            print(f"  [{completed}/{END}] 발견 누적: {total}개", flush=True)

with open("target_shards.json", "w") as f:
    json.dump(target_shards, f, indent=2)

for t, shards in target_shards.items():
    print(f"{t}: {len(shards)}개 샤드")
print("결과 저장: target_shards.json")
