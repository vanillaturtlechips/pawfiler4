import sagemaker
from sagemaker.pytorch import PyTorch

# 1. SageMaker 세션 및 권한 설정
sagemaker_session = sagemaker.Session()
# SageMaker 실행 역할(Role) ARN을 입력하세요. 
# (IAM에서 SageMaker가 S3와 EC2에 접근할 수 있는 권한이 부여된 역할)
role = "arn:aws:iam::009946608368:role/service-role/AmazonSageMaker-ExecutionRole"

# 2. 하이퍼파라미터 정의 (여기서 자유롭게 튜닝 값을 바꿀 수 있습니다)
hyperparameters = {
    'epochs': 5,
    'batch_size': 32,
    'learning_rate': 0.0003,
    'cascade_threshold': 0.75,
}

# 3. PyTorch Estimator 생성 (학습 환경 정의)
estimator = PyTorch(
    entry_point='train3.py', # 방금 위에서 만든 파일 이름
    source_dir='/home/user/Downloads/sage', # train3.py가 있는 로컬 디렉토리
    role=role,
    framework_version='2.0.0',        # 사용 중인 PyTorch 버전
    py_version='py310',
    instance_count=1,
    instance_type='ml.g5.12xlarge',   # g6가 SageMaker에 없으면 g5(A10G) 사용 권장
    hyperparameters=hyperparameters,
    
    # === 스팟 인스턴스 설정 (비용 최대 70% 절감) ===
    use_spot_instances=True,
    max_run=86400,                    # 최대 학습 허용 시간 (초) - 24시간
    max_wait=86400 + 3600,            # 스팟 인스턴스를 기다리는 최대 시간 (초)
    checkpoint_s3_uri='s3://ai-preprocessing/sagemaker/checkpoints/', # 스팟 중단 시 저장될 S3 경로
    
    # 모델 결과물이 저장될 S3 경로
    output_path='s3://ai-preprocessing/sagemaker/models/',

    # VPC 설정 (S3 Gateway Endpoint로 데이터 로딩 속도 향상)
    subnets=['subnet-0dbec778d8a32bd57', 'subnet-024efc2ffafa1cd48'],
    security_group_ids=['sg-07f53df04cf46e7e2'],
)

# 4. 학습 작업(Job) 실행
print("🚀 SageMaker Training Job을 시작합니다...")
estimator.fit()
