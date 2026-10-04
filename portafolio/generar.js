// Genera portafolio.pdf a partir de productos.json (una página por producto + portada con índice).
// Uso: node generar.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const productos = JSON.parse(fs.readFileSync(path.join(__dirname, 'productos.json'), 'utf8'));

const COLORES = {
  'Comercio y punto de venta': '#1f6feb',
  'Gastronomía': '#d9480f',
  'Industria y distribución': '#2b8a3e',
  'Logística y ventas en calle': '#0c8599',
  'Finanzas': '#7048e8',
  'Servicios técnicos': '#c2255c',
  'Turnos y servicios': '#e67700',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const check = (c) => `<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${c}" opacity=".14"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Índice agrupado por categoría
const grupos = [];
productos.forEach((p, i) => {
  let g = grupos.find((x) => x.cat === p.cat);
  if (!g) grupos.push((g = { cat: p.cat, items: [] }));
  g.items.push({ ...p, pag: i + 2 });
});

const portada = `
<section class="page cover">
  <div class="cover-head">
    <div class="eyebrow">Portafolio de productos</div>
    <h1>Software de gestión<br>para cada rubro</h1>
    <p class="lead">${productos.length} sistemas desarrollados a medida, listos para adaptarse a tu negocio.</p>
  </div>
  <div class="index">
    ${grupos.map((g) => `
      <div class="ig">
        <div class="ig-cat" style="color:${COLORES[g.cat]}">${esc(g.cat)}</div>
        ${g.items.map((p) => `<div class="ii"><span class="ii-name">${esc(p.name)}</span><span class="ii-dots"></span><span class="ii-pag">${p.pag}</span></div>`).join('')}
      </div>`).join('')}
  </div>
</section>`;

const paginas = productos.map((p, i) => {
  const c = COLORES[p.cat];
  return `
<section class="page prod" style="--c:${c}">
  <div class="band"></div>
  <header>
    <div class="cat">${esc(p.cat)}</div>
    <h2>${esc(p.name)}</h2>
    <p class="tagline">${esc(p.tagline)}</p>
  </header>
  <div class="meta">
    <div><span class="lbl">Ideal para</span><span class="val">${esc(p.rubro)}</span></div>
    <div><span class="lbl">Plataformas</span><span class="chips">${p.plat.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</span></div>
  </div>
  <h3>Funciones principales</h3>
  <ul class="fn">
    ${p.fn.map((f) => `<li>${check(c)}<span>${esc(f)}</span></li>`).join('')}
  </ul>
  <div class="dif">
    <div class="lbl">Lo que lo distingue</div>
    <p>${esc(p.dif)}</p>
  </div>
  <footer>
    <span>${p.ref ? `Implementado en: <b>${esc(p.ref)}</b>` : ''}</span>
    <span class="pn">${i + 2}</span>
  </footer>
</section>`;
}).join('');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Liberation Sans', 'DejaVu Sans', sans-serif; color: #1b1f24; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; padding: 22mm 20mm 18mm; }
  .page:last-child { page-break-after: auto; }

  /* Portada */
  .cover { background: #0f1720; color: #f3f5f7; display: flex; flex-direction: column; }
  .cover .eyebrow { text-transform: uppercase; letter-spacing: .18em; font-size: 10pt; color: #8fb3ff; font-weight: 600; }
  .cover h1 { font-size: 34pt; line-height: 1.08; font-weight: 800; margin: 5mm 0 4mm; letter-spacing: -.02em; }
  .cover .lead { font-size: 12pt; color: #b8c2cc; max-width: 140mm; line-height: 1.45; }
  .index { margin-top: 22mm; columns: 2; column-gap: 12mm; }
  .ig { break-inside: avoid; margin-bottom: 9mm; }
  .ig-cat { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; margin-bottom: 2mm; filter: brightness(1.6); }
  .ii { display: flex; align-items: baseline; font-size: 12pt; padding: 1.6mm 0; }
  .ii-name { font-weight: 500; }
  .ii-dots { flex: 1; border-bottom: 1px dotted #4a5561; margin: 0 2mm; transform: translateY(-1mm); }
  .ii-pag { color: #8b97a3; font-variant-numeric: tabular-nums; }

  /* Producto */
  .band { position: absolute; top: 0; left: 0; right: 0; height: 7mm; background: var(--c); }
  .cat { text-transform: uppercase; letter-spacing: .16em; font-size: 9pt; font-weight: 700; color: var(--c); margin-top: 4mm; }
  h2 { font-size: 36pt; font-weight: 800; letter-spacing: -.02em; margin: 3mm 0 3mm; line-height: 1.05; }
  .tagline { font-size: 15pt; color: #4a5561; line-height: 1.35; max-width: 160mm; }
  .meta { margin: 14mm 0 13mm; display: grid; gap: 4mm; padding: 6mm 0; border-top: 1px solid #e3e7eb; border-bottom: 1px solid #e3e7eb; }
  .meta > div { display: grid; grid-template-columns: 34mm 1fr; align-items: center; }
  .lbl { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .12em; color: #7a8590; font-weight: 600; }
  .val { font-size: 11.5pt; font-weight: 500; }
  .chips { display: flex; flex-wrap: wrap; gap: 2mm; }
  .chip { font-size: 9.5pt; padding: 1.2mm 3mm; border-radius: 99px; background: color-mix(in srgb, var(--c) 10%, white); color: color-mix(in srgb, var(--c) 80%, black); font-weight: 600; }
  h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: .14em; color: #7a8590; font-weight: 700; margin-bottom: 5mm; }
  .fn { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm 10mm; }
  .fn li { display: flex; gap: 3mm; align-items: flex-start; font-size: 12.5pt; line-height: 1.4; }
  .fn svg { flex: none; margin-top: .3mm; }
  .dif { margin-top: 16mm; padding: 7mm 8mm; border-radius: 4mm; background: color-mix(in srgb, var(--c) 7%, white); border-left: 2mm solid var(--c); }
  .dif p { font-size: 13pt; font-weight: 600; line-height: 1.4; margin-top: 2mm; }
  footer { position: absolute; left: 20mm; right: 20mm; bottom: 12mm; display: flex; justify-content: space-between; font-size: 9.5pt; color: #7a8590; border-top: 1px solid #e3e7eb; padding-top: 3mm; }
  footer b { color: #1b1f24; font-weight: 600; }
  .pn { font-variant-numeric: tabular-nums; }
</style></head><body>${portada}${paginas}</body></html>`;

(async () => {
  const out = path.join(__dirname, 'portafolio.html');
  fs.writeFileSync(out, html);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('file://' + out, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: path.join(__dirname, 'portafolio.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log('OK');
})();
