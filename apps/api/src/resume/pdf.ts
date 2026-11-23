import { parseLocation, type Resume } from '@jobapp/shared';
import { chromium, type Browser } from 'playwright';

export type PaperSize = 'Letter' | 'A4';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
}

const displayUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** US and Canada print on Letter; everyone else on A4. */
export function defaultPaper(resume: Resume): PaperSize {
  const cc = parseLocation(resume.contact.location).countryCode;
  return cc === 'US' || cc === 'CA' ? 'Letter' : 'A4';
}

/**
 * Single-column, ATS-safe layout: real text (no images or tables), standard section headings,
 * one font, consistent date format. Keep it boring on purpose: parsers read it reliably.
 */
export function renderResumeHtml(r: Resume): string {
  const c = r.contact;
  const contactBits = [
    c.location,
    c.phone,
    c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
    c.linkedinUrl && `<a href="${esc(c.linkedinUrl)}">${esc(displayUrl(c.linkedinUrl))}</a>`,
    c.portfolioUrl && `<a href="${esc(c.portfolioUrl)}">${esc(displayUrl(c.portfolioUrl))}</a>`,
  ]
    .filter(Boolean)
    .map((b) => (b!.startsWith('<a') ? b : esc(b!)));

  const experience = r.experience
    .filter((e) => e.roleTitle || e.company || e.bullets.length)
    .map((e) => {
      const dates = [e.startDate, e.endDate].filter(Boolean).map(fmtDate).join(' – ');
      const sub = [e.company, e.location].filter(Boolean).map(esc).join(' · ');
      const bullets = e.bullets.filter((b) => b.trim()).map((b) => `<li>${esc(b)}</li>`).join('');
      return `<div class="entry">
        <div class="row"><span class="title">${esc(e.roleTitle)}</span><span class="dates">${esc(dates)}</span></div>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
        ${bullets ? `<ul>${bullets}</ul>` : ''}
      </div>`;
    })
    .join('');

  const education = r.education
    .filter((e) => e.degree || e.institution)
    .map(
      (e) => `<div class="entry">
        <div class="row"><span class="title">${esc(e.degree || e.institution)}</span><span class="dates">${esc(e.graduationYear)}</span></div>
        ${e.degree && e.institution ? `<div class="sub">${esc(e.institution)}</div>` : ''}
      </div>`,
    )
    .join('');

  const section = (title: string, body: string) => (body.trim() ? `<section><h2>${title}</h2>${body}</section>` : '');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(c.fullName || 'Resume')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.38; color: #111; }
  h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: 0.2pt; }
  .contact { font-size: 9.5pt; color: #333; }
  .contact span + span::before { content: " | "; color: #888; }
  a { color: inherit; text-decoration: none; }
  section { margin-top: 12pt; }
  h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1pt; margin: 0 0 5pt;
       padding-bottom: 2pt; border-bottom: 0.75pt solid #222; }
  .entry { margin-bottom: 8pt; break-inside: avoid-page; }
  .row { display: flex; justify-content: space-between; gap: 12pt; }
  .title { font-weight: bold; }
  .dates { white-space: nowrap; color: #333; }
  .sub { font-style: italic; color: #333; }
  ul { margin: 3pt 0 0; padding-left: 14pt; }
  li { margin-bottom: 2pt; }
  p { margin: 0; }
  .skills { margin: 0; }
</style></head>
<body>
  <header>
    <h1>${esc(c.fullName)}</h1>
    <div class="contact">${contactBits.map((b) => `<span>${b}</span>`).join('')}</div>
  </header>
  ${section('Summary', r.summary ? `<p>${esc(r.summary)}</p>` : '')}
  ${section('Experience', experience)}
  ${section('Skills', r.skills.length ? `<p class="skills">${r.skills.map(esc).join(', ')}</p>` : '')}
  ${section('Education', education)}
</body></html>`;
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch({ headless: true }).catch((err) => {
    browserPromise = null;
    throw err;
  });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  const b = browserPromise;
  browserPromise = null;
  if (b) await (await b).close();
}

export async function renderResumePdf(resume: Resume, paper: PaperSize = defaultPaper(resume)): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(renderResumeHtml(resume), { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: paper,
      printBackground: false,
      margin: { top: '0.55in', bottom: '0.55in', left: '0.65in', right: '0.65in' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
