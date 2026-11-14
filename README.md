# OpenPhase — Local-First Adaptive TDEE & Macro Coach

A local-first nutrition, recipe, and Adaptive TDEE coaching Progressive Web App (PWA) inspired by MacroFactor and MacroPhase. Core app data is stored on-device. Optional online food and AI features contact third-party services; the optional Arena integration additionally requires your own relay. See `ARENA-SETUP.md` for privacy and setup details.

---

## Privacy & Multi-User Guarantee

- **Zero personal data in this repository:** Hosting this repository publicly on GitHub Pages publishes **only** the static application code.
- **Separate on-device storage:** Each person's weight history, diary, recipes and optional API keys are stored in their own browser's local storage (`localStorage`). Optional online features send the requested food search, description, photo, or relevant coaching context to their service providers. Arena sends descriptions/photos and the API key through your relay; see `ARENA-SETUP.md`. API keys in localStorage are not encrypted.
- **1-Tap Phone-to-Phone Recipe Sharing:** You can share saved multi-ingredient recipes via SMS/iMessage/WhatsApp (`Recipes` → `Share`) using self-contained `#recipe=OPR1:...` links without ever sharing personal health or diary data.

---

## Fastest GitHub Pages Setup (No Command Line Needed)

This repository already includes a pre-built production `/docs` folder so GitHub Pages can publish it immediately:

1. Create a new **Public** repository on [github.com/new](https://github.com/new) (for example, `openphase`).
2. Click **uploading an existing file** (or **Add file → Upload files**), drag and drop all unzipped files/folders from this project (making sure the `docs` folder is included), and click **Commit changes**.
3. Go to **Settings → Pages** in your repository:
   - Under **Build and deployment → Source**, keep **Deploy from a branch**.
   - Select Branch: **`main`** and Folder: **`/docs`**, then click **Save**.
4. Wait ~60 seconds and open `https://<your-github-username>.github.io/<repo-name>/` on your phone!

*(Advanced option: `.github/workflows/deploy.yml` is also included if you prefer **Source: GitHub Actions** when editing TypeScript files in `src/` directly.)*

---

## Installing on Your Phone (Full-Screen App Mode)

- **iPhone (Safari):** Open your `https://<username>.github.io/<repo-name>/` link in **Safari** → tap the **Share** button (square with up arrow) → scroll down and tap **Add to Home Screen** → tap **Add**.
- **Android (Chrome):** Open your link in **Chrome** → tap the **⋮** menu (top right) → tap **Install app** (or **Add to Home screen**).

> **Important Tip for iPhone:** Once you add OpenPhase to your Home Screen, always use it from that Home Screen icon (iOS gives Home Screen web apps their own dedicated, persistent storage bucket separate from regular Safari tabs).

---

## Dashboard food timeline and trends

The dashboard shows foods logged for the selected date beneath the weigh-in, with assigned times displayed by hour. **Copy Yesterday** adds entries from the preceding date. **Edit** changes the amount for one logged entry, in grams or servings, and proportionally updates that entry's calories, macros and micronutrients. It does not change the saved food or recipe. Imported entries without a positive original weight cannot be resized. Use the date arrows above the dashboard to view another day.

The **Trends** tab contains EWMA weight, Adaptive TDEE and both trend charts. The Mark Day Incomplete button has been removed; previously marked partial dates remain in your data and are still excluded from Adaptive TDEE calculations.

---

## Custom food barcode and label photo

In **Log Food → Custom → Save Reusable Custom Food**, tap **Scan** beside the barcode to capture its digits without a database lookup. Camera use needs permission and a secure HTTPS page. The number remains editable.

In either Custom mode, tap **Take Label Photo** or **Choose Photo**, then **Read Label with Arena**. This uses the existing Arena key, selected model, and Cloudflare relay configured under Describe → Arena Settings; it requires a vision-capable model and an internet connection. The photo is sent only after the Read button is tapped. The model fills editable per-serving fields; it can make mistakes. Always verify the serving weight, calories and nutrients against the actual label. Unreadable values are left blank, and the app asks for serving weight and calories before saving. Blank optional nutrients are logged as zero, so fill them in if known. Label photos may incur API charges and are subject to relay and provider privacy terms. No relay update is needed for this feature.

---

## Local Development (Optional)

```bash
npm install
npm run dev      # Starts dev server on http://localhost:5173
npm run build    # Compiles production PWA directly into ./docs
```
