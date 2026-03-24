const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');
const archiver = require('archiver');

// Helper: launch browser
async function getBrowser() {
  const isLocal = process.env.NODE_ENV === 'development';

  if (isLocal) {
    // Local development — use full puppeteer
    const puppeteer = require('puppeteer');
    return puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // Vercel serverless — use chromium binary
  return puppeteerCore.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

// Helper: generate single PDF buffer from URL
async function generatePDF(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    // Extra wait for dynamic/JS-rendered content
    await new Promise((r) => setTimeout(r, 2000));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

// Helper: extract filename from URL
function extractFilename(url, fallback = 'document.pdf') {
  try {
    const u = new URL(url);
    const fn = u.searchParams.get('fn');
    if (fn) return fn.endsWith('.pdf') ? fn : fn + '.pdf';
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.includes('.')) return last;
  } catch (_) {}
  return fallback;
}

// Main Vercel handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, urls } = req.body || {};
  const isBulk = Array.isArray(urls) && urls.length > 0;
  const isSingle = typeof url === 'string' && url.length > 0;

  if (!isSingle && !isBulk) {
    return res.status(400).json({ error: 'Provide url (single) or urls (array) in request body' });
  }

  // Vercel serverless max = 60s, limit bulk to 5 URLs to stay safe
  if (isBulk && urls.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 URLs per bulk request on serverless. Run in batches.' });
  }

  let browser;
  try {
    browser = await getBrowser();

    // ── Single PDF ────────────────────────────────────────────────────────────
    if (isSingle) {
      const filename = extractFilename(url);
      const pdf = await generatePDF(browser, url);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdf.length);
      return res.status(200).send(Buffer.from(pdf));
    }

    // ── Bulk PDFs → ZIP ───────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="documents.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    const results = [];
    for (let i = 0; i < urls.length; i++) {
      const entry = typeof urls[i] === 'string' ? { url: urls[i] } : urls[i];
      const filename = extractFilename(entry.url, `document_${i + 1}.pdf`);
      try {
        const pdf = await generatePDF(browser, entry.url);
        archive.append(Buffer.from(pdf), { name: filename });
        results.push({ url: entry.url, filename, status: 'ok' });
      } catch (err) {
        results.push({ url: entry.url, filename, status: 'failed', error: err.message });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  } finally {
    if (browser) await browser.close();
  }
};
