# God's Eye — Setup Guide (Step by Step)

You have: **Supabase project created**, **Vercel link working**.  
You need: **Run migration**, **create bucket**, **upload data**, **link Vercel to Supabase**, **set up backend**.

Do the steps in order. Each section tells you exactly where to click and what to type.

---

## Part 1: Supabase — Create the table and bucket

### Step 1.1 — Create the “saved moments” table

1. Open your Supabase project: go to [https://app.supabase.com](https://app.supabase.com) and click your project.
2. In the left sidebar, click **“SQL Editor”**.
3. Click **“New query”**.
4. Open the file **`supabase/migrations/001_saved_moments.sql`** from this project on your computer. Copy **all** of its text.
5. Paste it into the Supabase SQL Editor (the big text box).
6. Click **“Run”** (or press Ctrl+Enter).
7. You should see a green success message. If you see an error, copy it and share it with someone who can help.

---

### Step 1.2 — Create the storage bucket for Parquet files

1. Still in Supabase, in the left sidebar click **“Storage”**.
2. Click **“New bucket”**.
3. **Name:** type exactly: **`parquets`**
4. Turn **“Public bucket”** **ON** (so the app can read the files).
5. Click **“Create bucket”**.

---

### Step 1.3 — Get your Supabase keys (you’ll need these later)

1. In the left sidebar click **“Project Settings”** (gear icon at the bottom).
2. Click **“API”** in the left menu.
3. You need two values. Keep this page open or copy them somewhere safe:
   - **Project URL** — something like `https://abcdefgh.supabase.co`
   - **Project API keys:**
     - **anon public** — use this for Vercel (safe to use in the browser).
     - **service_role** — use this only for the backend and the upload script (never put this in the frontend).

---

## Part 2: Upload existing data to Supabase Storage

You only do this once. It uploads the Parquet files and metadata that are already in the project.

### Step 2.1 — Install Python (if you don’t have it)

- If you already use Python, skip to Step 2.2.
- Otherwise: go to [https://www.python.org/downloads/](https://www.python.org/downloads/), download and install Python. During setup, check **“Add Python to PATH”**.

### Step 2.2 — Open a terminal in your project folder

- **Windows:** Open File Explorer, go to the folder that contains `gods-eye`, `backend`, `scripts`, etc. Click the address bar, type `cmd` and press Enter. A black window (Command Prompt) will open in that folder.
- **Mac/Linux:** Open Terminal, then type: `cd` followed by a space, then drag your project folder onto the Terminal window and press Enter.

### Step 2.3 — Install the “requests” library

In that same terminal, run:

```bash
pip install requests
```

Wait until it finishes (no red errors).

### Step 2.4 — Set your Supabase URL and key

In the **same** terminal, run these two lines **one at a time**. Replace the placeholders with your real values from Step 1.3:

**Windows (Command Prompt):**
```bash
set SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
set SUPABASE_SERVICE_KEY=your-service-role-key-here
```

**Windows (PowerShell):**
```bash
$env:SUPABASE_URL="https://YOUR-PROJECT-ID.supabase.co"
$env:SUPABASE_SERVICE_KEY="your-service-role-key-here"
```

**Mac/Linux:**
```bash
export SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
export SUPABASE_SERVICE_KEY=your-service-role-key-here
```

Use your **Project URL** for `SUPABASE_URL` and the **service_role** key for `SUPABASE_SERVICE_KEY` (not the anon key).

### Step 2.5 — Run the upload script

In the **same** terminal (so the variables are still set), run:

```bash
python scripts/upload_to_supabase.py
```

You should see lines like “OK data/AmbroseValley/2026-02-10.parquet” and “Done — X uploaded, 0 failed”. If you see “0 uploaded” or errors, create the bucket first (Part 1, Step 1.2 — Storage → New bucket → name `parquets`, Public ON), then run the script again.

---

## Part 3: Link Vercel to Supabase

So the live app can use your Supabase project (saved moments + Parquet from Storage).

### Step 3.1 — Open Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign in.
2. Click your **God’s Eye** project (the one that gives you the working link).

### Step 3.2 — Add environment variables

1. Click **“Settings”** (top menu).
2. In the left sidebar, click **“Environment Variables”**.
3. Add **two** variables (click “Add” for each):

| Name                     | Value                                      | Environment      |
|--------------------------|--------------------------------------------|------------------|
| `VITE_SUPABASE_URL`      | Your Project URL (e.g. `https://xxx.supabase.co`) | Production (and Preview if you want) |
| `VITE_SUPABASE_ANON_KEY` | Your **anon public** key from Supabase      | Production (and Preview if you want) |

4. Click **“Save”** for each.

### Step 3.3 — Redeploy so the new variables are used

1. Go to the **“Deployments”** tab.
2. Find the latest deployment and click the **three dots (⋯)** next to it.
3. Click **“Redeploy”**.
4. Wait until the new deployment shows “Ready”. Then open your Vercel link again — the app will now load maps/dates from Supabase Storage and save moments to Supabase.

---

## Part 4: Backend (Render) — For uploading new raw files later

You only need this when you want to add **new** `.nakama-0` files without redeploying. The app works without it; saved moments and existing data already work after Part 3.

### Step 4.1 — Create a Render account and connect GitHub

1. Go to [https://render.com](https://render.com) and sign up (or sign in with GitHub).
2. Connect your GitHub account if asked.
3. Click **“New +”** → **“Web Service”**.

### Step 4.2 — Connect the same GitHub repo

1. Find the repo **`lila-games-designer-god-s-eye`** and click **“Connect”**.
2. Use these settings:
   - **Name:** e.g. `gods-eye-api`
   - **Region:** pick one close to you
   - **Branch:** `main`
   - **Root Directory:** type **`backend`** (important!)
   - **Runtime:** **Python 3**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Step 4.3 — Add environment variables on Render

1. Scroll to **“Environment Variables”** and click **“Add Environment Variable”**.
2. Add two variables:
   - **Key:** `SUPABASE_URL` → **Value:** your Supabase Project URL (same as in Part 3).
   - **Key:** `SUPABASE_SERVICE_KEY` → **Value:** your Supabase **service_role** key (same as in Part 2).
3. Click **“Create Web Service”**.

### Step 4.4 — Wait for the first deploy

Render will build and start the service. When the status is **“Live”**, the backend is ready. You can then use something like Postman or a small script to send new `.nakama-0` files to `POST https://your-service-name.onrender.com/api/upload` with a `date` field — but that’s optional for now.

---

## Checklist

- [ ] **Part 1:** Table created in Supabase (SQL Editor), bucket `parquets` created and public.
- [ ] **Part 2:** Ran `python scripts/upload_to_supabase.py` successfully.
- [ ] **Part 3:** Added `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and redeployed.
- [ ] **Part 4 (optional):** Created Render Web Service with root `backend` and added `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

After Part 3, your Vercel link should show maps, dates, and save/load moments across sessions. Part 4 is only for adding new data via the API later.
