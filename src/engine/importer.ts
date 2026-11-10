import { emptyMicros } from '../data/coreFoods';
import type {
  FoodItem,
  FoodLogEntry,
  Micronutrients,
  UnitSystem,
  WeightEntry,
} from '../types';
import { KG_TO_LBS } from './metabolism';

function normalizeDateCell(val: string | number | undefined | null): string | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  // Excel serial date (e.g. 45000 .. 48000)
  if (!Number.isNaN(num) && num > 35000 && num < 60000 && /^\d+(\.\d+)?$/.test(String(val).trim())) {
    const utcDays = Math.floor(num - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    return dt.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

/** RFC-4180 compliant CSV parser */
function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((c) => c !== '')) lines.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur.trim());
    if (row.some((c) => c !== '')) lines.push(row);
  }
  if (lines.length < 2) return [];
  const headers = lines[0];
  return lines.slice(1).map((vals) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = vals[idx] ?? '';
    });
    return obj;
  });
}

/** Lightweight zero-dependency browser .xlsx reader using native DecompressionStream */
async function unzipEntries(buf: ArrayBuffer): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const files = new Map<string, string>();
  const decoder = new TextDecoder('utf-8');

  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = bytes.subarray(dataStart, dataStart + compSize);

    if (name.endsWith('.xml')) {
      if (method === 0) {
        files.set(name, decoder.decode(rawData));
      } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(rawData);
        writer.close();
        const outBuf = await new Response(ds.readable).arrayBuffer();
        files.set(name, decoder.decode(outBuf));
      }
    }
    offset = dataStart + compSize;
  }
  return files;
}

function parseXlsxSheets(xmlMap: Map<string, string>): Array<Array<Record<string, string>>> {
  const dom = new DOMParser();
  const sharedStrings: string[] = [];
  const ssXml = xmlMap.get('xl/sharedStrings.xml');
  if (ssXml) {
    const doc = dom.parseFromString(ssXml, 'application/xml');
    doc.querySelectorAll('si').forEach((si) => {
      sharedStrings.push(si.textContent || '');
    });
  }

  const sheets: Array<Array<Record<string, string>>> = [];
  for (const [path, xml] of xmlMap.entries()) {
    if (!path.startsWith('xl/worksheets/sheet') || !path.endsWith('.xml')) continue;
    const doc = dom.parseFromString(xml, 'application/xml');
    const grid: string[][] = [];

    doc.querySelectorAll('row').forEach((rEl) => {
      const rowVals: string[] = [];
      rEl.querySelectorAll('c').forEach((cEl) => {
        const ref = cEl.getAttribute('r') || '';
        const colLetters = ref.replace(/[0-9]/g, '');
        let colIdx = 0;
        for (let k = 0; k < colLetters.length; k++) {
          colIdx = colIdx * 26 + (colLetters.charCodeAt(k) - 64);
        }
        colIdx = Math.max(0, colIdx - 1);

        const t = cEl.getAttribute('t');
        const vText = cEl.querySelector('v')?.textContent ?? cEl.querySelector('is')?.textContent ?? '';
        const val =
          t === 's' ? sharedStrings[parseInt(vText, 10)] ?? '' : vText;
        rowVals[colIdx] = val.trim();
      });
      if (rowVals.some((x) => x)) grid.push(rowVals);
    });

    if (grid.length >= 2) {
      const headers = grid[0];
      const rows = grid.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = r[i] ?? '';
        });
        return obj;
      });
      sheets.push(rows);
    }
  }
  return sheets;
}

/**
 * Parses MacroFactor (.xlsx Quick Export or .csv) strictly inside the browser — zero dependencies.
 */
export async function parseMacroFactorOrCsvFile(
  file: File,
  preferredUnit: UnitSystem
): Promise<{
  weights: WeightEntry[];
  logs: FoodLogEntry[];
  summary: string;
}> {
  let sheetRowsList: Array<Array<Record<string, string>>> = [];

  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    sheetRowsList = [parseCsvRows(text)];
  } else {
    const buf = await file.arrayBuffer();
    const xmlMap = await unzipEntries(buf);
    sheetRowsList = parseXlsxSheets(xmlMap);
  }

  const weightsMap = new Map<string, WeightEntry>();
  const logs: FoodLogEntry[] = [];

  for (const rows of sheetRowsList) {
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    const findCol = (patterns: RegExp[]) =>
      headers.find((h) => patterns.some((p) => p.test(h.trim())));

    const dateCol = findCol([/^date$/i, /day/i, /logged/i]);
    if (!dateCol) continue;

    const weightCol = findCol([
      /scale\s*weight/i,
      /^weight\s*\(/i,
      /^weight$/i,
      /body\s*weight/i,
    ]);
    const kcalCol = findCol([/^calories/i, /^energy/i, /kcal/i]);
    const pCol = findCol([/^protein/i]);
    const cCol = findCol([/^carbs/i, /^carbohydrate/i]);
    const fCol = findCol([/^fat/i, /total\s*fat/i]);
    const foodNameCol = findCol([/food\s*name/i, /^item$/i, /^food$/i, /^title$/i]);
    const hourCol = findCol([/^hour$/i, /^time$/i]);
    const fiberCol = findCol([/^fiber/i, /dietary\s*fiber/i]);

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const date = normalizeDateCell(row[dateCol]);
      if (!date) continue;

      if (weightCol && row[weightCol]) {
        const rawW = parseFloat(String(row[weightCol]).replace(/[^0-9.]/g, ''));
        if (!Number.isNaN(rawW) && rawW > 25) {
          const headerLower = weightCol.toLowerCase();
          let kg = rawW;
          if (headerLower.includes('lb') || headerLower.includes('pound')) {
            kg = rawW / KG_TO_LBS;
          } else if (headerLower.includes('kg')) {
            kg = rawW;
          } else {
            kg = preferredUnit === 'imperial' || rawW > 130 ? rawW / KG_TO_LBS : rawW;
          }
          weightsMap.set(date, {
            date,
            weightKg: Math.round(kg * 100) / 100,
          });
        }
      }

      if (kcalCol && row[kcalCol]) {
        const kcal = parseFloat(String(row[kcalCol]));
        if (!Number.isNaN(kcal) && kcal > 0) {
          const protein = pCol ? parseFloat(String(row[pCol])) || 0 : 0;
          const carbs = cCol ? parseFloat(String(row[cCol])) || 0 : 0;
          const fat = fCol ? parseFloat(String(row[fCol])) || 0 : 0;
          const fiber = fiberCol ? parseFloat(String(row[fiberCol])) || 0 : 0;
          const name =
            foodNameCol && row[foodNameCol]
              ? String(row[foodNameCol])
              : 'Imported MacroFactor Daily Summary';

          let hour = 12;
          if (hourCol && row[hourCol]) {
            const hm = String(row[hourCol]).match(/(\d{1,2})/);
            if (hm) hour = Math.min(23, Math.max(0, parseInt(hm[1], 10)));
          }

          const micros = emptyMicros();
          micros.fiber = Math.round(fiber * 10) / 10;

          logs.push({
            id: `imp-${date}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            date,
            hour,
            foodId: 'imported-entry',
            foodName: name,
            grams: 100,
            servingLabel: 'Imported entry',
            servingQty: 1,
            calories: Math.round(kcal),
            protein: Math.round(protein * 10) / 10,
            carbs: Math.round(carbs * 10) / 10,
            fat: Math.round(fat * 10) / 10,
            micros,
          });
        }
      }
    }
  }

  const hasGranular = logs.some(
    (l) => l.foodName !== 'Imported MacroFactor Daily Summary'
  );
  const filteredLogs = hasGranular
    ? logs.filter((l) => l.foodName !== 'Imported MacroFactor Daily Summary')
    : logs;

  const weights = Array.from(weightsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    weights,
    logs: filteredLogs,
    summary: `Imported ${weights.length} weigh-ins and ${filteredLogs.length} nutrition entries from "${file.name}".`,
  };
}

export function normalizeOffProduct(p: any): FoodItem | null {
  const name = (p?.product_name || '').trim();
  const n = p?.nutriments || {};
  const kcal =
    Number(n['energy-kcal_100g']) ||
    (Number(n['energy_100g']) ? Number(n['energy_100g']) / 4.184 : 0);
  if (!name || Number.isNaN(kcal)) return null;

  const micros: Micronutrients = {
    fiber: Number(n.fiber_100g) || 0,
    sugar: Number(n.sugars_100g) || 0,
    satFat: Number(n['saturated-fat_100g']) || 0,
    sodium: (Number(n.sodium_100g) || 0) * 1000,
    potassium: (Number(n.potassium_100g) || 0) * 1000,
    calcium: (Number(n.calcium_100g) || 0) * 1000,
    iron: (Number(n.iron_100g) || 0) * 1000,
    magnesium: (Number(n.magnesium_100g) || 0) * 1000,
    zinc: (Number(n.zinc_100g) || 0) * 1000,
    vitC: (Number(n['vitamin-c_100g']) || 0) * 1000,
    vitD: (Number(n['vitamin-d_100g']) || 0) * 1000000,
    vitB12: (Number(n['vitamin-b12_100g']) || 0) * 1000000,
  };

  const servings = [
    { label: '100 g', grams: 100 },
    { label: '1 oz (28g)', grams: 28.35 },
  ];
  const srvQty = parseFloat(p?.serving_quantity);
  if (srvQty && srvQty > 0 && srvQty !== 100) {
    servings.unshift({
      label: p?.serving_size
        ? `${p.serving_size} (${Math.round(srvQty)}g)`
        : `1 serving (${Math.round(srvQty)}g)`,
      grams: srvQty,
    });
  }

  return {
    id: `off-${p.code || Math.random().toString(36).slice(2, 8)}`,
    name,
    brand: p.brands ? String(p.brands).split(',')[0].trim() : undefined,
    barcode: p.code ? String(p.code) : undefined,
    source: 'off',
    caloriesPer100g: Math.round(kcal),
    proteinPer100g: Math.round((Number(n.proteins_100g) || 0) * 10) / 10,
    carbsPer100g: Math.round((Number(n.carbohydrates_100g) || 0) * 10) / 10,
    fatPer100g: Math.round((Number(n.fat_100g) || 0) * 10) / 10,
    microsPer100g: micros,
    servings,
  };
}

export function normalizeUsdaFood(f: any): FoodItem | null {
  const name = (f?.description || '').trim();
  if (!name) return null;
  const nutrients: any[] = f?.foodNutrients || [];
  const getN = (ids: number[]) => {
    const hit = nutrients.find((x) => ids.includes(Number(x.nutrientId)));
    return Number(hit?.value) || 0;
  };

  const kcal = getN([1008, 2047]);
  const protein = getN([1003]);
  const carbs = getN([1005]);
  const fat = getN([1004]);

  const micros: Micronutrients = {
    fiber: getN([1079]),
    sugar: getN([2000, 1063]),
    satFat: getN([1258]),
    sodium: getN([1093]),
    potassium: getN([1092]),
    calcium: getN([1087]),
    iron: getN([1089]),
    magnesium: getN([1090]),
    zinc: getN([1095]),
    vitC: getN([1162]),
    vitD: getN([1114]),
    vitB12: getN([1178]),
  };

  return {
    id: `usda-${f.fdcId}`,
    name,
    brand: 'USDA Foundation',
    source: 'usda',
    caloriesPer100g: Math.round(kcal),
    proteinPer100g: Math.round(protein * 10) / 10,
    carbsPer100g: Math.round(carbs * 10) / 10,
    fatPer100g: Math.round(fat * 10) / 10,
    microsPer100g: micros,
    servings: [
      { label: '100 g', grams: 100 },
      { label: '4 oz (113g)', grams: 113.4 },
      { label: '1 oz (28g)', grams: 28.35 },
    ],
  };
}
