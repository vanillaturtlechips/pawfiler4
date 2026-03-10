#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVICE=$1
ENV=${2:-local}

if [ -z "$SERVICE" ]; then
  echo -e "${RED}Usage: $0 <service> [environment]${NC}"
  echo "Services: quiz, community, admin, video-analysis"
  echo "Environments: local, staging, production (default: local)"
  exit 1
fi

# Set API URL based on environment
case $ENV in
  local)
    API_URL=${API_URL:-http://localhost:8080}
    ;;
  staging)
    API_URL=${API_URL:-https://staging-api.pawfiler.com}
    ;;
  production)
    API_URL=${API_URL:-https://api.pawfiler.com}
    ;;
  *)
    echo -e "${RED}Invalid environment: $ENV${NC}"
    exit 1
    ;;
esac

SCENARIO_FILE="scenarios/${SERVICE}-service.js"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULT_DIR="results/$ENV"
RESULT_FILE="$RESULT_DIR/${SERVICE}-${TIMESTAMP}.json"
REPORT_FILE="reports/${SERVICE}-${ENV}-${TIMESTAMP}.md"

# Check if scenario exists
if [ ! -f "$SCENARIO_FILE" ]; then
  echo -e "${RED}Scenario file not found: $SCENARIO_FILE${NC}"
  exit 1
fi

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}k6 is not installed. Install it first:${NC}"
  echo "https://k6.io/docs/getting-started/installation/"
  exit 1
fi

mkdir -p "$RESULT_DIR" reports

echo -e "${GREEN}🚀 Starting load test...${NC}"
echo "Service: $SERVICE"
echo "Environment: $ENV"
echo "API URL: $API_URL"
echo "Scenario: $SCENARIO_FILE"
echo ""

# Run k6 test
k6 run \
  --env API_URL="$API_URL" \
  --out json="$RESULT_FILE" \
  "$SCENARIO_FILE"

echo ""
echo -e "${GREEN}✅ Test completed!${NC}"
echo "Results saved to: $RESULT_FILE"

# Analyze results
if [ -f "analyze.py" ]; then
  echo ""
  echo -e "${YELLOW}📊 Analyzing results...${NC}"
  python3 analyze.py "$RESULT_FILE" "$REPORT_FILE"
  echo -e "${GREEN}Report saved to: $REPORT_FILE${NC}"
else
  echo -e "${YELLOW}⚠️  analyze.py not found. Skipping analysis.${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"
