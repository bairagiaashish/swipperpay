# Putting SwipperPay online (GitHub Pages)

You'll end up with a public HTTPS link like:

```
https://YOUR-USERNAME.github.io/swipperpay/
```

Anyone with that link can open it, and on Android they can install it as an app.
Each person's data stays private on their own phone.

> **HTTPS matters.** The offline mode and the "install app" prompt only work on
> `https://` or `localhost`. GitHub Pages gives you HTTPS for free.

---

## Path A — No software to install (browser only)

Git isn't installed on this PC, so this is the quickest route.

### 1. Create the repository

1. Sign in at <https://github.com> (create a free account if you need one).
2. Click **+** (top right) → **New repository**.
3. **Repository name:** `swipperpay`
4. Set it to **Public**.
5. Leave "Add a README" unchecked. Click **Create repository**.

### 2. Upload the files

1. On the empty repo page, click **uploading an existing file**.
2. Open `D:\CC_APP` in File Explorer.
3. Select these and drag them into the browser window:
   - the `public` folder
   - the `.github` folder
   - `README.md`
4. Click **Commit changes**.

> **If `.github` won't upload:** Explorer hides folders starting with a dot in some
> views. Turn on *View → Show → Hidden items*. If it still won't go, skip it and use
> **Path C** below instead — it doesn't need that folder.

### 3. Turn on Pages

1. In the repo, go to **Settings** → **Pages** (left sidebar).
2. Under **Source**, choose **GitHub Actions** from the dropdown.
3. Go to the **Actions** tab. A "Deploy to GitHub Pages" run starts on its own.
4. Wait for the green tick (about 1 minute), then open **Settings → Pages** again —
   your live link is shown at the top.

### 4. Later updates

Edit a file in the repo on github.com (pencil icon) → **Commit changes**.
The site redeploys automatically within a minute.

---

## Path B — Using Git (better once you're set up)

Install Git first: <https://git-scm.com/download/win> (accept all defaults).
Close and reopen your terminal afterwards so `git` is on your PATH.

```powershell
cd D:\CC_APP

git init -b main
git add .
git commit -m "SwipperPay: attendance and pay tracker"

# Create an empty PUBLIC repo named swipperpay on github.com first, then:
git remote add origin https://github.com/YOUR-USERNAME/swipperpay.git
git push -u origin main
```

Then do **step 3** from Path A (Settings → Pages → Source: GitHub Actions).

Afterwards, publishing a change is three commands:

```powershell
git add .
git commit -m "Describe what changed"
git push
```

---

## Path C — Branch-based Pages (fallback, no Actions)

Use this only if the `.github` workflow folder gave you trouble.

1. Create the `swipperpay` repo as in Path A step 1.
2. Upload **the contents of `public/`** — not the folder itself. Open `D:\CC_APP\public`,
   select everything inside it (`index.html`, `style.css`, `script.js`, `sw.js`,
   `manifest.json`, and all the icons), and drag those into GitHub. Commit.
3. **Settings → Pages → Source:** *Deploy from a branch* → Branch: `main` → Folder: `/ (root)` → **Save**.
4. Wait a minute, then reload that page for your link.

With this layout the live site works the same, but the copy on GitHub no longer
matches the `public/` folder on your PC, so remember which files you edited where.

---

## Installing it on Android

Once the site is live:

1. Open the link in **Chrome** on the phone.
2. Either tap the **⬇ Install app** button in the top-right of the app,
   or use Chrome's **⋮** menu → **Add to Home screen** → **Install**.
3. It gets a real icon in the app drawer, opens without browser chrome, and
   works with no internet after the first visit.

On **iPhone**, use Safari → **Share** → **Add to Home Screen**.

### Why there's no Play Store `.apk`

An installed PWA behaves like a normal app for this kind of tool, and needs no
build tools, no signing keys, and no $25 Play Store developer fee. If you later
want an actual `.apk` to sideload or publish, the live URL above is all that
<https://www.pwabuilder.com> needs to generate one — say the word and I'll set
that up.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Page loads but is unstyled | You uploaded `index.html` without `style.css`, or used Path C but uploaded the `public` folder instead of its contents. |
| 404 at the Pages link | Deploy hasn't finished. Check the **Actions** tab for a green tick. |
| No **Install app** button | Needs HTTPS, so it won't appear on `localhost` in every browser. Use Chrome on the live link. Also won't show if it's already installed. |
| Changes don't show up | The service worker serves a cached copy. Pull down to refresh, or bump `CACHE` in [`public/sw.js`](public/sw.js) and redeploy. |
| Data vanished | It's per-browser and per-device by design. Clearing site data or switching phones loses it — use **Workers → Export backup** regularly. |
