FROM public.ecr.aws/lambda/python:3.11

# 한글 폰트 + matplotlib C extension 빌드용 gcc
RUN yum install -y fontconfig gcc gcc-c++ \
    && yum clean all

# Noto Sans CJK KR OTF (~4MB) — OTC 전체 파일(~50MB) 대신 KR 서브셋만 사용
RUN curl -L --retry 3 --retry-delay 2 -o /usr/share/fonts/NotoSansCJKkr-Regular.otf \
    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf" \
    && fc-cache -fv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

CMD ["main.lambda_handler"]
