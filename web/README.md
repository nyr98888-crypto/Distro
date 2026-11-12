# Legacy / unused for Vercel

The **active** Distro app is the **repository root** (`../app`, `../package.json`).

Vercel project `distro` uses **Root Directory = `./`** (not `web`).

Do not set Root Directory to `web` — that produces `/web/web/package.json` path errors.

```bash
cd ..   # repo root
npm run build
```

Live app: https://distro-ecru.vercel.app/dashboard/channels
