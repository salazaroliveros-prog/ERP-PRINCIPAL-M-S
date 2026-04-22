#!/usr/bin/env node

import 'dotenv/config';

const apiBaseUrl = (process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'https://salazaroliveros-prog.github.io').trim();
const verifyUserEmail = (process.env.VERIFY_USER_EMAIL || 'ci-check@local.test').trim().toLowerCase();

if (!apiBaseUrl) {
  console.error('ERROR: API_BASE_URL no esta configurado.');
  process.exit(1);
}

const checks = [
  { name: 'health', path: '/api/health' },
  { name: 'projects', path: '/api/projects' },
  { name: 'notifications', path: '/api/notifications?limit=1&offset=0' },
  { name: 'subcontracts', path: '/api/subcontracts?status=Active' },
  { name: 'transactions', path: '/api/transactions?limit=1' },
  { name: 'workflows', path: '/api/workflows?status=pending' },
  { name: 'inventory', path: '/api/inventory?limit=1' },
];

function ok(label) {
  console.log(`OK   ${label}`);
}

function fail(label, message) {
  console.error(`FAIL ${label} -> ${message}`);
}

async function fetchCheck(label, url) {
  try {
    const response = await fetch(url, {
      headers: {
        Origin: frontendOrigin,
        'x-user-email': verifyUserEmail,
      },
      redirect: 'manual',
    });

    if (response.status >= 200 && response.status < 300) {
      ok(`${label} (${response.status})`);
      return true;
    }

    const text = await response.text();
    fail(`${label} (${response.status})`, text.slice(0, 200).replace(/\s+/g, ' ').trim());
    return false;
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function preflightCheck(url) {
  const label = 'preflight /api/projects';
  try {
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: frontendOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'content-type,authorization,x-user-email',
      },
      redirect: 'manual',
    });

    const allowOrigin = response.headers.get('access-control-allow-origin');

    if (response.status >= 200 && response.status < 300 && allowOrigin) {
      ok(`${label} (${response.status}) allow-origin=${allowOrigin}`);
      return true;
    }

    const body = await response.text();
    fail(
      `${label} (${response.status})`,
      `allow-origin=${allowOrigin || 'missing'} body=${body.slice(0, 200).replace(/\s+/g, ' ').trim()}`
    );
    return false;
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function sseCheck(url) {
  const label = 'notifications stream';
  try {
    const response = await fetch(url, {
      headers: {
        Origin: frontendOrigin,
        Accept: 'text/event-stream',
        'x-user-email': verifyUserEmail,
      },
      redirect: 'manual',
    });

    const contentType = response.headers.get('content-type') || '';
    const isSse = contentType.includes('text/event-stream');

    if (response.status === 200 && isSse) {
      ok(`${label} (200 text/event-stream)`);
      return true;
    }

    const body = await response.text();
    fail(`${label} (${response.status})`, body.slice(0, 200).replace(/\s+/g, ' ').trim());
    return false;
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
    return false;
  }
}

(async () => {
  console.log(`API_BASE_URL=${apiBaseUrl}`);
  console.log(`FRONTEND_ORIGIN=${frontendOrigin}`);
  console.log(`VERIFY_USER_EMAIL=${verifyUserEmail}`);

  let passed = true;

  for (const check of checks) {
    const result = await fetchCheck(check.name, `${apiBaseUrl}${check.path}`);
    passed = passed && result;
  }

  const preflightOk = await preflightCheck(`${apiBaseUrl}/api/projects`);
  passed = passed && preflightOk;

  const sseOk = await sseCheck(`${apiBaseUrl}/api/notifications/stream`);
  passed = passed && sseOk;

  if (!passed) {
    console.error('RESULT: FAILED');
    process.exit(1);
  }

  console.log('RESULT: PASSED');
})();
