#!/usr/bin/env python3
import json
import sys
from datetime import datetime
from pathlib import Path

def analyze_k6_results(result_file, report_file):
    """Analyze k6 JSON results and generate markdown report"""
    
    # Read k6 results
    with open(result_file, 'r') as f:
        lines = f.readlines()
    
    # Parse metrics from last line (summary)
    metrics = {}
    for line in lines:
        try:
            data = json.loads(line)
            if data.get('type') == 'Point':
                metric_name = data.get('metric')
                value = data.get('data', {}).get('value')
                if metric_name and value is not None:
                    if metric_name not in metrics:
                        metrics[metric_name] = []
                    metrics[metric_name].append(value)
        except json.JSONDecodeError:
            continue
    
    # Calculate statistics
    def percentile(values, p):
        if not values:
            return 0
        sorted_values = sorted(values)
        index = int(len(sorted_values) * p / 100)
        return sorted_values[min(index, len(sorted_values) - 1)]
    
    http_req_duration = metrics.get('http_req_duration', [])
    http_req_failed = metrics.get('http_req_failed', [])
    
    p50 = percentile(http_req_duration, 50)
    p95 = percentile(http_req_duration, 95)
    p99 = percentile(http_req_duration, 99)
    error_rate = sum(http_req_failed) / len(http_req_failed) if http_req_failed else 0
    
    # SLO thresholds
    slo_p50 = 150
    slo_p95 = 250
    slo_p99 = 350
    slo_error_rate = 0.01
    
    # Calculate SLO score
    score = 100
    if p50 > slo_p50:
        score -= 20
    if p95 > slo_p95:
        score -= 30
    if p99 > slo_p99:
        score -= 20
    if error_rate > slo_error_rate:
        score -= 30
    
    # Generate report
    report = f"""# Load Test Report

**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  
**Result File:** {result_file}

## 📊 Performance Metrics

| Metric | Value | SLO | Status |
|--------|-------|-----|--------|
| **P50 Response Time** | {p50:.2f}ms | < {slo_p50}ms | {'✅' if p50 <= slo_p50 else '❌'} |
| **P95 Response Time** | {p95:.2f}ms | < {slo_p95}ms | {'✅' if p95 <= slo_p95 else '❌'} |
| **P99 Response Time** | {p99:.2f}ms | < {slo_p99}ms | {'✅' if p99 <= slo_p99 else '❌'} |
| **Error Rate** | {error_rate*100:.2f}% | < {slo_error_rate*100}% | {'✅' if error_rate <= slo_error_rate else '❌'} |

## 🎯 SLO Score: {score}/100

{'✅ **PASSED** - All SLO targets met!' if score >= 80 else '⚠️ **NEEDS IMPROVEMENT** - Some SLO targets not met.'}

## 📈 Recommendations

"""
    
    if p95 > slo_p95:
        report += "- ⚠️ P95 response time exceeds target. Consider optimizing database queries or adding caching.\n"
    if p99 > slo_p99:
        report += "- ⚠️ P99 response time exceeds target. Investigate slow outliers and optimize worst-case scenarios.\n"
    if error_rate > slo_error_rate:
        report += "- ⚠️ Error rate too high. Check application logs for errors.\n"
    if score >= 80:
        report += "- ✅ All metrics within acceptable range. Consider tightening SLO targets for continuous improvement.\n"
    
    # Write report
    with open(report_file, 'w') as f:
        f.write(report)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"SLO Score: {score}/100")
    print(f"P50: {p50:.2f}ms | P95: {p95:.2f}ms | P99: {p99:.2f}ms")
    print(f"Error Rate: {error_rate*100:.2f}%")
    print(f"{'='*60}\n")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: analyze.py <result_file> <report_file>")
        sys.exit(1)
    
    result_file = sys.argv[1]
    report_file = sys.argv[2]
    
    analyze_k6_results(result_file, report_file)
