FROM public.ecr.aws/lambda/python:3.11

# 한글 폰트 (matplotlib 차트용)
RUN yum install -y fontconfig gcc gcc-c++ \
    && yum clean all

# Noto CJK 폰트 직접 다운로드 (AL2023 repo에 패키지 없음)
RUN curl -L -o /usr/share/fonts/NotoSansCJK.ttc \
    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTC/NotoSansCJK-Regular.ttc" \
    && fc-cache -fv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# lambda_handler가 SQS/Function URL 자동 분기
CMD ["main.lambda_handler"]
