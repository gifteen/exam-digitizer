# Exam Digitizer

Convert scanned exam papers into clean, editable Word/PDF documents.

## Files
- `index.html` — the full app (frontend)
- `api/extract.js` — serverless function (hides API key from users)
- `vercel.json` — deployment config

---

## Deploy to Vercel (step by step)

### Step 1 — Push to GitHub
1. Create a free account at github.com
2. Click **New repository** → name it `exam-digitizer` → Create
3. Upload these 3 files (drag & drop on GitHub works):
   - `index.html`
   - `vercel.json`
   - `api/extract.js` ← make sure this is inside a folder called `api`

### Step 2 — Deploy on Vercel
1. Go to vercel.com → sign up free (use your GitHub account)
2. Click **Add New → Project**
3. Find and import your `exam-digitizer` repo
4. Click **Deploy** (no settings to change)

### Step 3 — Add your API key (IMPORTANT)
This is what hides the key from users:
1. In your Vercel project, go to **Settings → Environment Variables**
2. Add a new variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
3. Click **Save**
4. Go to **Deployments** → click the 3 dots on your latest deploy → **Redeploy**

That's it. Your coworkers open the URL and use the tool — no key input, nothing to set up.

---

## Features
- Upload JPG, PNG, or PDF
- AI extracts text with full structure preserved
- Uncertain words highlighted in yellow for review
- Find & Replace for quick fixes
- Export as Word (.docx), PDF, or plain text
- Works on mobile

## Cost
Each page costs roughly $0.01–0.03 to extract depending on complexity.
