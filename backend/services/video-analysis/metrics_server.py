"""
Prometheus 메트릭 HTTP 서버
MCP 서버와 별도로 실행되어 메트릭을 노출
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import logging
from mcp_metrics import get_metrics, get_metrics_content_type

logger = logging.getLogger(__name__)

class MetricsHandler(BaseHTTPRequestHandler):
    """메트릭 HTTP 핸들러"""
    
    def do_GET(self):
        """GET 요청 처리"""
        if self.path == '/metrics':
            # Prometheus 메트릭 반환
            self.send_response(200)
            self.send_header('Content-Type', get_metrics_content_type())
            self.end_headers()
            self.wfile.write(get_metrics())
        elif self.path == '/health':
            # 헬스 체크
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"healthy"}')
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        """로그 메시지 (조용히)"""
        pass


def start_metrics_server(port: int = 9090):
    """메트릭 서버 시작"""
    server = HTTPServer(('0.0.0.0', port), MetricsHandler)
    logger.info(f"Prometheus 메트릭 서버 시작: http://0.0.0.0:{port}/metrics")
    server.serve_forever()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    start_metrics_server()
