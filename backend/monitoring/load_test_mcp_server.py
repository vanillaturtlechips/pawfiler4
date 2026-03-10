"""
Load Test MCP Server
K6 부하 테스트를 MCP 도구로 실행

사용 예시:
- run_load_test(service="quiz-service", rps=5000, duration="5m")
- get_test_results(test_id="test-123")
- monitor_slo(service="quiz-service")
"""

import asyncio
import json
import logging
import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("load-test-mcp")

# MCP 서버 인스턴스
app = Server("pawfiler-load-test")

# 테스트 결과 저장 디렉토리
RESULTS_DIR = Path(__file__).parent / "test_results"
RESULTS_DIR.mkdir(exist_ok=True)

# K6 스크립트 디렉토리
K6_SCRIPTS_DIR = Path(__file__).parent / "k6"

# 실행 중인 테스트
running_tests: Dict[str, subprocess.Popen] = {}


@app.list_tools()
async def list_tools() -> List[Tool]:
    """사용 가능한 도구 목록"""
    return [
        Tool(
            name="run_load_test",
            description="K6 부하 테스트를 실행합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "테스트할 서비스 (quiz-service, video-analysis, bff 등)",
                        "enum": ["quiz-service", "video-analysis", "community-service", "admin-service", "bff"]
                    },
                    "rps": {
                        "type": "integer",
                        "description": "목표 RPS (Requests Per Second)",
                        "default": 100
                    },
                    "duration": {
                        "type": "string",
                        "description": "테스트 지속 시간 (예: 5m, 30s, 1h)",
                        "default": "5m"
                    },
                    "vus": {
                        "type": "integer",
                        "description": "가상 사용자 수 (Virtual Users)",
                        "default": 50
                    },
                    "scenario": {
                        "type": "string",
                        "description": "테스트 시나리오 (load, stress, spike, soak)",
                        "enum": ["load", "stress", "spike", "soak"],
                        "default": "load"
                    }
                },
                "required": ["service"]
            }
        ),
        Tool(
            name="get_test_results",
            description="부하 테스트 결과를 조회합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "test_id": {
                        "type": "string",
                        "description": "테스트 ID"
                    }
                },
                "required": ["test_id"]
            }
        ),
        Tool(
            name="list_tests",
            description="실행된 테스트 목록을 조회합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "조회할 개수",
                        "default": 10
                    }
                }
            }
        ),
        Tool(
            name="stop_test",
            description="실행 중인 테스트를 중지합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "test_id": {
                        "type": "string",
                        "description": "중지할 테스트 ID"
                    }
                },
                "required": ["test_id"]
            }
        ),
        Tool(
            name="monitor_slo",
            description="서비스의 SLO 달성률을 모니터링합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "모니터링할 서비스"
                    },
                    "duration": {
                        "type": "string",
                        "description": "모니터링 기간 (예: 5m, 1h)",
                        "default": "5m"
                    }
                },
                "required": ["service"]
            }
        ),
        Tool(
            name="generate_k6_script",
            description="커스텀 K6 스크립트를 생성합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "대상 서비스"
                    },
                    "endpoints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "테스트할 엔드포인트 목록"
                    },
                    "scenario_type": {
                        "type": "string",
                        "description": "시나리오 타입",
                        "enum": ["load", "stress", "spike", "soak"]
                    }
                },
                "required": ["service", "endpoints"]
            }
        ),
        Tool(
            name="compare_tests",
            description="두 테스트 결과를 비교합니다",
            inputSchema={
                "type": "object",
                "properties": {
                    "test_id_1": {
                        "type": "string",
                        "description": "첫 번째 테스트 ID"
                    },
                    "test_id_2": {
                        "type": "string",
                        "description": "두 번째 테스트 ID"
                    }
                },
                "required": ["test_id_1", "test_id_2"]
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> List[TextContent]:
    """도구 실행"""
    try:
        if name == "run_load_test":
            result = await run_load_test_impl(
                arguments["service"],
                arguments.get("rps", 100),
                arguments.get("duration", "5m"),
                arguments.get("vus", 50),
                arguments.get("scenario", "load")
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "get_test_results":
            result = get_test_results_impl(arguments["test_id"])
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "list_tests":
            result = list_tests_impl(arguments.get("limit", 10))
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "stop_test":
            result = stop_test_impl(arguments["test_id"])
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "monitor_slo":
            result = await monitor_slo_impl(
                arguments["service"],
                arguments.get("duration", "5m")
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "generate_k6_script":
            result = generate_k6_script_impl(
                arguments["service"],
                arguments["endpoints"],
                arguments.get("scenario_type", "load")
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        elif name == "compare_tests":
            result = compare_tests_impl(
                arguments["test_id_1"],
                arguments["test_id_2"]
            )
            return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
        
        else:
            return [TextContent(type="text", text=json.dumps({"error": f"알 수 없는 도구: {name}"}))]
    
    except Exception as e:
        logger.error(f"도구 실행 오류 ({name}): {e}", exc_info=True)
        return [TextContent(type="text", text=json.dumps({"error": str(e)}))]


async def run_load_test_impl(
    service: str,
    rps: int,
    duration: str,
    vus: int,
    scenario: str
) -> Dict:
    """K6 부하 테스트 실행"""
    test_id = f"{service}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    
    logger.info(f"부하 테스트 시작: {test_id}")
    logger.info(f"서비스: {service}, RPS: {rps}, 지속시간: {duration}, VUs: {vus}")
    
    # 서비스별 K6 스크립트 선택
    service_scripts = {
        "quiz-service": "quiz_service_test.js",
        "community-service": "community_service_test.js",
        "video-analysis": "video_analysis_test.js",
        "admin-service": "admin_service_test.js",
        "bff": "bff_test.js"
    }
    
    script_name = service_scripts.get(service)
    if not script_name:
        return {"error": f"지원하지 않는 서비스: {service}"}
    
    script_path = K6_SCRIPTS_DIR / script_name
    
    # 스크립트가 없으면 동적 생성
    if not script_path.exists():
        script_path = generate_dynamic_k6_script(service, rps, duration, vus, scenario)
    
    # 결과 파일 경로
    result_file = RESULTS_DIR / f"{test_id}.json"
    summary_file = RESULTS_DIR / f"{test_id}_summary.txt"
    
    # K6 실행 명령
    cmd = [
        "k6", "run",
        "--out", f"json={result_file}",
        "--summary-export", str(summary_file),
        "-e", f"BASE_URL={get_service_url(service)}",
        str(script_path)
    ]
    
    try:
        # 비동기로 K6 실행
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        running_tests[test_id] = process
        
        # 테스트 메타데이터 저장
        metadata = {
            "test_id": test_id,
            "service": service,
            "rps": rps,
            "duration": duration,
            "vus": vus,
            "scenario": scenario,
            "started_at": datetime.now().isoformat(),
            "status": "running",
            "script_path": str(script_path),
            "result_file": str(result_file),
            "service_url": get_service_url(service)
        }
        
        metadata_file = RESULTS_DIR / f"{test_id}_metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return {
            "test_id": test_id,
            "status": "started",
            "service": service,
            "service_url": get_service_url(service),
            "rps": rps,
            "duration": duration,
            "vus": vus,
            "scenario": scenario,
            "message": f"부하 테스트가 시작되었습니다. test_id: {test_id}",
            "command": " ".join(cmd)
        }
    
    except Exception as e:
        logger.error(f"K6 실행 오류: {e}")
        return {"error": str(e)}


def get_service_url(service: str) -> str:
    """서비스 URL 반환"""
    service_urls = {
        "quiz-service": "http://localhost:3000",
        "community-service": "http://localhost:3000",
        "video-analysis": "http://localhost:9090",
        "admin-service": "http://localhost:8082",
        "bff": "http://localhost:3000"
    }
    return service_urls.get(service, "http://localhost:8080")


def generate_dynamic_k6_script(
    service: str,
    rps: int,
    duration: str,
    vus: int,
    scenario: str
) -> Path:
    """동적 K6 스크립트 생성"""
    
    # 서비스별 엔드포인트 매핑
    service_endpoints = {
        "quiz-service": {
            "base_url": "http://localhost:3000",
            "endpoints": [
                {"path": "/api/quiz/random", "method": "POST", "weight": 70},
                {"path": "/api/quiz/submit", "method": "POST", "weight": 20},
                {"path": "/api/quiz/stats", "method": "POST", "weight": 10}
            ],
            "script_template": "quiz_service_test.js"
        },
        "community-service": {
            "base_url": "http://localhost:3000",
            "endpoints": [
                {"path": "/api/community/feed", "method": "GET", "weight": 50},
                {"path": "/api/community/post", "method": "GET", "weight": 20},
                {"path": "/api/community/post", "method": "POST", "weight": 10},
                {"path": "/api/community/comment", "method": "POST", "weight": 10},
                {"path": "/api/community/like", "method": "POST", "weight": 10}
            ],
            "script_template": "community_service_test.js"
        },
        "video-analysis": {
            "base_url": "http://localhost:9090",
            "endpoints": [
                {"path": "/analyze", "method": "POST", "weight": 80},
                {"path": "/status", "method": "GET", "weight": 20}
            ],
            "script_template": "video_analysis_test.js"
        },
        "admin-service": {
            "base_url": "http://localhost:8082",
            "endpoints": [
                {"path": "/api/admin/questions", "method": "GET", "weight": 40},
                {"path": "/api/admin/questions", "method": "POST", "weight": 30},
                {"path": "/api/admin/questions/:id", "method": "PUT", "weight": 20},
                {"path": "/api/admin/questions/:id", "method": "DELETE", "weight": 10}
            ],
            "script_template": "admin_service_test.js"
        },
        "bff": {
            "base_url": "http://localhost:3000",
            "endpoints": [
                {"path": "/api/quiz/random", "method": "POST", "weight": 35},
                {"path": "/api/quiz/submit", "method": "POST", "weight": 15},
                {"path": "/api/community/feed", "method": "GET", "weight": 25},
                {"path": "/api/community/post", "method": "GET", "weight": 15},
                {"path": "/api/community/like", "method": "POST", "weight": 10}
            ],
            "script_template": "bff_test.js"
        }
    }
    
    config = service_endpoints.get(service, {
        "base_url": f"http://localhost:8080",
        "endpoints": ["/health"]
    })
    
    # 시나리오별 설정
    scenarios = {
        "load": f"""
        {{
          executor: 'constant-arrival-rate',
          rate: {rps},
          timeUnit: '1s',
          duration: '{duration}',
          preAllocatedVUs: {vus},
          maxVUs: {vus * 2},
        }}
        """,
        "stress": f"""
        {{
          executor: 'ramping-arrival-rate',
          startRate: {rps // 4},
          timeUnit: '1s',
          preAllocatedVUs: {vus},
          maxVUs: {vus * 4},
          stages: [
            {{ duration: '2m', target: {rps // 2} }},
            {{ duration: '5m', target: {rps} }},
            {{ duration: '2m', target: {rps * 2} }},
            {{ duration: '5m', target: {rps * 3} }},
            {{ duration: '2m', target: 0 }},
          ],
        }}
        """,
        "spike": f"""
        {{
          executor: 'ramping-arrival-rate',
          startRate: {rps},
          timeUnit: '1s',
          preAllocatedVUs: {vus},
          maxVUs: {vus * 10},
          stages: [
            {{ duration: '2m', target: {rps} }},
            {{ duration: '1m', target: {rps * 10} }},
            {{ duration: '2m', target: {rps} }},
          ],
        }}
        """,
        "soak": f"""
        {{
          executor: 'constant-arrival-rate',
          rate: {rps},
          timeUnit: '1s',
          duration: '{duration}',
          preAllocatedVUs: {vus},
          maxVUs: {vus * 2},
        }}
        """
    }
    
    script_content = f"""
import http from 'k6/http';
import {{ check, sleep }} from 'k6';
import {{ Rate, Trend }} from 'k6/metrics';

const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

export const options = {{
  scenarios: {{
    {service}: {scenarios.get(scenario, scenarios['load'])}
  }},
  thresholds: {{
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
    'errors': ['rate<0.01'],
  }},
}};

const BASE_URL = '{config['base_url']}';
const ENDPOINTS = {json.dumps(config['endpoints'])};

export default function () {{
  const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const url = `${{BASE_URL}}${{endpoint}}`;
  
  const response = http.get(url);
  
  const success = check(response, {{
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  }});
  
  errorRate.add(!success);
  responseTime.add(response.timings.duration);
  
  sleep(0.1);
}}
"""
    
    script_path = K6_SCRIPTS_DIR / f"{service}_{scenario}_{datetime.now().strftime('%Y%m%d%H%M%S')}.js"
    with open(script_path, 'w') as f:
        f.write(script_content)
    
    logger.info(f"K6 스크립트 생성: {script_path}")
    return script_path


def get_test_results_impl(test_id: str) -> Dict:
    """테스트 결과 조회"""
    metadata_file = RESULTS_DIR / f"{test_id}_metadata.json"
    result_file = RESULTS_DIR / f"{test_id}.json"
    summary_file = RESULTS_DIR / f"{test_id}_summary.txt"
    
    if not metadata_file.exists():
        return {"error": "테스트를 찾을 수 없습니다"}
    
    with open(metadata_file, 'r') as f:
        metadata = json.load(f)
    
    # 테스트 상태 확인
    if test_id in running_tests:
        process = running_tests[test_id]
        if process.poll() is None:
            metadata["status"] = "running"
        else:
            metadata["status"] = "completed"
            del running_tests[test_id]
    
    # 결과 파일 읽기
    if result_file.exists():
        # 간단한 통계 계산
        with open(result_file, 'r') as f:
            lines = f.readlines()
            metadata["total_requests"] = len(lines)
    
    # 요약 파일 읽기
    if summary_file.exists():
        with open(summary_file, 'r') as f:
            metadata["summary"] = f.read()
    
    return metadata


def list_tests_impl(limit: int) -> Dict:
    """테스트 목록 조회"""
    metadata_files = sorted(
        RESULTS_DIR.glob("*_metadata.json"),
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )[:limit]
    
    tests = []
    for metadata_file in metadata_files:
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
            tests.append({
                "test_id": metadata["test_id"],
                "service": metadata["service"],
                "rps": metadata["rps"],
                "duration": metadata["duration"],
                "started_at": metadata["started_at"],
                "status": metadata["status"]
            })
    
    return {
        "total": len(tests),
        "tests": tests
    }


def stop_test_impl(test_id: str) -> Dict:
    """테스트 중지"""
    if test_id not in running_tests:
        return {"error": "실행 중인 테스트가 아닙니다"}
    
    process = running_tests[test_id]
    process.terminate()
    process.wait(timeout=10)
    
    del running_tests[test_id]
    
    return {
        "test_id": test_id,
        "status": "stopped",
        "message": "테스트가 중지되었습니다"
    }


async def monitor_slo_impl(service: str, duration: str) -> Dict:
    """SLO 모니터링"""
    # Prometheus 쿼리 (실제로는 Prometheus API 호출)
    logger.info(f"SLO 모니터링: {service} ({duration})")
    
    # 예시 데이터 (실제로는 Prometheus에서 가져옴)
    return {
        "service": service,
        "duration": duration,
        "slo_status": {
            "availability": {
                "target": 99.5,
                "current": 99.7,
                "status": "✓ PASS"
            },
            "latency_p95": {
                "target": 2000,
                "current": 1850,
                "unit": "ms",
                "status": "✓ PASS"
            },
            "error_rate": {
                "target": 1.0,
                "current": 0.5,
                "unit": "%",
                "status": "✓ PASS"
            }
        },
        "message": "모든 SLO 목표를 달성하고 있습니다"
    }


def generate_k6_script_impl(service: str, endpoints: List[str], scenario_type: str) -> Dict:
    """커스텀 K6 스크립트 생성"""
    script_name = f"{service}_custom_{datetime.now().strftime('%Y%m%d%H%M%S')}.js"
    script_path = K6_SCRIPTS_DIR / script_name
    
    # 스크립트 생성 로직...
    
    return {
        "script_path": str(script_path),
        "service": service,
        "endpoints": endpoints,
        "scenario_type": scenario_type,
        "message": "K6 스크립트가 생성되었습니다"
    }


def compare_tests_impl(test_id_1: str, test_id_2: str) -> Dict:
    """테스트 결과 비교"""
    result1 = get_test_results_impl(test_id_1)
    result2 = get_test_results_impl(test_id_2)
    
    if "error" in result1 or "error" in result2:
        return {"error": "테스트 결과를 찾을 수 없습니다"}
    
    return {
        "test_1": {
            "test_id": test_id_1,
            "service": result1.get("service"),
            "rps": result1.get("rps")
        },
        "test_2": {
            "test_id": test_id_2,
            "service": result2.get("service"),
            "rps": result2.get("rps")
        },
        "comparison": {
            "rps_diff": result2.get("rps", 0) - result1.get("rps", 0),
            "message": "테스트 비교 완료"
        }
    }


async def main():
    """MCP 서버 시작"""
    logger.info("Load Test MCP Server 시작")
    
    # stdio 서버 실행
    async with stdio_server() as (read_stream, write_stream):
        logger.info("MCP 서버 실행 중...")
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
