import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Origin-aware: ENDPOINT is derived from the incoming request host so the
// tracker POSTs back to whichever URL served it (tunnel in dev, real domain
// in prod). Cannot be force-static since the host changes.
export const dynamic = 'force-dynamic';

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
function buildTracker(endpoint: string): string {
  return `(function(){
  // Idempotency guard. The tracker is delivered TWO ways (theme app embed +
  // auto-injected ScriptTag), and both load this same /tracker.js. Without this
  // guard, two <script> executions install two submit listeners and wrap fetch
  // twice — so every shopper search is counted multiple times. Bail if we've
  // already initialized on this page.
  if (window.__demandRadarTracker) return;
  window.__demandRadarTracker = true;

  var ENDPOINT = ${JSON.stringify(endpoint)};
  var shop = (window.Shopify && window.Shopify.shop) || null;
  if (!shop) return;

  // De-dupe the same submitted query within a short window. A single shopper
  // action can trip more than one hook (predictive-search fetch, form submit,
  // and AJAX /search? load), which would inflate occurrenceCount for one search.
  var recentSubmits = {};

  function send(payload) {
    try {
      if (payload && payload.event === 'search_submitted') {
        var dedupeKey = String(payload.query || '').trim().toLowerCase();
        var nowTs = Date.now();
        if (recentSubmits[dedupeKey] && nowTs - recentSubmits[dedupeKey] < 2500) return;
        recentSubmits[dedupeKey] = nowTs;
      }
      var body = JSON.stringify(Object.assign({ shop: shop, at: Date.now() }, payload));
      // Use text/plain so the request is a "simple" CORS request (no preflight).
      // The server reads body as JSON regardless of declared content-type.
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
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

  // Intercept Shopify predictive-search fetch calls (/search/suggest?q=...).
  // Most modern themes use AJAX autocomplete that never submits a form or
  // navigates to /search — without this hook those queries are never captured.
  function hookPredictive() {
    // A single typing burst ("sh" -> "sho" -> "shoe" -> "shoes") fires one
    // /search/suggest call per keystroke. Counting each prefix as its own
    // search massively over-counts (one word = 3-5 "searches", several junk
    // product gaps). So we keep ONE pending slot + ONE timer: each suggest call
    // overwrites the pending query with the latest (longest) one and resets the
    // timer, so only the final query of the burst is recorded.
    var pendingQuery = null;
    var pendingCount = null;
    var pendingTimer = null;
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      var promise = origFetch.apply(this, arguments);
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/search/suggest') !== -1 || url.indexOf('/search?') !== -1) {
          var parsed = new URL(url, window.location.origin);
          var q = (parsed.searchParams.get('q') || parsed.searchParams.get('query') || '').trim();
          if (q && q.length >= 2) {
            // Clone the response immediately (before theme JS consumes it) and
            // resolve the product count for the result.
            var countPromise = promise.then(function(res) {
              try { return res.clone().json(); } catch(e) { return Promise.resolve(null); }
            }).then(function(data) {
              try {
                var prods = data && data.resources && data.resources.results && data.resources.results.products;
                return prods ? prods.length : 0;
              } catch(e) { return 0; }
            }).catch(function() { return 0; });
            pendingQuery = q;
            pendingCount = countPromise;
            clearTimeout(pendingTimer);
            pendingTimer = setTimeout(function(){
              var fq = pendingQuery, cp = pendingCount;
              pendingQuery = null; pendingCount = null; pendingTimer = null;
              if (cp) {
                cp.then(function(count) {
                  send({ event: 'search_submitted', query: fq, resultCount: count, path: '/search/suggest' });
                });
              } else {
                send({ event: 'search_submitted', query: fq, path: '/search/suggest' });
              }
            }, 1000);
          }
        }
      } catch(e) {}
      return promise;
    };
  }

  if (window.location.pathname.indexOf('/search') === 0) onSearchPage();
  hookForms();
  hookPredictive();
})();`;
}

export function GET(req: NextRequest): NextResponse {
  // Resolve the canonical origin from the incoming request so the tracker
  // POSTs back to the same host (tunnel URL in dev, prod domain in prod).
  const fwdHost = req.headers.get('x-forwarded-host');
  const fwdProto = req.headers.get('x-forwarded-proto');
  const url = new URL(req.url);
  const host = fwdHost ?? req.headers.get('host') ?? url.host;
  const proto = fwdProto ?? url.protocol.replace(':', '') ?? 'https';
  const endpoint = `${proto}://${host}/api/events/search`;

  return new NextResponse(buildTracker(endpoint), {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      // CORS: storefronts at arbitrary *.myshopify.com origins fetch this.
      'access-control-allow-origin': '*',
    },
  });
}
