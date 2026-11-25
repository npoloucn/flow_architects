/**
 * E2E manual contra el Supabase real, con Edge headless (puppeteer-core).
 *
 *   node scripts/e2e-supabase.mjs
 *
 * Requiere `npm run dev` escuchando en http://localhost:5173 y las variables
 * VITE_SUPABASE_* cargadas por Vite (no las lee el script).
 *
 * Deja usuarios y proyectos de prueba: al final imprime los correos para limpiarlos.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:5173/";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SHOTS = path.resolve("capturas");
const TS = Date.now();
const USER_A = `e2e-a+${TS}@example.com`;
const USER_B = `e2e-b+${TS}@example.com`;
const PASS = "E2ePass1234!";
const estado = { usuarios: [USER_A, USER_B], proyectos: [], pasos: [] };

const ok = (nombre, extra = "") => { estado.pasos.push({ nombre, ok: true, extra }); console.log(`PASS  ${nombre}${extra ? " :: " + extra : ""}`); };
const fallo = (nombre, extra = "") => { estado.pasos.push({ nombre, ok: false, extra }); console.log(`FAIL  ${nombre}${extra ? " :: " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickTexto(page, selector, texto) {
  const hs = await page.$$(selector);
  for (const h of hs) {
    const t = await h.evaluate((el) => el.textContent || "");
    if (t.toLowerCase().includes(texto.toLowerCase())) {
      await h.click();
      return true;
    }
  }
  throw new Error(`No encontre "${texto}" en ${selector}`);
}

async function rellenar(page, sel, valor) {
  await page.waitForSelector(sel, { visible: true, timeout: 15000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, valor);
}

async function visible(page, sel, timeout = 15000) {
  await page.waitForSelector(sel, { visible: true, timeout });
}

async function textoVisible(page, texto, timeout = 15000) {
  await page.waitForFunction((t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()), { timeout }, texto);
}

async function goto(page, hash = "") {
  await page.goto(BASE + hash, { waitUntil: "domcontentloaded" });
}

async function sinSesion(page) {
  await page.waitForFunction(() => !document.querySelector(".auth-card"), { timeout: 20000 });
}

async function login(page, email, pass) {
  await goto(page);
  await visible(page, ".auth-card");
  await rellenar(page, '.auth-card input[type="email"]', email);
  await rellenar(page, '.auth-card input[type="password"]', pass);
  await clickTexto(page, ".auth-card button", "Entrar");
  await sinSesion(page);
}

async function registrar(page, email, pass) {
  await goto(page);
  await visible(page, ".auth-card");
  await clickTexto(page, ".auth-card .link-btn", "Crear una cuenta");
  await rellenar(page, '.auth-card input[type="email"]', email);
  const passInputs = await page.$$('.auth-card input[type="password"]');
  await passInputs[0].type(pass);
  await passInputs[1].type(pass);
  await clickTexto(page, '.auth-card button[type="submit"]', "Crear cuenta");
  await sinSesion(page);
}

async function abrirLista(page) {
  await page.evaluate(() => { window.location.hash = "#/proyectos"; });
  await page.waitForFunction(() => document.querySelector(".page-head h1")?.textContent === "Proyectos", { timeout: 25000 });
  await page.waitForFunction(() => document.querySelector(".ptable") || document.querySelector(".onboard") || document.querySelector(".empty-block"), { timeout: 25000 });
}

async function nuevoProyecto(page, nombre) {
  const tieneTest = await page.$('[data-testid="nuevo-proyecto"]');
  if (tieneTest) await tieneTest.click();
  else await clickTexto(page, ".page button", "Crear proyecto");
  await visible(page, "#pnf-title");
  await rellenar(page, ".dialog input.inp", nombre);
  await clickTexto(page, '.dialog button[type="submit"]', "Crear proyecto");
  await page.waitForFunction(() => /#\/proyecto\/[0-9a-f-]+\/canvas/.test(location.hash), { timeout: 20000 });
  await visible(page, ".stage, .react-flow");
  const id = await page.evaluate(() => location.hash.match(/proyecto\/([0-9a-f-]+)\//)?.[1]);
  await sleep(1200);
  return id;
}

async function anadirNodo(page) {
  if (!(await page.$(".palette .pal-item"))) {
    const abrir = await page.$('[aria-label="Abrir paleta"]');
    if (abrir) await abrir.click();
    await page.waitForSelector(".palette .pal-item", { visible: true, timeout: 10000 });
  }
  await clickTexto(page, ".palette .pal-item", "Nodo");
  await sleep(1600);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-features=msEdgeSidebarV2"],
    defaultViewport: { width: 1360, height: 900 },
  });
  const ctxA = await browser.createBrowserContext();
  const ctxB = await browser.createBrowserContext();
  const ctxC = await browser.createBrowserContext();
  const ctxAnon = await browser.createBrowserContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const pageC = await ctxC.newPage();
  const pageAnon = await ctxAnon.newPage();
  for (const p of [pageA, pageB, pageC, pageAnon]) p.on("console", (m) => { if (m.type() === "error") console.log("  [browser]", m.text().slice(0, 300)); });

  let proyectoId = null;
  try {
    // 1. Registro de A y B
    await registrar(pageA, USER_A, PASS);
    ok("Registro A");
    await registrar(pageB, USER_B, PASS);
    ok("Registro B");

    // Captura: pantalla de acceso (contexto anonimo)
    await goto(pageAnon);
    await visible(pageAnon, ".auth-card");
    await pageAnon.screenshot({ path: path.join(SHOTS, "e2e-01-acceso.png") });
    ok("Captura pantalla de acceso");

    // 2. A crea proyecto
    await abrirLista(pageA);
    proyectoId = await nuevoProyecto(pageA, `E2E ${TS}`);
    estado.proyectos.push(proyectoId);
    ok("A crea proyecto", proyectoId);

    // 3. A guarda un nodo
    await anadirNodo(pageA);
    const nodosA = await pageA.$$eval(".react-flow__node", (n) => n.length);
    if (nodosA > 0) ok("A agrega nodo y guarda", `${nodosA} nodo(s)`);
    else fallo("A agrega nodo");

    // 4. B no puede abrir un proyecto privado
    const url = `#/proyecto/${proyectoId}/canvas`;
    await goto(pageB, url);
    try {
      await textoVisible(pageB, "No se pudo abrir el proyecto", 12000);
      ok("B no puede abrir proyecto privado");
    } catch {
      fallo("B no puede abrir proyecto privado");
    }

    // 5. A comparte con B como viewer
    await goto(pageA, url);
    await visible(pageA, '[data-testid="panel-proyecto"]');
    await pageA.click('[data-testid="panel-proyecto"]');
    await visible(pageA, '[data-testid="share-form"]');
    await rellenar(pageA, '[data-testid="share-email"]', USER_B);
    await pageA.select('[data-testid="share-role"]', "viewer");
    await pageA.click('[data-testid="share-add"]');
    await visible(pageA, '[data-testid="share-list"]');
    await textoVisible(pageA, "e2e-b");
    await pageA.screenshot({ path: path.join(SHOTS, "e2e-02-compartir.png") });
    ok("A comparte con B como viewer");
    await pageA.keyboard.press("Escape");

    // 6. B lo ve en su lista y lo abre en solo lectura
    await abrirLista(pageB);
    await textoVisible(pageB, "Compartido Â· lectura");
    await goto(pageB, url);
    await textoVisible(pageB, "Solo lectura");
    ok("B abre en solo lectura");
    await abrirLista(pageA);
    await pageA.screenshot({ path: path.join(SHOTS, "e2e-03-lista-compartidos.png") });
    ok("Captura lista con compartidos");

    // 7. A cambia B a editor
    await goto(pageA, url);
    await visible(pageA, '[data-testid="panel-proyecto"]');
    await pageA.click('[data-testid="panel-proyecto"]');
    await visible(pageA, '[data-testid="share-list"]');
    const selRol = await pageA.$('[data-testid^="member-role-"]');
    if (!selRol) throw new Error("No hay selector de rol de miembros");
    const idSel = await selRol.evaluate((el) => el.getAttribute("data-testid"));
    await pageA.select(`[data-testid="${idSel}"]`, "editor");
    await sleep(1200);
    ok("A cambia rol de B a editor");
    await pageA.keyboard.press("Escape");

    // 8. B recarga, ya puede editar y guardar
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await pageB.waitForFunction(() => !document.body.innerText.includes("Solo lectura"), { timeout: 20000 });
    await anadirNodo(pageB);
    const nodosB = await pageB.$$eval(".react-flow__node", (n) => n.length);
    if (nodosB > 0) ok("B como editor guarda", `${nodosB} nodo(s)`);
    else fallo("B como editor guarda");

    // 9. Visibilidad publica + captura anonima en solo lectura
    await abrirLista(pageA);
    await pageA.waitForSelector(`[data-project="${proyectoId}"] select`);
    await pageA.select(`[data-project="${proyectoId}"] select`, "publico");
    await sleep(1500);
    await goto(pageAnon, url);
    await textoVisible(pageAnon, "Solo lectura", 20000);
    await pageAnon.screenshot({ path: path.join(SHOTS, "e2e-04-publico-lectura.png") });
    ok("Visitante sin sesion abre proyecto publico en solo lectura");

    // 10. Recarga con sesion: sigue dentro y en la misma ruta
    await goto(pageA, url);
    await visible(pageA, ".stage, .react-flow");
    await pageA.reload({ waitUntil: "domcontentloaded" });
    try {
      await pageA.waitForFunction(
        () => location.hash.includes("/canvas") && !document.querySelector(".auth-card") && !!document.querySelector(".react-flow, .stage"),
        { timeout: 25000 },
      );
      ok("Recarga conserva sesion y ruta");
    } catch {
      fallo("Recarga conserva sesion y ruta");
    }

    // 11. Conflicto de revision con dos contextos de A
    await login(pageC, USER_A, PASS);
    await goto(pageC, url);
    await visible(pageC, ".stage, .react-flow");
    await sleep(1200);
    await anadirNodo(pageA);
    await sleep(1600);
    await anadirNodo(pageC);
    try {
      await visible(pageC, '[data-testid="conflicto-dialog"]', 20000);
      ok("Conflicto 40001 muestra dialogo");
      await pageC.screenshot({ path: path.join(SHOTS, "e2e-05-conflicto.png") });
      await clickTexto(pageC, '[data-testid="conflicto-dialog"] button', "Guardar encima");
      await pageC.waitForFunction(() => !document.querySelector('[data-testid="conflicto-dialog"]'), { timeout: 20000 });
      ok("Resolver conflicto guardando encima");
    } catch {
      fallo("Conflicto 40001 muestra dialogo");
    }

    // 12. Offline: copia cacheada y aviso
    await abrirLista(pageA);
    await sleep(800);
    await pageA.setOfflineMode(true);
    await goto(pageA, url);
    try {
      await textoVisible(pageA, "Sin conexion", 15000);
      ok("Offline abre copia cacheada y avisa");
    } catch {
      fallo("Offline abre copia cacheada y avisa");
    }
    await pageA.setOfflineMode(false);

    // Captura final de la lista en linea
    await goto(pageA, "#/proyectos");
    await sleep(1200);
    await pageA.screenshot({ path: path.join(SHOTS, "e2e-06-lista.png") });
  } catch (e) {
    fallo("excepcion", e instanceof Error ? e.message : String(e));
    console.error(e);
  } finally {
    const resumen = { usuarios: estado.usuarios, proyectos: estado.proyectos, pasos: estado.pasos };
    fs.writeFileSync(path.join(SHOTS, "e2e-resultado.json"), JSON.stringify(resumen, null, 2));
    console.log("\nRESUMEN:", JSON.stringify(resumen, null, 2));
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

