# Terraform 참고 문서

이 폴더에는 상세한 참고 문서와 레거시 스크립트가 포함되어 있습니다.

## 📚 문서

- **FILE_STRUCTURE.md** - 각 .tf 파일의 역할과 비용 전략
- **PREVENT_DESTROY.md** - 리소스 삭제 방지 정책 상세 설명
- **EKS_IAM_SETUP.md** - EKS IAM 설정 가이드
- **CHEATSHEET.md** - Terraform 명령어 치트시트
- **STATUS.md** - 현재 인프라 상태

## 🔧 레거시 스크립트

개별 스크립트들은 `../infra.sh`로 통합되었습니다.
필요시 참고용으로 보관:

- start-eks.sh
- stop-eks.sh
- start-bastion.sh
- stop-bastion.sh
- apply-base.sh

## 💡 사용법

메인 디렉토리에서 `./infra.sh`를 사용하세요.
