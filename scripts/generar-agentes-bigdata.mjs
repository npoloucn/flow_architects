#!/usr/bin/env node
/**
 * Genera el proyecto importable "Agentes BigData" (FlowArquitecture, schemaVersion 2)
 * a partir del export de n8n del agente BigOps Guardian.
 *
 * Uso (--n8n es obligatorio):
 *   node scripts/generar-agentes-bigdata.mjs --n8n <export.json> [--out <proyecto.json>]
 *                                            [--docs-root <repo BigOpsGuardian>] [--vault <carpeta del proyecto en el vault>]
 *
 *   --n8n        Ruta al export de n8n (obligatorio). Tambien via BIGOPS_N8N.
 *   --out        Salida del proyecto importable (por defecto examples/bigops-guardian.json). Tambien BIGOPS_OUT.
 *   --docs-root  Repo local con la documentacion y las skills; si se omite, no se adjuntan documentos. Tambien BIGOPS_DOCS.
 *   --vault      Carpeta del proyecto en el vault; si se omite, no se adjuntan documentos del vault. Tambien BIGOPS_VAULT.
 *
 * Ninguna ruta absoluta esta hardcodeada: este script no depende de la maquina del autor.
 *
 * Que se lee del export de n8n (y solo eso): nombres y tipos de nodo, conexiones (main / ai_tool / ai_memory /
 * ai_languageModel), el nombre del modelo, la ventana de memoria y el metodo del webhook. NUNCA se leen ni se copian
 * URLs, ids de lista, credenciales, headers, prompts ni codigo de los nodos.
 *
 * Que es curado (inferido de la documentacion, no del export): textos, estados, layout, sistemas externos del nivel
 * raiz, cadena de skills (viene del repo de skills) y tareas (HAs reales del vault). Si el export trae un nodo que
 * esta curado aqui no existe, se agrega en una columna "Sin clasificar" y se avisa por consola.
 *
 * Salvaguarda: antes de escribir, el JSON se escanea buscando URLs, correos, GUID, IPs, rutas UNC y palabras tipicas de
 * secretos; si encuentra algo, aborta sin escribir.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------- argumentos
const arg = (n, env) => {
  const i = process.argv.indexOf("--" + n);
  return i > 0 ? process.argv[i + 1] : process.env[env];
};
const HERE = path.dirname(fileURLToPath(import.meta.url));
const N8N = arg("n8n", "BIGOPS_N8N");
if (!N8N) {
  console.error(
    "Falta el export de n8n.\n\n" +
      "Uso: node scripts/generar-agentes-bigdata.mjs --n8n <export.json> [--out <proyecto.json>]\n" +
      "                                           [--docs-root <repo BigOpsGuardian>] [--vault <carpeta del vault>]\n\n" +
      "Tambien acepta BIGOPS_N8N, BIGOPS_OUT, BIGOPS_DOCS y BIGOPS_VAULT como variables de entorno.",
  );
  process.exit(1);
}
const OUT = arg("out", "BIGOPS_OUT", path.join(HERE, "..", "examples", "bigops-guardian.json"));
const DOCS = arg("docs-root", "BIGOPS_DOCS");
const VAULT = arg("vault", "BIGOPS_VAULT");
const SKILLS = DOCS ? path.join(DOCS, "AP0004001_Cluster_X86_3_Ansible_DOP", "BigOps-Agent", "skills") : null;
const MCPS = DOCS ? path.join(DOCS, "NU1041002_TI_MCPSERVERS_HB_MR") : null;
const avisos = [];
const aviso = (m) => { avisos.push(m); console.warn("AVISO:", m); };

// ---------------------------------------------------------------- lectura del export (lista blanca)
const wf = JSON.parse(fs.readFileSync(N8N, "utf8").replace(/^\uFEFF/, ""));
const TS = fs.statSync(N8N).mtime.toISOString();
const nodos8n = wf.nodes.filter((n) => !/stickyNote/i.test(n.type));
const por8n = new Map(nodos8n.map((n) => [n.name, n]));
const modelo = String(por8n.get("Bancolombia OpenAI Chat Model")?.parameters?.model?.value ?? "");
const ventana = Number(por8n.get("Bancolombia Postgres Chat Memory")?.parameters?.contextWindowLength?.value ?? por8n.get("Bancolombia Postgres Chat Memory")?.parameters?.contextWindowLength ?? 0);
const metodo = String(por8n.get("Webhook")?.parameters?.httpMethod ?? "");
const conexiones = [];
for (const [src, tipos] of Object.entries(wf.connections ?? {}))
  for (const [tipo, grupos] of Object.entries(tipos)) for (const g of grupos) for (const c of g ?? []) conexiones.push({ src, tipo, dst: c.node });

// ---------------------------------------------------------------- utilidades de documento
const R = ["bigops"]; // responsables
const slug = (s) => "n_" + s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const nodos = [], rels = [], tareas = [], docs = [];
const parentDe = new Map();

function nodo(id, parentId, o) {
  parentDe.set(id, parentId);
  nodos.push({
    id, parentId, tipo: o.sub ? "subflujo" : "basico", categoria: o.cat, titulo: o.titulo, descripcion: o.desc, estado: o.estado,
    responsables: o.resp ?? R, posicion: { x: o.x, y: o.y }, colapsado: false, ...(o.icono ? { icono: o.icono } : {}), creadoEn: TS, actualizadoEn: TS,
  });
}
function archivo(nodoId, titulo, ruta) {
  if (!ruta) return; // sin --docs-root/--vault no se adjuntan documentos
  if (!fs.existsSync(ruta)) return aviso(`documento omitido (no existe en disco): ${titulo}`);
  docs.push({ id: `doc_${docs.length + 1}`, nodoId, tipo: "archivo", titulo, url: null, ruta, contenido: null, cache: null, actualizadoEn: TS });
}
function tarea(nodoId, ado, titulo, estado, desc) {
  tareas.push({
    id: `tsk_ha_${ado}`, nodoId, titulo: `HA ${ado} · ${titulo}`, descripcion: `ID ADO: ${ado}. ${desc}`, estado, prioridad: "media",
    responsables: ["equipo-bigops"], venceEn: null, origen: "local", externo: null, creadoEn: TS, actualizadoEn: TS,
  });
}

// familias de flecha (color y estilo se reusan en todo el proyecto)
const FAM = {
  main: { color: "#352FCC", estiloLinea: "continua" },
  ai_tool: { color: "#FF6900", estiloLinea: "discontinua" },
  memoria: { color: "#008755", estiloLinea: "punteada" },
  modelo: { color: "#7A1FFF", estiloLinea: "continua" },
  notif: { color: "#4AA1FF", estiloLinea: "continua" },
  reservada: { color: "#867035", estiloLinea: "discontinua" },
};
const famDeN8n = { main: "main", ai_tool: "ai_tool", ai_memory: "memoria", ai_languageModel: "modelo" };
function rel(scope, src, dst, fam, o = {}) {
  const f = FAM[fam];
  rels.push({
    id: `rel_${rels.length + 1}`, scopeId: scope, sourceId: src, targetId: dst, color: f.color, estiloLinea: f.estiloLinea,
    puntaInicio: !!o.doble, puntaFin: true, textoCentro: o.c ?? "", textoInicio: o.i ?? "", textoFin: o.f ?? "", colorTextoFin: null, creadoEn: TS,
  });
}

// ---------------------------------------------------------------- NIVEL RAIZ
const ROOT = null, BG = "n_bigops_guardian";
const MD = (...l) => l.join("\n");
nodo("n_entrada", ROOT, {
  cat: "integracion", icono: "preset:cola-bus", estado: "diseno", x: 0, y: 240, titulo: "Entrada de incidentes",
  desc: MD("Origen del incidente que dispara al agente.", "", "## Hoy", "El flujo se dispara con un **payload de incidente inyectado manualmente**: la entrada es simulada y no tiene gobierno corporativo.", "", "## Candidata (sin validar)", "Monitoreo (Dynatrace, CloudWatch) → NIX → Kafka, o consulta directa a Helix. Decisiones D1 a D4 pendientes en el vault."),
});
nodo(BG, ROOT, {
  sub: true, cat: "servicio", estado: "en-progreso", x: 620, y: 200, titulo: "BigOps Guardian",
  desc: MD("Agente de IA con autonomía controlada que atiende incidentes de plataformas Big Data sobre Cloudera/CDP.", "", "- Opera en **modo solo diagnóstico**: diagnostica, propone un plan y reporta; no ejecuta acciones ni cierra incidentes.", "- MVP vigente: Impala (datacache).", "- Orquestado en n8n (`BigOps_CDP`)."),
});
const EXT = [
  ["n_helix", "Helix (ITSM)", "servidor", "en-progreso", "integracion", MD("Sistema de incidentes y CMDB.", "", "El agente lee el incidente y, opcionalmente, el contexto del servidor en la CMDB, a través del MCP. En modo solo diagnóstico **no** resuelve ni modifica incidentes.", "", "La prueba de usarlo como fuente provisional del trigger sigue en curso.")],
  ["n_cdp", "CDP / Cloudera Manager (Impala)", "servidor", "en-progreso", "servicio", MD("Plataforma Big Data a diagnosticar: Data Hubs de CDP y Cloudera Manager.", "", "Se consulta por el MCP en solo lectura (topología, estado de servicios, roles, métricas y logs). Las acciones de ejecución están reservadas para una etapa posterior.")],
  ["n_llm", "LLM corporativo", "api", "en-progreso", "integracion", MD(`Modelo de lenguaje corporativo para el razonamiento del agente${modelo ? ` (modelo configurado: \`${modelo}\`)` : ""}.`, "", "Las skills son la única fuente de verdad: el modelo razona, no decide fuera de ellas.")],
  ["n_postgres", "Memoria Postgres", "base-datos", "en-progreso", "integracion", MD(`Memoria de conversación del agente en Postgres${ventana ? `, con ventana de ${ventana} mensajes` : ""}.`, "", "Una memoria previa es una **pista**, nunca evidencia: el diagnóstico siempre se revalida contra Helix y Cloudera.")],
  ["n_bitacora", "Bitácora de incidentes (SharePoint)", "documento", "en-progreso", "integracion", MD("Lista de SharePoint con soluciones validadas de incidentes anteriores.", "", "La herramienta está conectada al agente, pero la etapa de búsqueda en bitácora **no está habilitada** en modo solo diagnóstico.")],
  ["n_repo_skills", "Repositorio de skills (Azure DevOps)", "repo", "listo", "repo", MD("Repositorio `BigOps-Agent-Skills`: conocimiento operativo versionado del agente.", "", "El agente lo lee en solo lectura; las skills definen diagnóstico, evidencia exigida y formato de salida.")],
  ["n_salida", "Salida: informe y notificación", "documento", "diseno", "otro", MD("Etapa de salida del flujo (nota «Output - Notificación» en n8n).", "", "El workflow termina entregando el informe como **archivo HTML**. El canal de notificación al usuario (correo u otro) **no aparece en el export**: queda por definir.")],
];
EXT.forEach(([id, titulo, ic, estado, cat, desc], i) => nodo(id, ROOT, { titulo, icono: `preset:${ic}`, estado, cat, desc, x: 1500, y: -330 + i * 200 }));

rel(ROOT, "n_entrada", BG, "main", { c: "dispara por webhook", i: "payload", f: "" });
rel(ROOT, BG, "n_helix", "ai_tool", { c: "consulta incidente y CMDB", f: "solo lectura" });
rel(ROOT, BG, "n_cdp", "ai_tool", { c: "diagnóstico por MCP", f: "solo lectura" });
rel(ROOT, BG, "n_llm", "modelo", { c: modelo ? `razona (${modelo})` : "razona" });
rel(ROOT, BG, "n_postgres", "memoria", { c: "lee y guarda memoria", doble: true });
rel(ROOT, BG, "n_bitacora", "ai_tool", { c: "busca soluciones validadas", f: "no habilitada hoy" });
rel(ROOT, BG, "n_repo_skills", "ai_tool", { c: "lee skills por ruta", f: "solo lectura" });
rel(ROOT, BG, "n_salida", "notif", { c: "entrega informe HTML", f: "canal sin definir" });

// ---------------------------------------------------------------- SUBFLUJO "BigOps Guardian"
const CAD = "n_cadena_de_skills", POST = "n_postproceso_del_reporte";
const D = (n8n, o) => ({ n8n, ...o });
const NODOS_L1 = [
  D("Webhook", { cat: "integracion", estado: "en-progreso", x: 0, y: 140, icono: "preset:cola-bus", desc: MD(`Recibe el incidente${metodo ? ` por ${metodo}` : ""} y dispara el flujo (etapa «Input - Incidente»).`, "", "Hoy el payload es simulado; la entrada productiva no existe todavía.") }),
  D("AI Agent", { cat: "servicio", estado: "en-progreso", x: 1240, y: 140, desc: MD("Agente de n8n (etapa «Main»). Su instrucción lo obliga a:", "", "1. Listar el catálogo de skills una vez.", "2. Leer el router de resolución de incidentes antes de actuar.", "3. Seguir las skills de forma estricta, sin usar herramientas que la skill activa no autorice.", "", "La única respuesta final es la que define la skill de generación de reporte.") }),
  D("Bancolombia OpenAI Chat Model", { cat: "integracion", estado: "en-progreso", x: 560, y: -250, icono: "preset:api", desc: MD(`Modelo de chat corporativo del agente${modelo ? ` (\`${modelo}\`)` : ""}, caso de uso CDP.`) }),
  D("Bancolombia Postgres Chat Memory", { cat: "integracion", estado: "en-progreso", x: 560, y: -60, icono: "preset:base-datos", desc: MD(`Memoria de conversación en Postgres${ventana ? `, últimos ${ventana} mensajes` : ""}, con clave de sesión personalizada.`) }),
  D("MCP Client CDP", { cat: "mcp", estado: "listo", x: 560, y: 340, desc: MD("Cliente MCP que expone al agente las herramientas de **Cloudera/CDP y Helix** (autenticación OAuth2 gestionada en n8n).", "", "En modo solo diagnóstico se permiten solo herramientas de lectura: topología CDP, estado de servicios y roles de Cloudera Manager, métricas/logs/configuración y consulta de incidente y CMDB.", "", "Quedan prohibidas las herramientas de preparación y ejecución de comandos y la de resolución en Helix.") }),
  D("DB_BitacoraIncidentes", { cat: "integracion", estado: "en-progreso", x: 560, y: 520, icono: "preset:documento", desc: MD("Herramienta de SharePoint sobre la bitácora de incidentes (lista `DEV_BitacoraIncidentes`), solo lectura, con tope de resultados.", "", "Es la fuente de soluciones validadas, pero la skill que la consulta no está habilitada en modo solo diagnóstico.") }),
  D("Listar skills", { cat: "integracion", estado: "listo", x: 560, y: 700, desc: MD("Sub-workflow como herramienta: lista los archivos de skills del repositorio de skills. **Solo lectura.**", "", "Debe llamarse antes de cualquier diagnóstico, acción o recomendación.") }),
  D("Obtener skill", { cat: "integracion", estado: "listo", x: 560, y: 880, desc: MD("Sub-workflow como herramienta: lee una skill por su ruta exacta. **Solo lectura.**", "", "Para incidentes Cloudera/CDP el primer archivo es el router de resolución de incidentes.") }),
];
const pos1 = new Map(NODOS_L1.map((n) => [n.n8n, n]));
const sinMapear = nodos8n.filter((n) => !pos1.has(n.name) && !["Generar informe HTML", "Convertir informe a archivo"].includes(n.name));
sinMapear.forEach((n, i) => {
  aviso(`nodo de n8n sin curar: «${n.name}» (${n.type}); se agrega en «Sin clasificar»`);
  pos1.set(n.name, D(n.name, { cat: "otro", estado: "diseno", x: 2500, y: i * 200, desc: `Nodo presente en el export de n8n (\`${n.type}\`) sin descripción curada todavía.` }));
  NODOS_L1.push(pos1.get(n.name));
});
for (const n of NODOS_L1) { if (!por8n.has(n.n8n)) aviso(`nodo curado que ya no está en el export: «${n.n8n}»`); nodo(slug(n.n8n), BG, { titulo: n.n8n, cat: n.cat, estado: n.estado, x: n.x, y: n.y, desc: n.desc, icono: n.icono }); }

nodo(CAD, BG, {
  sub: true, cat: "repo", estado: "en-progreso", x: 1240, y: 700, titulo: "Cadena de skills",
  desc: MD("Skills del repositorio que el agente carga **una por etapa**, a partir del router.", "", "En modo solo diagnóstico están habilitadas las etapas de diagnóstico y de reporte; búsqueda en bitácora, aplicación de solución y cierre en Helix quedan reservadas para una etapa posterior con aprobación operativa."),
});
nodo(POST, BG, {
  sub: true, cat: "servicio", estado: "listo", x: 1860, y: 140, titulo: "Postproceso del reporte",
  desc: MD("Etapa «Output - Notificación» del workflow: convierte la salida del agente en un informe HTML y lo entrega como archivo.", "", "Hay informes generados por este flujo en la carpeta de reportes del repositorio."),
});

// conexiones del export -> flechas (se elevan al contenedor cuando el extremo vive en un subflujo anidado)
const IN_POST = new Set(["Generar informe HTML", "Convertir informe a archivo"]);
const idDe = (name) => (IN_POST.has(name) ? slug(name) : pos1.has(name) ? slug(name) : null);
const TXT = {
  "Webhook→AI Agent": { c: "payload del incidente", i: "POST" },
  "Listar skills→AI Agent": { c: "catálogo de skills" },
  "Obtener skill→AI Agent": { c: "lee la skill por ruta" },
  "MCP Client CDP→AI Agent": { c: "diagnóstico CDP/Cloudera (MCP)", i: "solo lectura" },
  "DB_BitacoraIncidentes→AI Agent": { c: "busca soluciones validadas", i: "no habilitada" },
  "Bancolombia OpenAI Chat Model→AI Agent": { c: "razonamiento del agente" },
  "Bancolombia Postgres Chat Memory→AI Agent": { c: "contexto de sesión", doble: true },
  "AI Agent→Generar informe HTML": { c: "salida del agente", f: "informe" },
  "Generar informe HTML→Convertir informe a archivo": { c: "HTML a archivo" },
};
const vistos = new Set();
for (const { src, tipo, dst } of conexiones) {
  const a = idDe(src), b = idDe(dst);
  if (!a || !b) { aviso(`conexión omitida (nodo sin mapear): ${src} → ${dst}`); continue; }
  // Generar informe / Convertir viven dentro de POST: el extremo visible en el nivel BG es el contenedor
  const sa = IN_POST.has(src) && !IN_POST.has(dst) ? POST : a;
  const sb = IN_POST.has(dst) && !IN_POST.has(src) ? POST : b;
  const both = IN_POST.has(src) && IN_POST.has(dst);
  const scope = both ? POST : BG;
  const k = `${scope}|${sa}|${sb}|${tipo}`;
  if (vistos.has(k)) continue;
  vistos.add(k);
  rel(scope, sa, sb, famDeN8n[tipo] ?? "main", TXT[`${src}→${dst}`] ?? {});
}
rel(BG, slug("Obtener skill"), CAD, "ai_tool", { c: "carga la skill activa", i: "solo lectura" }); // relación documentada en el prompt del agente, no es una conexión de n8n

// contenido de «Postproceso del reporte» (nodos reales del export)
nodo(slug("Generar informe HTML"), POST, { cat: "servicio", estado: "listo", x: 0, y: 100, titulo: "Generar informe HTML", desc: MD("Nodo de código que toma el JSON del agente (`reporteTecnico` y `reporteUsuario`) y arma el informe HTML con su nombre de archivo.", "", "Si el JSON del agente no cumple el contrato, el informe debe reflejarlo en lugar de ocultar el error.") });
nodo(slug("Convertir informe a archivo"), POST, { cat: "servicio", estado: "listo", x: 560, y: 100, titulo: "Convertir informe a archivo", desc: MD("Convierte el HTML en un archivo de texto UTF-8 con el nombre definido por el informe.", "", "Es el último nodo del workflow: el reparto del archivo a un canal de notificación no está en el export.") });

// ---------------------------------------------------------------- NIVEL 3: cadena de skills (fuente: repo de skills)
const SK = (id, titulo, estado, x, y, desc, carpeta) => { nodo(id, CAD, { cat: "otro", estado, x, y, titulo, desc }); archivo(id, `SKILL.md de ${titulo}`, SKILLS ? path.join(SKILLS, carpeta, "SKILL.md") : null); };
SK("n_sk_router", "enrutador-de-resolucion-de-incidentes", "listo", 0, 100, MD("**Primera skill que se lee.** Orquesta el diagnóstico en modo solo lectura y decide el siguiente paso según el resultado del diagnóstico.", "", "Resultados posibles: falso positivo, ya resuelto, confirmado recuperable, confirmado bloqueado o evidencia insuficiente. Todas las ramas terminan en plan y reporte, nunca en ejecución o cierre."), "enrutador-de-resolucion-de-incidentes");
SK("n_sk_diag", "diagnostico-y-plan-de-solucion", "listo", 560, 100, MD("Diagnostica el incidente con evidencia y propone un plan de solución **sin ejecutarlo**.", "", "Elige el clúster candidato desde el catálogo de Data Hubs (nunca desde el número de incidente ni el host) y usa la CMDB solo como contexto opcional por nombre de servidor."), "diagnostico-y-plan-de-solucion");
SK("n_sk_reporte", "generacion-de-reporte", "listo", 1120, 100, MD("**Etapa final, siempre.** Entrega un único JSON con dos reportes derivados de la misma evidencia: `reporteTecnico` (traza de skills, herramientas y diagnóstico) y `reporteUsuario` (lenguaje llano, sin nombres de herramientas)."), "generacion-de-reporte");
SK("n_sk_bitacora", "busqueda-de-solucion-en-bitacora", "diseno", 1120, 420, MD("**No habilitada en modo solo diagnóstico.** Seleccionaría una solución validada de la bitácora solo si coincide con el diagnóstico confirmado."), "busqueda-de-solucion-en-bitacora");
SK("n_sk_aplicacion", "aplicacion-de-solucion", "diseno", 1680, 420, MD("**No habilitada en modo solo diagnóstico.** Ejecutaría una acción autorizada (start, stop o restart del componente diagnosticado) y comprobaría la recuperación."), "aplicacion-de-solucion");
SK("n_sk_cierre", "cierre-verificado-de-incidente-helix", "diseno", 2240, 420, MD("**No habilitada en modo solo diagnóstico.** Resolvería el incidente en Helix solo tras una recuperación técnica verificada."), "cierre-verificado-de-incidente-helix");
rel(CAD, "n_sk_router", "n_sk_diag", "main", { c: "siguiente etapa habilitada" });
rel(CAD, "n_sk_diag", "n_sk_reporte", "main", { c: "plan y reporte", f: "siempre al final" });
rel(CAD, "n_sk_diag", "n_sk_bitacora", "reservada", { c: "etapa reservada", f: "no habilitada" });
rel(CAD, "n_sk_bitacora", "n_sk_aplicacion", "reservada", { c: "etapa reservada" });
rel(CAD, "n_sk_aplicacion", "n_sk_cierre", "reservada", { c: "etapa reservada" });

// ---------------------------------------------------------------- documentos de nodos con documentación local real
const vault = (...p) => (VAULT ? path.join(VAULT, ...p) : null);
archivo(BG, "README del proyecto en el vault", vault("README.md"));
archivo(BG, "Documento maestro MVP Impala v2.0", DOCS ? path.join(DOCS, "Docs", "BigOps_Guardian_Documento_Maestro_MVP_Impala_v2.md") : null);
archivo(BG, "Workflow n8n BigOps_CDP", DOCS ? path.join(DOCS, "N8N", "BigOps_CDP.json") : null);
archivo("n_entrada", "HA 7980841 · Contexto y fuentes de entrada", vault("Sprints", "SP256", "Has", "7980841 Contexto y Fuentes de Entrada.md"));
archivo("n_entrada", "HA 7981599 · Onboarding Kafka", vault("Sprints", "SP256", "Has", "7981599 Onboarding Kafka y Acople con el Agente.md"));
archivo("n_entrada", "HA 7991215 · Trigger con incidentes de Helix", vault("Sprints", "SP257", "Has", "7991215 Trigger con Incidentes de Helix.md"));
archivo("n_helix", "README del MCP de Helix", MCPS ? path.join(MCPS, "helix_smcp", "README.md") : null);
archivo("n_cdp", "README del MCP de Cloudera", MCPS ? path.join(MCPS, "cloudera_smcp", "README.md") : null);
archivo("n_repo_skills", "README de las skills", SKILLS ? path.join(SKILLS, "README.md") : null);
archivo(slug("MCP Client CDP"), "README del MCP de Cloudera", MCPS ? path.join(MCPS, "cloudera_smcp", "README.md") : null);
archivo(slug("MCP Client CDP"), "HA 7935616 · Bintec MCP Cloudera", vault("Sprints", "SP255", "Has", "7935616 Bintec MCP Cloudera.md"));
archivo(slug("Listar skills"), "README de las skills", SKILLS ? path.join(SKILLS, "README.md") : null);
archivo(slug("Obtener skill"), "README de las skills", SKILLS ? path.join(SKILLS, "README.md") : null);
archivo(slug("Generar informe HTML"), "Especificación de los informes", DOCS ? path.join(DOCS, "Docs", "diseno-reportes", "ESPECIFICACION.md") : null);

// ---------------------------------------------------------------- tareas: solo HAs reales del vault con mapeo evidente
tarea(BG, 7935647, "Validación de integraciones de BigOps Guardian", "hecha", "Cerrada en ADO (nota de sincronización del vault, 2026-10-22). Valida las integraciones del agente con las fuentes del MVP.");
tarea(slug("MCP Client CDP"), 7935616, "Bintec MCP Cloudera", "hecha", "Cerrada en ADO (SP255, avance 100 %). Base del MCP de Cloudera: repositorio, arquitectura, conexión con Cloudera Manager y pruebas unitarias iniciales.");
tarea("n_entrada", 7980841, "Contexto y fuentes de entrada del agente", "pendiente", "SP256. El vault no registra el estado en ADO (consultar ADO); todas sus tareas figuran sin marcar.");
tarea("n_entrada", 7981599, "Onboarding al gobierno Kafka y acople con el agente", "pendiente", "SP256. El vault no registra el estado en ADO (consultar ADO); todas sus tareas figuran sin marcar.");
tarea("n_entrada", 7991215, "Probar el trigger con incidentes de Helix sin desarrollo nuevo", "en-curso", "SP257. La decisión D4 del vault la marca «En prueba».");

// ---------------------------------------------------------------- proyecto + verificaciones
const proyecto = {
  schemaVersion: 2, id: "prj_agentes_bigdata", nombre: "Agentes BigData",
  descripcion: "Arquitectura de los agentes de IA del equipo Big Data; incluye BigOps Guardian, que diagnostica incidentes de Cloudera/CDP en modo solo lectura.",
  creadoEn: TS, actualizadoEn: TS, nodos, relaciones: rels, tareas, documentos: docs,
};

const ids = new Set(nodos.map((n) => n.id));
const errores = [];
if (ids.size !== nodos.length) errores.push("ids de nodo duplicados");
for (const n of nodos) if (n.parentId && !ids.has(n.parentId)) errores.push(`padre inexistente: ${n.id}`);
for (const r of rels) {
  const s = nodos.find((n) => n.id === r.sourceId), t = nodos.find((n) => n.id === r.targetId);
  if (!s || !t) errores.push(`extremo inexistente en ${r.id}`);
  else if (!(r.scopeId === s.parentId && s.parentId === t.parentId)) errores.push(`${r.id}: ${s.id} → ${t.id} no está en un único nivel`);
  if (r.textoCentro.length > 40 || r.textoInicio.length > 20 || r.textoFin.length > 20) errores.push(`${r.id}: texto demasiado largo`);
}
// toda conexión del export debe estar representada (directa o elevada)
for (const { src, dst } of conexiones) if (!idDe(src) || !idDe(dst)) errores.push(`conexión del export sin representar: ${src} → ${dst}`);

const texto = JSON.stringify(proyecto, null, 2);
const PELIGRO = [
  [/https?:\/\//i, "URL"], [/[\w.+-]+@[\w-]+\.[\w.]+/, "correo"], [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, "GUID"],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/, "IP"], [/\\\\\\\\[\w.-]+\\\\/, "ruta UNC"], [/eyJ[A-Za-z0-9_-]{10,}/, "JWT"],
  [/bearer|api[_-]?key|password|passwd|secret|token|[?&](sig|sv|se|sp|code)=/i, "palabra de secreto/firma"],
];
for (const [re, que] of PELIGRO) { const m = texto.match(re); if (m) errores.push(`posible dato sensible (${que}): «${m[0].slice(0, 30)}»`); }
if (errores.length) { console.error("ABORTA, no se escribió nada:\n- " + errores.join("\n- ")); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, texto, "utf8");
const cnt = (p) => `${nodos.filter((n) => n.parentId === p).length} nodos / ${rels.filter((r) => r.scopeId === p).length} flechas`;
console.log(`OK → ${OUT}\n  raíz: ${cnt(null)}\n  BigOps Guardian: ${cnt(BG)}\n  Cadena de skills: ${cnt(CAD)}\n  Postproceso del reporte: ${cnt(POST)}\n  tareas: ${tareas.length}, documentos: ${docs.length}, avisos: ${avisos.length}`);
