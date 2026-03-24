# PDF Downloader

Generate PDFs from any public URL and download them individually or as a ZIP.

## Deploy to Vercel (5 steps)

1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project → Import your repo
3. Leave all settings as default (Vercel auto-detects)
4. Click Deploy
5. Done — your app is live

## Local development

```bash
npm install
npm install puppeteer   # full puppeteer for local only
node api/index.js       # runs on port 3000
```

Then open http://localhost:3000

## How it works

- Frontend: plain HTML/CSS/JS served as static files
- Backend: Vercel serverless function at /api/index.js
- PDF engine: Puppeteer Core + @sparticuz/chromium (works in Vercel serverless)
- Bulk download: JSZip loaded from CDN to zip multiple PDFs in browser

## Limits on Vercel free tier

- 10 second function timeout (hobby) → 60 seconds (pro)
- Max 5 URLs per bulk request (to stay within timeout)
- 50MB response size limit

## Notes

- Works with any publicly accessible URL
- Pages that require login will render the login page as PDF
- Dynamic JS-rendered pages are supported (2 second wait after load)
