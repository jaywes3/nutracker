import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function foodCatalogProxy(): Plugin {
  return {
    name: 'food-catalog-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const urlObj = new URL(req.url, 'http://localhost');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          if (urlObj.pathname === '/api/off-search') {
            const q = (urlObj.searchParams.get('q') || '').trim();
            if (!q) {
              res.end(JSON.stringify({ items: [] }));
              return;
            }
            const target = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
              q
            )}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;
            const r = await fetch(target, {
              headers: { 'User-Agent': 'OpenPhaseNutrition/1.0 (Local-First PWA)' },
              signal: AbortSignal.timeout(7000),
            });
            const data = (await r.json()) as any;
            res.end(JSON.stringify({ products: data.products || [] }));
            return;
          }

          if (urlObj.pathname === '/api/off-barcode') {
            const code = (urlObj.searchParams.get('code') || '').replace(/[^0-9]/g, '');
            if (!code) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing barcode' }));
              return;
            }
            const target = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,nutriments,serving_size,serving_quantity`;
            const r = await fetch(target, {
              headers: { 'User-Agent': 'OpenPhaseNutrition/1.0 (Local-First PWA)' },
              signal: AbortSignal.timeout(7000),
            });
            const data = await r.json();
            res.end(JSON.stringify(data));
            return;
          }

          if (urlObj.pathname === '/api/usda-search') {
            const q = (urlObj.searchParams.get('q') || '').trim();
            if (!q) {
              res.end(JSON.stringify({ foods: [] }));
              return;
            }
            const target = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(
              q
            )}&pageSize=12&dataType=${encodeURIComponent('Foundation,SR Legacy')}`;
            const r = await fetch(target, {
              signal: AbortSignal.timeout(7000),
            });
            const data = await r.json();
            res.end(JSON.stringify(data));
            return;
          }

          next();
        } catch (err: any) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err?.message || 'Upstream lookup failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss(), foodCatalogProxy()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
