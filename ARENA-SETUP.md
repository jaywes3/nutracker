# Try Arena in OpenPhase

This adds Arena as an alternative to Gemini. Your recipes and diary stay on your phone. An Arena request sends your food description, any attached photo, and your API key to your Cloudflare relay and Arena; the Arena integration does not include your OpenPhase profile or diary. Results are AI estimates, not verified food-database entries. Review them before logging.

## 1. Install the updated OpenPhase

Unzip the release. Upload the updated `src`, `public`, and `docs` folders to your existing GitHub repository and commit them. If GitHub Pages uses GitHub Actions, also ensure the updated source and public folders are present. Wait for deployment, open your app over HTTPS, and reload it. **Do not delete site data**: that can delete your locally stored diary.

## 2. Deploy your own Cloudflare Worker relay

You need a Cloudflare account. Cloudflare's dashboard labels may change slightly. Cloudflare Workers and Arena may charge for usage; review their current pricing and limits.

1. Go to https://dash.cloudflare.com/ and sign in or create an account.
2. Open **Workers & Pages**, choose **Create application** → **Hello World / Create Worker**, give it a name such as `openphase-arena`, and deploy it. Set up a workers.dev subdomain if prompted.
3. Open that Worker and choose **Edit code**. In the extracted ZIP, open `relay/arena-worker.js` in a plain-text editor, copy all its contents, replace the example code in the Cloudflare editor, and deploy.
4. In the Worker dashboard, open **Settings → Variables and Secrets** (the label can vary). Add a **plain text environment variable** named exactly `ALLOWED_ORIGIN`. Set its value to the origin of your GitHub Pages website: for `https://yourname.github.io/openphase/`, use **`https://yourname.github.io`** (no repository name, path, or trailing slash). Save and deploy/redeploy if prompted.
5. Copy the Worker's `https://...workers.dev` URL from its dashboard. Visiting it in a browser should show “OpenPhase Arena relay is running.” This checks deployment only; it does not verify the API key, CORS, model, or request processing.

`ALLOWED_ORIGIN` permits browser requests from your GitHub Pages origin. It is not authentication: a non-browser client can forge an Origin header. The relay is public and sends only to Arena. It does not contain an Arena key and cannot spend your API credits unless a caller supplies a valid key, but others may send their own keys through it and consume Worker quota. Monitor usage; consider Cloudflare access controls/rate limiting if needed. Never put your Arena key in Worker code, GitHub, the URL, screenshots, or this chat.

The Worker script contains no prompt/key logging or storage code. However, Cloudflare processes requests, and platform-level request logs, diagnostics, retention and settings are governed by Cloudflare; Arena also receives the request and has its own terms. Review their privacy and logging settings. Only use a relay you control or trust. API keys stored in localStorage are not encrypted and may be accessible to scripts running on the same site or anyone with access to the device/browser.

## 3. Configure OpenPhase on each phone

1. Open OpenPhase → **Log Food** → **Describe**.
2. Choose **Arena** in the AI provider selector and tap **Arena Settings**.
3. Paste your deployed `https://...workers.dev` relay URL and your own Arena API key. Use the default model `coding-router-preview` if available, or enter a model enabled in your Arena workspace. This is a coding router, not a model specifically optimized for nutrition. Your workspace must permit API clients and the selected model; an account or key alone doesn't guarantee that. See https://platform.arena.ai/docs/opencode.
4. Tap **Save Arena Settings**, enter a meal description and tap **Ask Arena**. Review the response and estimated portions/macros before logging. To switch back, choose **Gemini**; the offline parser remains available without a key.
5. On the other person's phone, repeat the setup with their own Arena key. Both can use the same relay URL; their keys, saved meals and profiles remain separate on their devices. Either person can remove their saved Arena settings using the button in the app.

Photo analysis is supported in the app but depends on the selected Arena model and its availability. Arena/model responses and availability are not guaranteed; there is no automatic web or food-database search.

## Troubleshooting

- **Cannot reach relay / browser network error:** Check that the Worker is deployed, its workers.dev URL is exact, `ALLOWED_ORIGIN` is your site's origin without a path or slash, and you are online. Browser CORS errors can hide the underlying response.
- **401:** Check your Arena API key and its permissions; do not send it to anyone.
- **403:** Check `ALLOWED_ORIGIN`, and check Arena workspace/model access. Arena documentation notes some workspaces allow only approved apps.
- **429:** Check Arena quota and billing, or wait and retry.
- **No usable JSON / unsupported model / 400:** Select an Arena model that your key can use. Some models may not support photo inputs or the request format.
- **Old app still shows:** Reload after Pages finishes deploying. If installed as a PWA, close and reopen it and reload once more if needed. Never clear site data just to refresh.
