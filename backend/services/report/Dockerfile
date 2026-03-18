FROM public.ecr.aws/lambda/python:3.11

# 한글 폰트 (matplotlib 차트용)
RUN dnf install -y google-noto-cjk-fonts fontconfig \
    && fc-cache -fv \
    && dnf clean all

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# SQS 트리거: sqs_handler / API Gateway: lambda_handler
CMD ["main.sqs_handler"]
