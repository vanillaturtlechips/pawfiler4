#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MCP Server
const server = new Server(
  {
    name: 'pawfiler-load-test',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Parse natural language to test parameters
function parseLoadTestRequest(naturalLanguage) {
  const text = naturalLanguage.toLowerCase();
  
  // Extract service
  let service = 'quiz';
  if (text.includes('community')) service = 'community';
  if (text.includes('admin')) service = 'admin';
  if (text.includes('video') || text.includes('analysis')) service = 'video-analysis';
  
  // Extract environment
  let environment = 'local';
  if (text.includes('staging')) environment = 'staging';
  if (text.includes('production') || text.includes('prod')) environment = 'production';
  
  // Extract VUs (virtual users)
  const vuMatch = text.match(/(\d+)\s*(명|users?|vus?)/i);
  const vus = vuMatch ? parseInt(vuMatch[1]) : 50;
  
  // Extract duration
  const durationMatch = text.match(/(\d+)\s*(분|minutes?|m)/i);
  const duration = durationMatch ? `${durationMatch[1]}m` : '2m';
  
  return { service, environment, vus, duration };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'run_load_test',
        description: '자연어로 부하테스트를 실행합니다. 예: "quiz-service에 50명 2분간 부하테스트"',
        inputSchema: {
          type: 'object',
          properties: {
            request: {
              type: 'string',
              description: '자연어 요청 (예: "quiz 서비스에 100명 동시접속 5분간 테스트")',
            },
          },
          required: ['request'],
        },
      },
      {
        name: 'get_latest_report',
        description: '가장 최근 부하테스트 리포트를 가져옵니다',
        inputSchema: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: '서비스 이름 (quiz, community, admin, video-analysis)',
            },
            environment: {
              type: 'string',
              description: '환경 (local, staging, production)',
              default: 'local',
            },
          },
          required: ['service'],
        },
      },
      {
        name: 'compare_results',
        description: '두 환경의 테스트 결과를 비교합니다',
        inputSchema: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: '서비스 이름',
            },
            env1: {
              type: 'string',
              description: '첫 번째 환경',
            },
            env2: {
              type: 'string',
              description: '두 번째 환경',
            },
          },
          required: ['service', 'env1', 'env2'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'run_load_test') {
      const { request: naturalLanguage } = args;
      const { service, environment, vus, duration } = parseLoadTestRequest(naturalLanguage);
      
      // Run load test
      const scriptPath = path.join(__dirname, '..', 'run.sh');
      const { stdout, stderr } = await execAsync(
        `cd ${path.join(__dirname, '..')} && ./run.sh ${service} ${environment}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      
      // Get latest report
      const reportsDir = path.join(__dirname, '..', 'reports');
      const { stdout: reportFiles } = await execAsync(
        `ls -t ${reportsDir}/${service}-${environment}-*.md | head -1`
      );
      
      const reportFile = reportFiles.trim();
      let report = '';
      if (reportFile) {
        report = await readFile(reportFile, 'utf-8');
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ 부하테스트 완료!\n\n**설정:**\n- 서비스: ${service}\n- 환경: ${environment}\n- VUs: ${vus}\n- 시간: ${duration}\n\n**결과:**\n\n${report}\n\n**상세 로그:**\n${stdout}`,
          },
        ],
      };
    }
    
    if (name === 'get_latest_report') {
      const { service, environment = 'local' } = args;
      
      const reportsDir = path.join(__dirname, '..', 'reports');
      const { stdout: reportFiles } = await execAsync(
        `ls -t ${reportsDir}/${service}-${environment}-*.md | head -1`
      );
      
      const reportFile = reportFiles.trim();
      if (!reportFile) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ ${service} (${environment}) 환경의 리포트를 찾을 수 없습니다.`,
            },
          ],
        };
      }
      
      const report = await readFile(reportFile, 'utf-8');
      
      return {
        content: [
          {
            type: 'text',
            text: report,
          },
        ],
      };
    }
    
    if (name === 'compare_results') {
      const { service, env1, env2 } = args;
      
      return {
        content: [
          {
            type: 'text',
            text: `🔄 ${service} 서비스의 ${env1} vs ${env2} 비교 기능은 곧 추가됩니다.`,
          },
        ],
      };
    }
    
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ 오류 발생: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PawFiler Load Test MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
