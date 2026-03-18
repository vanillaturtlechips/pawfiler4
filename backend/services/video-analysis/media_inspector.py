"""미디어 메타데이터 검사"""
import subprocess
import json
from typing import Dict, Optional


def _parse_frame_rate(s: str) -> float:
    """Parse a frame rate string such as '30000/1001' or '25' safely.

    Replaces the previous eval() call which was a remote-code-execution risk
    when ffprobe output is sourced from an untrusted video file.
    """
    try:
        if '/' in s:
            num, den = s.split('/', 1)
            return int(num) / int(den) if int(den) != 0 else 0.0
        return float(s)
    except Exception:
        return 0.0


class MediaInspector:
    @staticmethod
    def inspect(video_path: str) -> Dict:
        """ffprobe로 메타데이터 추출"""
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            video_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)

        video_stream = next((s for s in data['streams'] if s['codec_type'] == 'video'), None)
        audio_stream = next((s for s in data['streams'] if s['codec_type'] == 'audio'), None)

        return {
            'has_video': video_stream is not None,
            'has_audio': audio_stream is not None,
            'duration': float(data['format'].get('duration', 0)),
            'width': video_stream.get('width', 0) if video_stream else 0,
            'height': video_stream.get('height', 0) if video_stream else 0,
            'fps': _parse_frame_rate(video_stream.get('r_frame_rate', '0/1')) if video_stream else 0,
            'codec': video_stream.get('codec_name', '') if video_stream else '',
            'audio_codec': audio_stream.get('codec_name', '') if audio_stream else '',
        }
