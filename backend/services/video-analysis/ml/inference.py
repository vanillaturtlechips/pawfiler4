"""SageMaker 추론 엔드포인트 (Spot 인스턴스)"""
import json
import torch
import cv2
import numpy as np
from timm import create_model
from torchvision import transforms
import io
import base64


def model_fn(model_dir):
    """모델 로드"""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = create_model('mobilevitv2_050', pretrained=False, num_classes=2)
    model.load_state_dict(torch.load(f"{model_dir}/mobilevit_v2_best.pth", map_location=device))
    model.to(device)
    model.eval()
    return model


def input_fn(request_body, content_type):
    """입력 전처리"""
    if content_type == 'application/json':
        data = json.loads(request_body)
        # base64 인코딩된 프레임들
        frames = [base64.b64decode(f) for f in data['frames']]
        return frames
    raise ValueError(f"Unsupported content type: {content_type}")


def predict_fn(frames, model):
    """추론"""
    device = next(model.parameters()).device
    transform = transforms.Compose([
        transforms.ToPILImage(),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    
    # 프레임별 예측
    predictions = []
    with torch.no_grad():
        for frame_bytes in frames:
            img = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            tensor = transform(img).unsqueeze(0).to(device)
            
            output = model(tensor)
            prob = torch.softmax(output, dim=1)
            predictions.append(prob[0].cpu().numpy())
    
    # 평균 confidence
    avg_pred = np.mean(predictions, axis=0)
    confidence = float(avg_pred[1])  # fake 확률
    verdict = "fake" if confidence > 0.5 else "real"
    
    return {
        "verdict": verdict,
        "confidence": confidence,
        "frame_count": len(frames)
    }


def output_fn(prediction, accept):
    """출력 포맷"""
    if accept == 'application/json':
        return json.dumps(prediction), accept
    raise ValueError(f"Unsupported accept type: {accept}")
