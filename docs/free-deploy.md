# Free Deploy MVP

This mode costs 0 rubles for hosting the public frontend.

## What Runs Where

- Cloudflare Pages: static React frontend.
- Your Mac: API + worker + Clarity parser.
- Wasabi: replay files.
- Cloudflare Quick Tunnel: public HTTPS URL to the API on your Mac.

If the Mac is off or sleeping, API, upload completion, and parsing are offline.

## Cloudflare Pages

Connect the GitHub repository to Cloudflare Pages.

Build settings:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: apps/web/dist
Root directory: /
```

Cloudflare Pages free limits are enough for the static frontend MVP. Static asset requests are free/unlimited; free builds are limited by Cloudflare Pages plan limits.

## API Tunnel

Run the project locally:

```bash
npm run dev:lan
```

Expose only the API through a free Cloudflare Quick Tunnel:

```bash
cloudflared tunnel --url http://localhost:4300
```

Cloudflare prints a public URL like:

```text
https://example-random.trycloudflare.com
```

Open the deployed frontend with the API URL:

```text
https://your-project.pages.dev/upload?api=https://example-random.trycloudflare.com
```

The frontend stores that API URL in localStorage. If Quick Tunnel gives a new URL later, open the same Pages site with the new `?api=...` once.

## Later Upgrade

For a permanent 24/7 backend without your Mac, move API + worker to VPS, Fly.io, Render, Railway, or Coolify. The frontend can stay on Cloudflare Pages.
