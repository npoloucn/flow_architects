/**
 * Mide la barra superior en varios anchos y temas (sin Supabase real).
 *   node scripts/medir-header.mjs            (arranca su propio vite con env falsas en :5199)
 * Comprueba: ningun par de controles se intersecta, sin scroll horizontal, nav y "Salir" visibles y clicables.
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = 5199;
const BASE = `http://localhost:${PORT}/`;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = path.resolve("docs/img");
const ANCHOS = (process.env.ANCHOS ?? "1920,1440,1280,1024,900,800,640,480").split(",").map(Number);
const EMAIL = "giraldosernaalejandro16@gmail.com";
const NOMBRE = "Arquitectura de integracion de pagos corporativos y canales digitales";

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], {
  env: { ...process.env, VITE_SUPABASE_URL: "http://127.0.0.1:9", VITE_SUPABASE_ANON_KEY: "x" }, stdio: "ignore",
});
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await espera(500); }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
let fallos = 0;
const log = (ok, m) => { if (!ok) fallos++; console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); };

async function preparar(page, tema, ancho) {
  await page.evaluateOnNewDocument((t) => localStorage.setItem("flowarq.tema", t), tema);
  await page.setViewport({ width: ancho, height: 700 });
  await page.goto(BASE + "#/proyectos", { waitUntil: "networkidle0" });
  await page.evaluate(async (email, nombre) => {
    const { useAuth } = await import("/src/store/authStore.ts");
    const { useProjectStore } = await import("/src/store/projectStore.ts");
    const { proyectoVacio } = await import("/src/persistence/coleccion.ts");
    useAuth.setState({ user: { id: "u1", email, user_metadata: {} }, cargando: false });
    await new Promise((r) => setTimeout(r, 300));
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const doc = { ...proyectoVacio(nombre, ""), id };
    useProjectStore.setState({ doc, projectId: id, modo: "cloud", revision: 3, miRol: "owner", visibilidad: "privado", ultimoGuardado: new Date().toISOString(), past: [doc], future: [] });
    window.location.hash = `#/proyecto/${id}/canvas`;
  }, EMAIL, NOMBRE);
  await espera(700);
}

const medir = () => {
  const bar = document.querySelector(".appbar");
  const sel = ".brand-link, .crumb-proj, .brand .sync-note, .mainnav a, .bar-actions > .bar-btn, .bar-actions .menu-wrap > .bar-btn";
  const els = [...bar.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
  const r = els.map((e) => { const b = e.getBoundingClientRect(); return { n: (e.getAttribute("aria-label") || e.textContent || e.className).trim().slice(0, 24), l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; });
  const solapes = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], c = r[j];
    if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) solapes.push(`${a.n} x ${c.n}`);
  }
  const bb = bar.getBoundingClientRect();
  const fuera = r.filter((x) => x.l < -0.5 || x.r > innerWidth + 0.5 || x.t < bb.top - 0.5 || x.b > bb.bottom + 0.5).map((x) => x.n);
  const nav = [...bar.querySelectorAll(".mainnav a")].map((a) => a.getBoundingClientRect().width > 0);
  const de = document.documentElement;
  return { solapes, fuera, n: r.length, nav, alto: bb.height, sw: de.scrollWidth, cw: de.clientWidth, barSw: bar.scrollWidth, barCw: bar.clientWidth, truncado: [...bar.querySelectorAll(".crumb-proj,.user-name")].map((e) => `${e.className}:${e.scrollWidth > e.clientWidth ? "elipsis" : "completo"}`) };
};

const clicable = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return false;
  const b = e.getBoundingClientRect(); if (!b.width) return false;
  const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
  return !!t && (e === t || e.contains(t));
}, sel);

for (const tema of ["oscuro", "claro"]) {
  for (const ancho of ANCHOS) {
    const page = await browser.newPage();
    await preparar(page, tema === "oscuro" ? "dark" : "light", ancho);
    const m = await page.evaluate(medir);
    const tag = `${ancho}px ${tema}`;
    log(m.solapes.length === 0, `${tag} solapes=${m.solapes.join("; ") || "ninguno"} (${m.n} controles)`);
    log(m.fuera.length === 0, `${tag} dentro de la barra/viewport ${m.fuera.join(",")}`);
    log(m.sw <= m.cw && m.barSw <= m.barCw, `${tag} sin scroll horizontal (doc ${m.sw}/${m.cw}, barra ${m.barSw}/${m.barCw}) alto=${m.alto} ${m.truncado.join(" ")}`);
    log(m.nav.length === 4 && m.nav.every(Boolean), `${tag} navegacion visible`);
    for (const s of [".mainnav a:nth-child(1)", ".mainnav a:nth-child(2)", ".mainnav a:nth-child(3)", ".mainnav a:nth-child(4)"]) {
      if (!(await clicable(page, s))) log(false, `${tag} ${s} no clicable`);
    }
    // menu de usuario -> salir
    await page.click('[data-testid="menu-usuario"]');
    await espera(150);
    const okSalir = await clicable(page, '[data-testid="salir"]');
    const menuRect = await page.evaluate(() => { const b = document.querySelector(".menu")?.getBoundingClientRect(); return b ? b.left >= 0 && b.right <= innerWidth : false; });
    log(okSalir && menuRect, `${tag} salir visible y clicable desde el menu del avatar`);
    if (tema === "oscuro" && ancho === 1920) await page.screenshot({ path: `${OUT}/header-1920-oscuro.png`, clip: { x: 0, y: 0, width: 1920, height: 150 } });
    if (tema === "claro" && ancho === 1024) await page.screenshot({ path: `${OUT}/header-1024-claro-usuario.png`, clip: { x: 0, y: 0, width: 1024, height: 150 } });
    await page.keyboard.press("Escape");
    if (ancho === 1920 || ancho === 1024) await page.screenshot({ path: `${OUT}/_tmp.png`, clip: { x: 0, y: 0, width: 10, height: 10 } });
    if (tema === "oscuro" && ancho === 1280) await page.screenshot({ path: `${OUT}/header-1280-oscuro.png`, clip: { x: 0, y: 0, width: 1280, height: 60 } });
    if (tema === "claro" && ancho === 1024) await page.screenshot({ path: `${OUT}/header-1024-claro.png`, clip: { x: 0, y: 0, width: 1024, height: 60 } });
    if (ancho <= 900) {
      await page.click('[data-testid="mas-acciones"]');
      await espera(150);
      const items = await page.evaluate(() => [...document.querySelectorAll(".menu [role=menuitem]")].map((e) => e.textContent.trim()));
      log(items.length >= 5, `${tag} menu mas acciones: ${items.join(" | ")}`);
      if (tema === "oscuro" && ancho === 800) await page.screenshot({ path: `${OUT}/header-menu-acciones-oscuro.png`, clip: { x: 0, y: 0, width: 800, height: 300 } });
      await page.keyboard.press("Escape");
    }
    await page.close();
  }
}
await browser.close();
vite.kill();
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
process.exit(fallos ? 1 : 0);
