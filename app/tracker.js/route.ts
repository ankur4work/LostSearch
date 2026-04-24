import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
// Static content — let edge cache hold it. Not `force-dynamic`.
export const dynamic = 'force-static';

/**
 * Storefront tracker script — served at /tracker.js, injected into every
 * storefront via Shopify ScriptTag API on OAuth install.
 *
 * Responsibilities:
 *   1. Detect search submissions (form submits, /search?q= page loads).
 *   2. Snapshot: shop domain, query text, result count, applied filters.
 *   3. POST to /api/events/search on our backend. Fire-and-forget.
 *
 * Hard constraints:
 *   - No external dependencies. Pure vanilla JS. Runs in shopper's browser.
 *   - Never blocks page load. Uses `navigator.sendBeacon` when available,
 *     falls back to fetch with keepalive.
 *   - Never captures PII beyond the query string the shopper typed.
 */
const TRACKER_JS = `(function(){
  var ENDPOINT = ${JSON.stringify(env.SHOPIFY_APP_URL + '/api/events/search')};
  var shop = (window.Shopify && window.Shopify.shop) || null;
  if (!shop) return;

  function send(payload) {
    try {
      var body = JSON.stringify(Object.assign({ shop: shop, at: Date.now() }, payload));
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body,
          keepalive: true,
          credentials: 'omit',
        }).catch(function(){});
      }
    } catch (e) {}
  }

  function extractQuery() {
    try {
      var url = new URL(window.location.href);
      return (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    } catch (e) { return ''; }
  }

  function countResults() {
    // Heuristic: common Shopify theme selectors for search results grid.
    var selectors = [
      '.search-results [data-product-card]',
      '.search-results .product-card',
      '.search-results .grid__item',
      '.template-search .product-card',
      '[data-search-results] [data-product-id]',
      '.search-page .product-grid > *',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = document.querySelectorAll(selectors[i]);
      if (nodes && nodes.length > 0) return nodes.length;
    }
    return null;
  }

  function collectFilters() {
    try {
      var url = new URL(window.location.href);
      var f = {};
      url.searchParams.forEach(function(v, k){
        if (k === 'q' || k === 'query' || k === 'type' || k === 'page' || k === 'sort_by') return;
        if (k.indexOf('filter.') === 0 || k === 'filter' || k === 'constraint') f[k] = v;
      });
      return Object.keys(f).length ? f : null;
    } catch (e) { return null; }
  }

  function onSearchPage() {
    var q = extractQuery();
    if (!q) return;
    setTimeout(function(){
      send({
        event: 'search_viewed',
        query: q,
        resultCount: countResults(),
        filters: collectFilters(),
        path: window.location.pathname,
      });
    }, 300);
  }

  function hookForms() {
    document.addEventListener('submit', function(e){
      var form = e.target;
      if (!form || !form.action) return;
      if (form.action.indexOf('/search') === -1) return;
      var input = form.querySelector('input[name="q"], input[name="query"]');
      if (!input) return;
      var q = (input.value || '').trim();
      if (!q) return;
      send({ event: 'search_submitted', query: q, path: form.action });
    }, true);
  }

  if (window.location.pathname.indexOf('/search') === 0) onSearchPage();
  hookForms();
})();`;

export function GET(): NextResponse {
  return new NextResponse(TRACKER_JS, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      // CORS: storefronts at arbitrary *.myshopify.com origins fetch this.
      'access-control-allow-origin': '*',
    },
  });
}
