# OpenPhase — Local-First Adaptive TDEE & Macro Coach

A 100% client-side, local-first nutrition, recipe, and Adaptive TDEE coaching Progressive Web App (PWA) inspired by MacroFactor and MacroPhase—built with **zero backend servers, zero telemetry, and isolated on-device storage**.

---

## Privacy & Multi-User Guarantee

- **Zero personal data in this repository:** Hosting this repository publicly on GitHub Pages publishes **only** the static application code.
- **100% isolated per device:** Every person who opens your GitHub Pages link stores their weight history, TDEE, food diary, custom barcodes, saved recipes, and optional BYOK Gemini API key strictly inside **their own phone or browser's local storage (`localStorage`)**.
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

## Local Development (Optional)

```bash
npm install
npm run dev      # Starts dev server on http://localhost:5173
npm run build    # Compiles production PWA directly into ./docs
```
