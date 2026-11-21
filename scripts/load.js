/* eslint-disable */
// scripts/load.js — k6 load testing script with ramping stages for scaling demos

import http from 'k6/http';
import { check, sleep } from 'k6';

// Ramping stages configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp-up to 10 VUs
    { duration: '1m', target: 30 },  // Ramp-up to 30 VUs
    { duration: '1m', target: 50 },  // Surge to 50 VUs (trigger autoscale)
    { duration: '30s', target: 0 },  // Ramp-down to 0 VUs
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests within 2s
    http_req_failed: ['rate<0.05'],    // Less than 5% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. GET /api/videos?limit=10 (simulate feed browsing)
  const feedRes = http.get(`${BASE_URL}/api/videos?limit=10`, {
    tags: { name: 'GetVideosFeed' },
  });

  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
    'feed returns JSON': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('application/json'),
  });

  sleep(0.3);

  // 2. GET /api/debug/burn?ms=150 (simulate CPU load to trigger replica autoscale)
  const burnRes = http.get(`${BASE_URL}/api/debug/burn?ms=150`, {
    tags: { name: 'CpuBurnLoad' },
  });

  check(burnRes, {
    'burn status is 200': (r) => r.status === 200,
    'burn execution reported': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.burned >= 150;
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.5);
}
