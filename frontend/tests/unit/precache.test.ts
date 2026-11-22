import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVersion, precacheList, renderServiceWorker } from '../../pwa/precache';

describe('precacheList', () => {
  it('keeps scripts, styles, and latin fonts; skips images, other font subsets, and the worker itself', () => {
    const list = precacheList([
      'index.html',
      'sw.js',
      'assets/index-abc.js',
      'assets/index-def.css',
      'assets/CalibratePage-x1.js',
      'assets/plus-jakarta-sans-latin-400-normal-a.woff2',
      'assets/plus-jakarta-sans-latin-ext-400-normal-b.woff2',
      'assets/plus-jakarta-sans-vietnamese-400-normal-c.woff2',
      'assets/plus-jakarta-sans-latin-400-normal-d.woff',
      'assets/active-learning.jpg',
      'assets/index-abc.js',
    ]);
    expect(list).toEqual([
      '/assets/CalibratePage-x1.js',
      '/assets/index-abc.js',
      '/assets/index-def.css',
      '/assets/plus-jakarta-sans-latin-400-normal-a.woff2',
    ]);
  });
});

describe('renderServiceWorker', () => {
  const template = readFileSync(path.resolve(import.meta.dirname, '../../pwa/sw.js'), 'utf8');

  it('fills the file list and a version that changes with the build', () => {
    const out = renderServiceWorker(template, ['/assets/a.js'], '<html>1</html>');
    expect(out).toContain('const PRECACHE = ["/assets/a.js"];');
    expect(out).toContain(`const BUILD = '${buildVersion(['/assets/a.js'], '<html>1</html>')}';`);
    expect(out).not.toMatch(/__PRECACHE__|__BUILD__/);
    expect(buildVersion(['/assets/a.js'], '<html>2</html>')).not.toBe(buildVersion(['/assets/a.js'], '<html>1</html>'));
  });

  it('refuses a template whose placeholders are missing or repeated', () => {
    expect(() => renderServiceWorker('const x = 1;', [])).toThrow(/__PRECACHE__/);
    expect(() => renderServiceWorker(`${template}\n// __BUILD__`, [])).toThrow(/tepat satu kali/);
  });

  it('never caches API responses', () => {
    expect(template).toMatch(/url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  });
});
