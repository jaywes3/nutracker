import type { FoodItem } from '../types';
import { normalizeOffProduct, normalizeUsdaFood } from './importer';

const searchCache = new Map<string, FoodItem[]>();
const barcodeCache = new Map<string, FoodItem>();

/**
 * Converts a natural grocery query like "Rao's Marinara" into a Lucene prefix query
 * `+rao* +marinara*` so USDA searches brandName + description across 450,000+ foods.
 */
function buildUsdaLuceneQuery(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s%]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) return raw.trim();

  return words
    .map((w) => {
      // Strip trailing plural 's' on words >=4 chars so "raos" matches "RAO'S" and "tortillas" matches "TORTILLA"
      const stem = w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
      return `+${stem}*`;
    })
    .join(' ');
}

export interface OnlineSearchResponse {
  items: FoodItem[];
  rateLimitedDemoKey: boolean;
  error: string | null;
}

export async function searchOnlineFoodDatabases(opts: {
  query: string;
  usdaApiKey?: string;
  offlineOnlyMode: boolean;
  onAudit?: (dest: string, purpose: string, allowed: boolean) => void;
}): Promise<OnlineSearchResponse> {
  const q = opts.query.trim();
  if (!q) return { items: [], rateLimitedDemoKey: false, error: null };

  if (opts.offlineOnlyMode) {
    opts.onAudit?.('USDA + Open Food Facts', `Food search "${q}"`, false);
    return {
      items: [],
      rateLimitedDemoKey: false,
      error: 'Air-Gap Offline Mode is active in Privacy Settings.',
    };
  }

  const activeUsdaKey = (opts.usdaApiKey || '').trim() || 'DEMO_KEY';
  const cacheKey = `${activeUsdaKey === 'DEMO_KEY' ? 'demo' : 'custom'}:${q.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return { items: cached, rateLimitedDemoKey: false, error: null };
  }

  opts.onAudit?.('api.nal.usda.gov & world.openfoodfacts.org', `Food search "${q}"`, true);

  const luceneQ = buildUsdaLuceneQuery(q);
  const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
    activeUsdaKey
  )}&query=${encodeURIComponent(luceneQ)}&pageSize=18`;

  const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    q
  )}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;

  let rateLimitedDemoKey = false;

  try {
    const [usdaRes, offRes] = await Promise.allSettled([
      fetch(usdaUrl, { signal: AbortSignal.timeout(7500) }).then(async (r) => {
        if (r.status === 429 && activeUsdaKey === 'DEMO_KEY') {
          rateLimitedDemoKey = true;
          return null;
        }
        return r.ok ? r.json() : null;
      }),
      fetch(offUrl, { signal: AbortSignal.timeout(6500) }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]);

    const merged: FoodItem[] = [];
    const seenNames = new Set<string>();

    if (usdaRes.status === 'fulfilled' && Array.isArray(usdaRes.value?.foods)) {
      for (const raw of usdaRes.value.foods) {
        const item = normalizeUsdaFood(raw);
        if (item) {
          const dedupKey = `${(item.brand || '').toLowerCase()}|${item.name.toLowerCase()}|${item.caloriesPer100g}`;
          if (!seenNames.has(dedupKey)) {
            seenNames.add(dedupKey);
            merged.push(item);
          }
        }
      }
    }

    // If strict +stem* returned 0 USDA items and wasn't rate limited, try relaxed query
    if (
      merged.length === 0 &&
      !rateLimitedDemoKey &&
      usdaRes.status === 'fulfilled' &&
      usdaRes.value !== null
    ) {
      try {
        const fallbackUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
          activeUsdaKey
        )}&query=${encodeURIComponent(q)}&requireAllWords=true&pageSize=14`;
        const r2 = await fetch(fallbackUrl, { signal: AbortSignal.timeout(6000) });
        if (r2.status === 429 && activeUsdaKey === 'DEMO_KEY') {
          rateLimitedDemoKey = true;
        } else if (r2.ok) {
          const d2 = await r2.json();
          for (const raw of d2?.foods || []) {
            const item = normalizeUsdaFood(raw);
            if (item) merged.push(item);
          }
        }
      } catch {
        // ignore fallback error
      }
    }

    if (offRes.status === 'fulfilled' && Array.isArray(offRes.value?.products)) {
      for (const raw of offRes.value.products) {
        const item = normalizeOffProduct(raw);
        if (item) {
          const dedupKey = `${(item.brand || '').toLowerCase()}|${item.name.toLowerCase()}|${item.caloriesPer100g}`;
          if (!seenNames.has(dedupKey)) {
            seenNames.add(dedupKey);
            merged.push(item);
          }
        }
      }
    }

    if (merged.length > 0) {
      searchCache.set(cacheKey, merged);
    }

    return {
      items: merged,
      rateLimitedDemoKey,
      error:
        merged.length === 0
          ? rateLimitedDemoKey
            ? 'USDA shared DEMO_KEY hourly limit reached — add a free personal USDA key (takes 20 sec) or scan the package barcode!'
            : 'No online matches found — try scanning the barcode or adding a custom label.'
          : null,
    };
  } catch (err: any) {
    return {
      items: [],
      rateLimitedDemoKey,
      error: err?.message || 'Online search temporarily unavailable.',
    };
  }
}

export interface BarcodeLookupResponse {
  item: FoodItem | null;
  sourceLabel: string;
  notFoundCode?: string;
}

function barcodeVariants(code: string): string[] {
  const variants = new Set<string>([code]);
  if (code.length === 12) variants.add(`0${code}`); // UPC-A -> EAN-13
  if (code.length === 13 && code.startsWith('0')) variants.add(code.slice(1)); // EAN-13 -> UPC-A
  return Array.from(variants);
}

/**
 * Checks:
 * 1) Local offline catalog & saved custom foods (instant 0ms)
 * 2) Open Food Facts v2 API (3.5M+ global products, including UPC/EAN variants)
 * 3) USDA Branded Foods gtinUpc fallback (450k+ US grocery store-brand barcodes)
 */
export async function lookupBarcodeAcrossDatabases(opts: {
  rawCode: string;
  catalog: FoodItem[];
  usdaApiKey?: string;
  offlineOnlyMode: boolean;
  onAudit?: (dest: string, purpose: string, allowed: boolean) => void;
}): Promise<BarcodeLookupResponse> {
  const code = opts.rawCode.replace(/[^0-9]/g, '');
  if (!code) {
    return { item: null, sourceLabel: 'Enter a numeric UPC or EAN barcode.' };
  }

  const variants = barcodeVariants(code);

  // 1. Local catalog & saved custom barcodes
  const localHit = opts.catalog.find(
    (f) => f.barcode && variants.includes(f.barcode.replace(/[^0-9]/g, ''))
  );
  if (localHit) {
    return {
      item: localHit,
      sourceLabel: `Found in your local database: ${localHit.name}`,
    };
  }

  for (const v of variants) {
    const mem = barcodeCache.get(v);
    if (mem) {
      return { item: mem, sourceLabel: `Found: ${mem.name}` };
    }
  }

  if (opts.offlineOnlyMode) {
    opts.onAudit?.('world.openfoodfacts.org', `Barcode ${code}`, false);
    return {
      item: null,
      sourceLabel: 'Air-Gap Offline Mode blocked online barcode lookup.',
      notFoundCode: code,
    };
  }

  opts.onAudit?.('world.openfoodfacts.org', `Barcode lookup ${code}`, true);

  // 2. Open Food Facts v2 API (try exact code + UPC/EAN 0-padded variant)
  for (const candidate of variants) {
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
          candidate
        )}.json?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`,
        { signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) {
        const data = await r.json();
        if (data?.product) {
          const item = normalizeOffProduct({ ...data.product, code: candidate });
          if (item) {
            barcodeCache.set(code, item);
            return {
              item,
              sourceLabel: `Found on Open Food Facts: ${item.name}`,
            };
          }
        }
      }
    } catch {
      // continue to next variant or USDA fallback
    }
  }

  // 3. USDA Branded Foods gtinUpc fallback (catches US store brands like Trader Joe's / Kirkland / Aldi!)
  const activeUsdaKey = (opts.usdaApiKey || '').trim() || 'DEMO_KEY';
  for (const candidate of variants) {
    try {
      const r = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
          activeUsdaKey
        )}&query=${encodeURIComponent(`gtinUpc:${candidate}`)}&pageSize=3`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const data = await r.json();
        const raw = data?.foods?.[0];
        if (raw) {
          const item = normalizeUsdaFood(raw);
          if (item) {
            barcodeCache.set(code, item);
            return {
              item,
              sourceLabel: `Found in USDA Branded Grocery DB: ${item.name}`,
            };
          }
        }
      }
    } catch {
      // ignore fallback network error
    }
  }

  return {
    item: null,
    sourceLabel: `No match found for barcode ${code} — you can attach it to a Custom Food below so next scan is instant!`,
    notFoundCode: code,
  };
}
