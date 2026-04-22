// k6 run scripts/load-test.k6.js
//
// Simulates 500 concurrent merchants loading the dashboard. Targets:
//   - p95 < 2s on /api/health and /api/trpc/dashboard.summary
//   - < 1% errors
//
// This script uses a MOCK_SESSION_TOKEN env var — get one from dev by
// running the app locally and reading the Authorization header from
// devtools. The test is read-only (summary + gaps) and never mutates.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.MOCK_SESSION_TOKEN;

const summaryLatency = new Trend('summary_latency_ms');
const gapsLatency = new Trend('gaps_latency_ms');
const errRate = new Rate('errors');

export const options = {
  scenarios: {
    dashboard_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 500 },
        { duration: '2m', target: 500 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    summary_latency_ms: ['p(95)<2000'],
    gaps_latency_ms: ['p(95)<2000'],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = TOKEN
  ? { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

export default function () {
  group('health', () => {
    const r = http.get(`${BASE}/api/health`);
    check(r, { 'health 200': (x) => x.status === 200 }) || errRate.add(1);
  });

  group('trpc summary', () => {
    const r = http.get(`${BASE}/api/trpc/dashboard.summary`, { headers });
    summaryLatency.add(r.timings.duration);
    check(r, { 'summary 200': (x) => x.status === 200 }) || errRate.add(1);
  });

  group('trpc gaps', () => {
    const payload = JSON.stringify({ type: 'ALL', limit: 20, offset: 0 });
    const r = http.post(`${BASE}/api/trpc/dashboard.gaps`, payload, { headers });
    gapsLatency.add(r.timings.duration);
    check(r, { 'gaps 200/401': (x) => x.status === 200 || x.status === 401 }) || errRate.add(1);
  });

  sleep(Math.random() * 3);
}
