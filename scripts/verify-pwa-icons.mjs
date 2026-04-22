#!/usr/bin/env node

const cliUrl = (process.argv[2] || '').trim();
const appUrl = (cliUrl || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');

const expectedManifestPath = '/manifest.webmanifest';
const expectedManifestIcons = [
  '/icon-round-192.png',
  '/icon-round-512.png',
  '/icon-512-maskable.png',
  '/logo.svg',
];
const expectedHtmlAssets = [
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'icon', href: '/icon-round-192.png' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'mask-icon', href: '/logo.svg' },
];

function normalizePath(pathname) {
  if (!pathname) return '';

  if (pathname.startsWith('./')) {
    return `/${pathname.slice(2)}`;
  }

  if (/^https?:\/\//i.test(pathname)) {
    try {
      return new URL(pathname).pathname;
    } catch {
      return pathname;
    }
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function logPass(message) {
  console.log(`PASS ${message}`);
}

function logFail(message) {
  console.error(`FAIL ${message}`);
}

async function fetchText(url, label) {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      logFail(`${label} -> HTTP ${response.status}`);
      return null;
    }
    const text = await response.text();
    logPass(`${label} -> HTTP ${response.status}`);
    return text;
  } catch (error) {
    logFail(`${label} -> ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    logFail(`${label} -> JSON invalido (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

async function checkAsset(pathname) {
  const url = `${appUrl}${pathname}`;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok) {
      logFail(`asset ${pathname} -> HTTP ${response.status}`);
      return false;
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const validType = pathname.endsWith('.png')
      ? contentType.includes('image/png')
      : pathname.endsWith('.svg')
        ? contentType.includes('image/svg+xml') || contentType.includes('text/plain')
        : true;

    if (!validType) {
      logFail(`asset ${pathname} -> content-type inesperado: ${contentType || 'missing'}`);
      return false;
    }

    logPass(`asset ${pathname} -> ${contentType || 'content-type missing'}`);
    return true;
  } catch (error) {
    logFail(`asset ${pathname} -> ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function getAttr(tag, attrName) {
  const match = tag.match(new RegExp(`${attrName}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : '';
}

function hasHtmlLink(html, rel, hrefPath) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];

  for (const tag of linkTags) {
    const relAttr = getAttr(tag, 'rel').toLowerCase();
    if (relAttr !== rel.toLowerCase()) {
      continue;
    }

    const hrefAttr = getAttr(tag, 'href');
    const normalizedHref = normalizePath(hrefAttr);
    if (normalizedHref === hrefPath) {
      return true;
    }
  }

  return false;
}

(async () => {
  console.log(`APP_URL=${appUrl}`);

  let allOk = true;

  const indexHtml = await fetchText(`${appUrl}/`, 'index');
  if (!indexHtml) {
    process.exit(1);
  }

  for (const link of expectedHtmlAssets) {
    const present = hasHtmlLink(indexHtml, link.rel, link.href);
    if (!present) {
      logFail(`index link rel=${link.rel} href=${link.href} no encontrado`);
      allOk = false;
      continue;
    }
    logPass(`index link rel=${link.rel} href=${link.href}`);
  }

  const manifest = await fetchJson(`${appUrl}${expectedManifestPath}`, `manifest ${expectedManifestPath}`);
  if (!manifest) {
    process.exit(1);
  }

  const iconSet = new Set((manifest.icons || []).map((icon) => normalizePath(icon?.src)));
  for (const expected of expectedManifestIcons) {
    if (!iconSet.has(expected)) {
      logFail(`manifest icon ${expected} faltante`);
      allOk = false;
    } else {
      logPass(`manifest icon ${expected}`);
    }
  }

  const uniqueAssets = new Set([
    ...expectedManifestIcons,
    '/apple-touch-icon.png',
  ]);

  for (const asset of uniqueAssets) {
    const ok = await checkAsset(asset);
    allOk = allOk && ok;
  }

  if (!allOk) {
    console.error('RESULT FAILED');
    process.exit(1);
  }

  console.log('RESULT PASSED');
})();
