export interface ArenaMealItem {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export function arenaRelayUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter the full HTTPS URL of your Cloudflare Workers relay.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.search || url.hash) {
    throw new Error('Use the HTTPS workers.dev URL of the relay you deployed.');
  }
  return url.href;
}

/** Sends only the typed description and optional photo, not the user's profile or diary. */
export async function analyzeWithArena(params: {
  relayUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<{reply: string; estimatedItems: ArenaMealItem[]}> {
  const url = arenaRelayUrl(params.relayUrl);
  if (!params.apiKey.trim()) throw new Error('Add your Arena API key in Arena Settings.');
  const model = params.model.trim() || 'coding-router-preview';
  const prompt = `You are helping estimate nutrition for food logging. Respond ONLY with valid JSON, no markdown, matching this schema: {"reply":"short explanation of assumptions and uncertainty", "estimatedItems":[{"name":"food", "grams":100, "calories":150, "protein":10, "carbs":12, "fat":5, "fiber":1}]}.
Amounts and nutrition values are totals for each described portion, not per 100 grams. All nutrients are grams except calories in kcal. If portions are unclear, make reasonable assumptions and explain them. If it is not a meal, leave estimatedItems empty. Do not claim to have searched a database or the web unless you actually did so.
User description: ${params.prompt || 'Estimate the food in the attached photo.'}`;
  const content: any[] = [{type:'text', text:prompt}];
  if (params.imageBase64 && params.imageMimeType) {
    content.push({type:'image_url', image_url:{url:`data:${params.imageMimeType};base64,${params.imageBase64}`}});
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${params.apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({model, messages:[{role:'user', content}]}),
    });
  } catch {
    throw new Error('Could not reach your relay. Check its URL, ALLOWED_ORIGIN, deployment and internet connection.');
  }
  const raw = await response.text();
  if (!response.ok) {
    let message = '';
    try { const obj = JSON.parse(raw); message = typeof obj.error === 'string' ? obj.error : obj.error?.message || ''; } catch { /* non-JSON error */ }
    throw new Error(`Arena/relay error ${response.status}${message ? `: ${String(message).slice(0, 400)}` : '. Check the relay and your Arena account.'}`);
  }
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new Error('Arena returned an unreadable response.'); }
  const value = data?.choices?.[0]?.message?.content;
  const text = typeof value === 'string' ? value : Array.isArray(value) ? value.map((p: any) => p?.text || '').join('') : '';
  if (!text.trim()) throw new Error('Arena returned no text. Check that your selected model is available to your API key.');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: any;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('Arena did not return a usable meal estimate. Try again or choose another model.'); }
  if (!parsed || !Array.isArray(parsed.estimatedItems)) throw new Error('Arena returned an incomplete meal estimate. Try again.');
  const items: ArenaMealItem[] = parsed.estimatedItems.map((item: any) => {
    const numbers = ['grams','calories','protein','carbs','fat'].map(k => Number(item?.[k]));
    if (typeof item?.name !== 'string' || !item.name.trim() || numbers.some(n => !Number.isFinite(n) || n < 0) || numbers[0] <= 0) throw new Error('Arena returned invalid nutrition values; please try again.');
    const fiber = item.fiber == null ? undefined : Number(item.fiber);
    if (fiber !== undefined && (!Number.isFinite(fiber) || fiber < 0)) throw new Error('Arena returned invalid nutrition values; please try again.');
    return { name:item.name.trim(), grams:numbers[0], calories:numbers[1], protein:numbers[2], carbs:numbers[3], fat:numbers[4], fiber };
  });
  return { reply: typeof parsed.reply === 'string' ? parsed.reply : 'Review these AI estimates before logging.', estimatedItems:items };
}
