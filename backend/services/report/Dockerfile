FROM public.ecr.aws/lambda/python:3.11

# 한글 폰트 (matplotlib 차트용) — fontconfig만 필요, gcc 불필요 (psycopg2-binary는 pre-compiled)
RUN yum install -y fontconfig \
    && yum clean all

# Noto Sans CJK KR OTF (~4MB) — OTC 전체 파일(~50MB) 대신 KR 서브셋만 사용
RUN curl -L -o /usr/share/fonts/NotoSansCJKkr-Regular.otf \
    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf" \
    && fc-cache -fv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

CMD ["main.lambda_handler"]
