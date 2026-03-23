FROM public.ecr.aws/lambda/python:3.11

# 한글 폰트 + gcc (psycopg2-binary는 pre-compiled, contourpy wheel 사용으로 불필요)
RUN yum install -y fontconfig \
    && yum clean all

# Noto Sans CJK KR OTF (~4MB) — OTC 전체 파일(~50MB) 대신 KR 서브셋만 사용
RUN curl -L --retry 3 --retry-delay 2 -o /usr/share/fonts/NotoSansCJKkr-Regular.otf \
    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf" \
    && fc-cache -fv

COPY requirements.txt .
# contourpy를 먼저 고정 설치 후 나머지 설치 (matplotlib의 contourpy>=1.0.1 의존성 override)
RUN pip install --no-cache-dir contourpy==1.2.1 \
    && pip install --no-cache-dir -r requirements.txt

COPY main.py .

CMD ["main.lambda_handler"]
