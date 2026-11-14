import { arenaRelayUrl } from './arena';

export interface NutritionLabel {
  name: string | null;
  brand: string | null;
  servingLabel: string | null;
  servingGrams: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  notes: string | null;
}

/** Extract actual per-serving values without converting, estimating, or assuming missing values. */
export async function readNutritionLabel(params: {relayUrl:string; apiKey:string; model:string; base64:string; mime:string}): Promise<NutritionLabel> {
  const url = arenaRelayUrl(params.relayUrl);
  if (!params.apiKey.trim()) throw new Error('Set up your Arena key and relay in Describe → Arena Settings first.');
  const instruction = `Read this nutrition-label photo. Transcribe only legible values, do not infer or estimate anything. Return ONLY JSON: {"name":string|null,"brand":string|null,"servingLabel":string|null,"servingGrams":number|null,"calories":number|null,"protein":number|null,"carbs":number|null,"fat":number|null,"fiber":number|null,"notes":string|null}. All nutrients must be numeric amounts in grams except calories in kcal. Use total carbohydrate, not net carbs. Give values for ONE labeled serving (never the whole package). If there is more than one nutrition column, use the per-serving column; if uncertain return null. If the only column is per 100 g and it is not explicitly the serving size, return null for the nutrients rather than treating them as per-serving. servingGrams is the serving size printed in grams, not milliliters or ounces converted into grams. If unavailable return null. Missing or illegible fields must be null, not zero. If photo is not a readable nutrition label, use null for all fields and explain in notes. Do not guess the product name or brand.`;
  let response: Response;
  try {
    response = await fetch(url, {method:'POST',headers:{'Authorization':`Bearer ${params.apiKey.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({model:params.model.trim() || 'coding-router-preview',messages:[{role:'user',content:[{type:'text',text:instruction},{type:'image_url',image_url:{url:`data:${params.mime};base64,${params.base64}`}}]}]})});
  } catch { throw new Error('Could not reach the Arena relay. Check your connection and Arena Settings.'); }
  const raw = await response.text();
  if (!response.ok) {
    let message = '';
    try { const obj = JSON.parse(raw); message = typeof obj.error === 'string' ? obj.error : obj.error?.message || ''; } catch { /* unknown response */ }
    throw new Error(`Arena/relay error ${response.status}${message ? `: ${String(message).slice(0,300)}` : ''}`);
  }
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('Arena returned an unreadable response.'); }
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p:any) => p?.text || '').join('') : '';
  let obj: any;
  try { obj = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')); } catch { throw new Error('Arena could not read the label. Try a clearer photo or a vision-capable model.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Arena returned an invalid label. Try again.');
  const num = (value:any, positive = false):number|null => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && (!positive || n > 0) ? n : null;
  };
  const str = (value:any):string|null => typeof value === 'string' && value.trim() ? value.trim().slice(0,300) : null;
  return {name:str(obj.name),brand:str(obj.brand),servingLabel:str(obj.servingLabel),servingGrams:num(obj.servingGrams,true),calories:num(obj.calories),protein:num(obj.protein),carbs:num(obj.carbs),fat:num(obj.fat),fiber:num(obj.fiber),notes:str(obj.notes)};
}
