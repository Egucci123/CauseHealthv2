// Vercel Edge Middleware — geo-block visitors outside our launch region.
//
// LAUNCH SCOPE (2026-05-13): US only, EXCLUDING California + Washington.
// California has CCPA/CPRA, Washington has My Health My Data Act —
// both add health-data regulatory exposure we're not yet set up for.
// Everything outside the US adds international regulatory + payment
// complexity we're not yet handling.
//
// Visitors from blocked regions are rewritten to /region-unavailable.html
// which captures their email so we can notify them on launch.
//
// Vercel populates these headers automatically at the edge:
//   x-vercel-ip-country         ISO 3166-1 alpha-2 (e.g. "US", "GB")
//   x-vercel-ip-country-region  state/province code (e.g. "CA", "NY")

export const config = {
  // Run on every page request EXCEPT static assets, the blocked page itself,
  // and a couple of public endpoints. Without these exclusions we'd block
  // the blocked page from loading (infinite redirect) or block favicon /
  // robots which is silly and breaks crawlers' ability to see we exist.
  matcher: [
    '/((?!region-unavailable|favicon\\.svg|robots\\.txt|sitemap\\.xml|manifest\\.json|sw\\.js|assets/|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?|map)$).*)',
  ],
};

const BLOCKED_US_REGIONS = new Set(['CA', 'WA']);

export default function middleware(request: Request): Response | undefined {
  const country = (request.headers.get('x-vercel-ip-country') ?? '').toUpperCase();
  const region = (request.headers.get('x-vercel-ip-country-region') ?? '').toUpperCase();

  // Allow local dev / preview where Vercel headers aren't set — without
  // this, every localhost request would be treated as blocked.
  if (!country) return undefined;

  const outsideUS = country !== 'US';
  const blockedRegion = country === 'US' && BLOCKED_US_REGIONS.has(region);
  if (!outsideUS && !blockedRegion) return undefined;

  // Rewrite (not redirect) so the URL stays clean and the user can't
  // simply "back-button" past the block. Pass the detected country/region
  // through as a query param so the blocked page can personalize.
  const url = new URL(request.url);
  const dest = new URL('/region-unavailable.html', request.url);
  dest.searchParams.set('country', country);
  if (region) dest.searchParams.set('region', region);
  dest.searchParams.set('from', url.pathname);

  return Response.redirect(dest.toString(), 307);
}
