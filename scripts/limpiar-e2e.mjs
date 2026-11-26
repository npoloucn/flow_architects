#!/usr/bin/env node
/**
 * Limpieza segura de datos de prueba (E2E) en Supabase.
 *
 *   node scripts/limpiar-e2e.mjs                 # simulacion: no borra nada
 *   node scripts/limpiar-e2e.mjs --aplicar       # borra SOLO lo listado en la simulacion
 *   node scripts/limpiar-e2e.mjs --autotest      # prueba el filtro en memoria (sin red)
 *
 * Credenciales SOLO desde el entorno:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * La service_role nunca se escribe en este archivo ni se imprime, y no debe
 * ponerse en .env ni en ninguna variable VITE_*.
 *
 * Regla unica de elegibilidad: el correo del usuario o el nombre del proyecto
 * debe EMPEZAR por "e2e-" (sin distinguir mayusculas, ignorando espacios en
 * los extremos). Todo lo demas es "no elegible" y no se toca.
 *
 * Orden de borrado: project_members -> project_revisions -> projects ->
 * profiles -> auth.users. Cada paso compara las filas afectadas contra el
 * conteo de la simulacion y aborta si no coinciden.
 */
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const PREFIJO = "e2e-";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOTE = 100;
const PAGINA = 1000;
const MAX_LISTADO = 25;

// ---------------------------------------------------------------------------
// Filtro puro (sin red): se puede probar con `--autotest`
// ---------------------------------------------------------------------------

export function normalizar(valor) {
  return String(valor ?? "").trim().toLowerCase();
}

/** true solo si el valor empieza por "e2e-" y trae algo despues del guion. */
export function esElegible(valor) {
  const n = normalizar(valor);
  return n.length > PREFIJO.length && n.startsWith(PREFIJO);
}

/**
 * Clasifica un estado completo (listas en memoria) y calcula:
 * objetivos por tabla, ignorados y la huella de cascada de auth.users.
 */
export function planificar(estado) {
  const usuariosElegibles = estado.usuarios.filter((u) => esElegible(u.email));
  const usuariosIgnorados = estado.usuarios.filter((u) => !esElegible(u.email));
  const proyectosElegibles = estado.proyectos.filter((p) => esElegible(p.name));
  const proyectosIgnorados = estado.proyectos.filter((p) => !esElegible(p.name));

  const usuarioIds = new Set(usuariosElegibles.map((u) => u.id));
  const proyectoIds = new Set(proyectosElegibles.map((p) => p.id));

  const miembrosObjetivo = estado.miembros.filter(
    (m) => proyectoIds.has(m.project_id) || usuarioIds.has(m.user_id),
  );
  const revisionesObjetivo = estado.revisiones.filter((r) => proyectoIds.has(r.project_id));
  const perfilesObjetivo = estado.perfiles.filter((p) => usuarioIds.has(p.id));

  // Huella de `on delete cascade` al borrar auth.users.
  const proyectosCascada = estado.proyectos.filter((p) => usuarioIds.has(p.owner_id));
  const proyectosCascadaNoElegibles = proyectosCascada.filter((p) => !proyectoIds.has(p.id));
  const miembrosCascada = estado.miembros.filter(
    (m) => usuarioIds.has(m.user_id) || proyectoIds.has(m.project_id),
  );
  const revisionesCascada = estado.revisiones.filter((r) => proyectoIds.has(r.project_id));
  // project_revisions.author_id -> on delete set null (no borra la fila)
  const revisionesAutorAnulado = estado.revisiones.filter(
    (r) => usuarioIds.has(r.author_id) && !proyectoIds.has(r.project_id),
  );

  const plan = {
    usuariosElegibles,
    usuariosIgnorados,
    proyectosElegibles,
    proyectosIgnorados,
    miembrosObjetivo,
    revisionesObjetivo,
    perfilesObjetivo,
    ignorados: {
      profiles: estado.perfiles.filter((p) => !usuarioIds.has(p.id)),
      project_members: estado.miembros.filter(
        (m) => !proyectoIds.has(m.project_id) && !usuarioIds.has(m.user_id),
      ),
      project_revisions: estado.revisiones.filter((r) => !proyectoIds.has(r.project_id)),
    },
    cascada: {
      proyectos: proyectosCascada,
      proyectosNoElegibles: proyectosCascadaNoElegibles,
      miembros: miembrosCascada,
      revisiones: revisionesCascada,
      revisonesAutorAnulado: revisionesAutorAnulado,
    },
    bloqueoUsuarios: proyectosCascadaNoElegibles.length > 0,
    sets: { usuarioIds, proyectoIds },
  };
  plan.huella = huella(plan);
  return plan;
}

/** Firma estable de los objetivos: detecta cambios entre simulacion y aplicacion. */
export function huella(plan) {
  const orden = (arr) => [...arr].sort();
  return JSON.stringify({
    usuarios: orden(plan.usuariosElegibles.map((u) => u.id)),
    proyectos: orden(plan.proyectosElegibles.map((p) => p.id)),
    miembros: orden(plan.miembrosObjetivo.map((m) => `${m.project_id}:${m.user_id}`)),
    revisiones: orden(plan.revisionesObjetivo.map((r) => String(r.id))),
    perfiles: orden(plan.perfilesObjetivo.map((p) => p.id)),
  });
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

function parsearArgs(lista) {
  const out = { aplicar: false, autotest: false, ayuda: false, usuarios: [], proyectos: [] };
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (a === "--aplicar") out.aplicar = true;
    else if (a === "--autotest") out.autotest = true;
    else if (a === "--help" || a === "-h") out.ayuda = true;
    else if (a === "--usuario" || a === "--proyecto") {
      const valor = lista[i + 1];
      if (!valor || valor.startsWith("--")) throw new Error(`Falta el valor de ${a}`);
      (a === "--usuario" ? out.usuarios : out.proyectos).push(valor);
      i++;
    } else if (a.startsWith("--usuario=")) out.usuarios.push(a.slice("--usuario=".length));
    else if (a.startsWith("--proyecto=")) out.proyectos.push(a.slice("--proyecto=".length));
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return out;
}

function uso() {
  console.log(`Uso:
  node scripts/limpiar-e2e.mjs                 simulacion (no borra)
  node scripts/limpiar-e2e.mjs --aplicar       borra lo listado en la simulacion
  node scripts/limpiar-e2e.mjs --autotest      prueba el filtro sin red ni credenciales

Opcionales (los ids deben existir y ser elegibles en esta misma corrida):
  --usuario <uuid>   --proyecto <uuid>

Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.`);
}

// ---------------------------------------------------------------------------
// Lectura del backend
// ---------------------------------------------------------------------------

async function leerTabla(supabase, tabla, columnas) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(`No se pudo leer public.${tabla}: ${error.message}`);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

async function listarUsuarios(supabase) {
  const usuarios = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGINA });
    if (error) throw new Error(`No se pudo leer auth.users: ${error.message}`);
    const lote = data?.users ?? [];
    lote.forEach((u) => usuarios.push({ id: u.id, email: u.email ?? "" }));
    if (lote.length < PAGINA) break;
  }
  return usuarios;
}

async function contarUsuarios(supabase) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(`No se pudo contar auth.users: ${error.message}`);
  return Number(data?.total ?? data?.users?.length ?? 0);
}

async function contarTabla(supabase, tabla) {
  const { count, error } = await supabase
    .from(tabla)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`No se pudo contar public.${tabla}: ${error.message}`);
  return count ?? 0;
}

async function leerTodo(supabase) {
  return {
    usuarios: await listarUsuarios(supabase),
    perfiles: await leerTabla(supabase, "profiles", "id,display_name"),
    proyectos: await leerTabla(supabase, "projects", "id,name,owner_id"),
    miembros: await leerTabla(supabase, "project_members", "project_id,user_id,role"),
    revisiones: await leerTabla(supabase, "project_revisions", "id,project_id,author_id"),
  };
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

function listar(titulo, filas, formato) {
  console.log(`\n  ${titulo}: ${filas.length}`);
  filas.slice(0, MAX_LISTADO).forEach((f) => console.log(`    - ${formato(f)}`));
  if (filas.length > MAX_LISTADO) console.log(`    ... y ${filas.length - MAX_LISTADO} mas`);
}

export function imprimirSimulacion(plan, aplicar) {
  console.log(`Modo: ${aplicar ? "APLICAR (borrara)" : "SIMULACION (no borra nada)"}`);
  console.log(`Filtro: correo o nombre de proyecto debe empezar por "${PREFIJO}"`);

  console.log("\n== SE BORRARIA ==");
  listar("auth.users", plan.usuariosElegibles, (u) => `${u.id}  ${u.email}`);
  listar("public.profiles", plan.perfilesObjetivo, (p) => `${p.id}  ${p.display_name || "(sin nombre)"}`);
  listar("public.projects", plan.proyectosElegibles, (p) => `${p.id}  ${p.name}`);
  listar("public.project_members", plan.miembrosObjetivo, (m) => `${m.project_id} + ${m.user_id} (${m.role})`);
  listar("public.project_revisions", plan.revisionesObjetivo, (r) => `${r.id}  proyecto ${r.project_id}`);

  const totalObjetivo =
    plan.usuariosElegibles.length +
    plan.perfilesObjetivo.length +
    plan.proyectosElegibles.length +
    plan.miembrosObjetivo.length +
    plan.revisionesObjetivo.length;
  console.log(`  Total de filas objetivo: ${totalObjetivo}`);

  console.log("\n== SE IGNORARIA (no elegible) ==");
  console.log(`  auth.users            : ${plan.usuariosIgnorados.length}`);
  console.log(`  public.projects       : ${plan.proyectosIgnorados.length}`);
  console.log(`  public.profiles       : ${plan.ignorados.profiles.length}`);
  console.log(`  public.project_members: ${plan.ignorados.project_members.length}`);
  console.log(`  public.project_revisions: ${plan.ignorados.project_revisions.length}`);

  const c = plan.cascada;
  console.log("\n== CASCADA al borrar auth.users (on delete cascade / set null) ==");
  console.log(`  projects            : ${c.proyectos.length}  (elegibles ${c.proyectos.length - c.proyectosNoElegibles.length} / NO elegibles ${c.proyectosNoElegibles.length})`);
  console.log(`  project_members     : ${c.miembros.length}`);
  console.log(`  project_revisions   : ${c.revisiones.length}`);
  console.log(`  project_revisions.author_id -> null: ${c.revisonesAutorAnulado.length}`);
  console.log("  Los pasos 1-3 cubren toda la cascada; el unico remanente posible son projects NO elegibles.");

  if (plan.bloqueoUsuarios) {
    console.log("\nBLOQUEO: la cascada de auth.users alcanzaria proyectos NO elegibles:");
    c.proyectosNoElegibles.forEach((p) => console.log(`    - ${p.id}  ${p.name}`));
    console.log("  No se borrara ningun usuario. Corrige los nombres a \"e2e-...\" o revisa esos proyectos.");
  } else {
    console.log("\nOK: borrar los usuarios elegibles no arrastra proyectos no elegibles.");
  }
}

// ---------------------------------------------------------------------------
// Borrado (solo con --aplicar)
// ---------------------------------------------------------------------------

async function borrarFilas(supabase, tabla, columna, ids, esperado) {
  if (ids.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE);
    const { data, error } = await supabase.from(tabla).delete().in(columna, lote).select(columna);
    if (error) throw new Error(`Fallo al borrar en public.${tabla}: ${error.message}`);
    total += (data ?? []).length;
  }
  if (total !== esperado) {
    throw new Error(
      `ABORTADO: public.${tabla} afecto ${total} filas y la simulacion listaba ${esperado}.`,
    );
  }
  return total;
}

export async function aplicarPlan(supabase, plan) {
  const borrado = { project_members: 0, project_revisions: 0, projects: 0, profiles: 0, "auth.users": 0 };
  const { usuarioIds, proyectoIds } = plan.sets;

  // 1. project_members (por proyecto elegible, luego por usuario elegible)
  const porProyecto = plan.miembrosObjetivo.filter((m) => proyectoIds.has(m.project_id));
  const porUsuario = plan.miembrosObjetivo.filter(
    (m) => !proyectoIds.has(m.project_id) && usuarioIds.has(m.user_id),
  );
  borrado.project_members += await borrarFilas(
    supabase,
    "project_members",
    "project_id",
    porProyecto.map((m) => m.project_id),
    porProyecto.length,
  );
  borrado.project_members += await borrarFilas(
    supabase,
    "project_members",
    "user_id",
    porUsuario.map((m) => m.user_id),
    porUsuario.length,
  );
  console.log(`\n[1/5] project_members    borradas ${borrado.project_members}`);

  // 2. project_revisions (por proyecto elegible)
  borrado.project_revisions = await borrarFilas(
    supabase,
    "project_revisions",
    "project_id",
    [...proyectoIds],
    plan.revisionesObjetivo.length,
  );
  console.log(`[2/5] project_revisions  borradas ${borrado.project_revisions}`);

  // 3. projects (por id elegible)
  borrado.projects = await borrarFilas(
    supabase,
    "projects",
    "id",
    [...proyectoIds],
    plan.proyectosElegibles.length,
  );
  console.log(`[3/5] projects           borradas ${borrado.projects}`);

  // 4. profiles (por id de usuario elegible)
  borrado.profiles = await borrarFilas(
    supabase,
    "profiles",
    "id",
    plan.perfilesObjetivo.map((p) => p.id),
    plan.perfilesObjetivo.length,
  );
  console.log(`[4/5] profiles           borradas ${borrado.profiles}`);

  // 5. auth.users (API admin; una por una)
  let usuariosBorrados = 0;
  for (const u of plan.usuariosElegibles) {
    const { error } = await supabase.auth.admin.deleteUser(u.id, false);
    if (error) throw new Error(`No se pudo borrar auth.users ${u.id}: ${error.message}`);
    usuariosBorrados++;
  }
  if (usuariosBorrados !== plan.usuariosElegibles.length) {
    throw new Error(
      `ABORTADO: auth.users borro ${usuariosBorrados} y la simulacion listaba ${plan.usuariosElegibles.length}.`,
    );
  }
  borrado["auth.users"] = usuariosBorrados;
  console.log(`[5/5] auth.users         borrados ${borrado["auth.users"]}`);

  return borrado;
}

// ---------------------------------------------------------------------------
// Validaciones previas (no tocan nada)
// ---------------------------------------------------------------------------

function validarObjetivos(plan, objetivos) {
  for (const id of objetivos.usuarios) {
    if (!UUID_RE.test(id)) throw new Error(`--usuario no es un uuid valido: ${id}`);
    if (!plan.usuariosElegibles.some((u) => u.id === id)) {
      const existe = plan.usuariosIgnorados.some((u) => u.id === id);
      throw new Error(
        `--usuario ${id} ${existe ? "existe pero NO es elegible (su correo no empieza por e2e-)" : "no existe o no aparece en la simulacion"}. Abortado sin tocar nada.`,
      );
    }
  }
  for (const id of objetivos.proyectos) {
    if (!UUID_RE.test(id)) throw new Error(`--proyecto no es un uuid valido: ${id}`);
    if (!plan.proyectosElegibles.some((p) => p.id === id)) {
      const existe = plan.proyectosIgnorados.some((p) => p.id === id);
      throw new Error(
        `--proyecto ${id} ${existe ? "existe pero NO es elegible (su nombre no empieza por e2e-)" : "no existe o no aparece en la simulacion"}. Abortado sin tocar nada.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Autotest del filtro (en memoria, sin backend ni credenciales)
// ---------------------------------------------------------------------------

export function correrAutotest() {
  const resultados = [];
  const probar = (nombre, fn) => {
    try {
      fn();
      resultados.push({ ok: true, nombre });
    } catch (e) {
      resultados.push({ ok: false, nombre, detalle: e instanceof Error ? e.message : String(e) });
    }
  };
  const igual = (obtenido, esperado, msg) => {
    const a = JSON.stringify(obtenido);
    const b = JSON.stringify(esperado);
    if (a !== b) throw new Error(`${msg}: esperado ${b}, obtenido ${a}`);
  };

  const usuarios = [
    { id: "u1", email: "e2e-a+123@example.com" },
    { id: "u2", email: "E2E-B@example.com" },
    { id: "u3", email: "duenio@example.com" },
    { id: "u4", email: "xe2e-a@example.com" },
    { id: "u5", email: "e2e@example.com" },
    { id: "u6", email: "  e2e-espacio@example.com  " },
    { id: "u7", email: "" },
    { id: "u8", email: "e2e-" },
  ];
  const proyectos = [
    { id: "p1", name: "e2e- proyecto", owner_id: "u1" },
    { id: "p2", name: "Proyecto real", owner_id: "u3" },
    { id: "p3", name: "E2E 123", owner_id: "u1" },
    { id: "p4", name: "  e2e-x", owner_id: "u4" },
  ];
  const perfiles = [
    { id: "u1", display_name: "A" },
    { id: "u2", display_name: "B" },
    { id: "u3", display_name: "Duenio" },
    { id: "u6", display_name: "C" },
  ];
  const miembros = [
    { project_id: "p1", user_id: "u2", role: "viewer" },
    { project_id: "p2", user_id: "u3", role: "viewer" },
    { project_id: "p2", user_id: "u1", role: "editor" },
    { project_id: "p1", user_id: "u3", role: "viewer" },
  ];
  const revisiones = [
    { id: 1, project_id: "p1", author_id: "u1" },
    { id: 2, project_id: "p2", author_id: "u1" },
    { id: 3, project_id: "p2", author_id: "u3" },
  ];

  probar("acepta correos con prefijo e2e-", () => {
    ["e2e-a+123@example.com", "E2E-B@example.com", "  e2e-espacio@example.com  "].forEach((v) =>
      igual(esElegible(v), true, v),
    );
  });
  probar("rechaza lo que no empieza por e2e-", () => {
    ["duenio@example.com", "xe2e-a@example.com", "e2e@example.com", "e2e-", "", null, undefined].forEach(
      (v) => igual(esElegible(v), false, String(v)),
    );
  });
  probar("acepta nombres de proyecto con prefijo e2e-", () => {
    ["e2e- proyecto", "  e2e-x", "e2e-123"].forEach((v) => igual(esElegible(v), true, v));
  });
  probar("rechaza nombres tipo 'E2E 123' sin guion", () => {
    ["E2E 123", "Proyecto real", "e2e_sin_guion"].forEach((v) => igual(esElegible(v), false, v));
  });

  const plan = planificar({ usuarios, proyectos, perfiles, miembros, revisiones });

  probar("clasifica usuarios elegibles", () => {
    igual(plan.usuariosElegibles.map((u) => u.id), ["u1", "u2", "u6"], "usuarios");
    igual(plan.usuariosIgnorados.map((u) => u.id), ["u3", "u4", "u5", "u7", "u8"], "ignorados");
  });
  probar("clasifica proyectos elegibles", () => {
    igual(plan.proyectosElegibles.map((p) => p.id), ["p1", "p4"], "proyectos");
    igual(plan.proyectosIgnorados.map((p) => p.id), ["p2", "p3"], "ignorados");
  });
  probar("miembros objetivo incluye proyecto elegible o usuario elegible", () => {
    igual(
      plan.miembrosObjetivo.map((m) => `${m.project_id}:${m.user_id}`),
      ["p1:u2", "p2:u1", "p1:u3"],
      "miembros",
    );
  });
  probar("revisiones objetivo solo de proyectos elegibles", () => {
    igual(plan.revisionesObjetivo.map((r) => r.id), [1], "revisiones");
    igual(plan.cascada.revisonesAutorAnulado.map((r) => r.id), [2], "author -> null");
  });
  probar("perfiles objetivo solo de usuarios elegibles", () => {
    igual(plan.perfilesObjetivo.map((p) => p.id), ["u1", "u2", "u6"], "perfiles");
  });
  probar("BLOQUEA usuarios si la cascada alcanza un proyecto no elegible", () => {
    igual(plan.bloqueoUsuarios, true, "bloqueo");
    igual(plan.cascada.proyectosNoElegibles.map((p) => p.id), ["p3"], "proyectos no elegibles");
  });
  probar("no bloquea cuando el proyecto no elegible es de un usuario no elegible", () => {
    const sinBloqueo = planificar({
      usuarios,
      proyectos: proyectos.map((p) => (p.id === "p3" ? { ...p, owner_id: "u3" } : p)),
      perfiles,
      miembros,
      revisiones,
    });
    igual(sinBloqueo.bloqueoUsuarios, false, "bloqueo");
    igual(sinBloqueo.cascada.proyectosNoElegibles.length, 0, "proyectos no elegibles");
  });
  probar("base vacia: plan sin objetivos ni bloqueo", () => {
    const vacio = planificar({ usuarios: [], proyectos: [], perfiles: [], miembros: [], revisiones: [] });
    igual(
      [
        vacio.usuariosElegibles.length,
        vacio.proyectosElegibles.length,
        vacio.miembrosObjetivo.length,
        vacio.revisionesObjetivo.length,
        vacio.perfilesObjetivo.length,
        vacio.bloqueoUsuarios,
      ],
      [0, 0, 0, 0, 0, false],
      "vacio",
    );
  });

  console.log("\nAutotest del filtro (sin backend):");
  resultados.forEach((r) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.nombre}${r.detalle ? " :: " + r.detalle : ""}`));
  const fallos = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas OK.`);
  return fallos === 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let opciones;
  try {
    opciones = parsearArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    uso();
    process.exitCode = 2;
    return;
  }

  if (opciones.ayuda) {
    uso();
    return;
  }
  if (opciones.autotest) {
    process.exitCode = correrAutotest() ? 0 : 1;
    return;
  }

  const idsInvalidos = [...opciones.usuarios, ...opciones.proyectos].filter((id) => !UUID_RE.test(id));
  if (idsInvalidos.length) {
    console.error(`ERROR: estos ids no son uuid validos: ${idsInvalidos.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const faltan = [];
  if (!url) faltan.push("SUPABASE_URL");
  if (!key) faltan.push("SUPABASE_SERVICE_ROLE_KEY");
  if (faltan.length) {
    console.error(`ERROR: faltan variables de entorno: ${faltan.join(", ")}`);
    console.error("Exportalas en la sesion. No las escribas en .env, en el repo ni en este script.");
    console.error('  $env:SUPABASE_URL="https://<ref>.supabase.co"');
    console.error('  $env:SUPABASE_SERVICE_ROLE_KEY="<service_role>"');
    process.exitCode = 2;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const estado = await leerTodo(supabase);
  let plan = planificar(estado);

  validarObjetivos(plan, opciones);
  imprimirSimulacion(plan, opciones.aplicar);

  if (!opciones.aplicar) {
    console.log("\nSimulacion terminada. No se modifico nada. Usa --aplicar para ejecutar.");
    if (plan.bloqueoUsuarios) {
      console.error("La simulacion NO es aplicable mientras exista el bloqueo de cascada.");
      process.exitCode = 1;
    }
    return;
  }

  if (plan.bloqueoUsuarios) {
    console.error("\nABORTADO: no se borra nada (bloqueo de cascada sobre proyectos no elegibles).");
    process.exitCode = 1;
    return;
  }

  // Preflight: re-leer y comparar con la simulacion ya mostrada.
  const fresco = planificar(await leerTodo(supabase));
  if (fresco.huella !== plan.huella) {
    console.error("\nABORTADO: los datos cambiaron entre la simulacion y --aplicar. Nada fue borrado.");
    process.exitCode = 1;
    return;
  }
  plan = fresco;

  if (plan.usuariosElegibles.length === 0 && plan.proyectosElegibles.length === 0) {
    console.log("\nNada elegible que borrar.");
  }

  const borrado = await aplicarPlan(supabase, plan);

  const usuariosFinal = await contarUsuarios(supabase);
  const proyectosFinal = await contarTabla(supabase, "projects");

  console.log("\n== RESUMEN (filas borradas) ==");
  for (const [tabla, n] of Object.entries(borrado)) console.log(`  ${tabla.padEnd(18)} ${n}`);
  console.log(`\nEstado final: auth.users=${usuariosFinal}  public.projects=${proyectosFinal}`);
}

const ejecucionDirecta =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (ejecucionDirecta) {
  main().catch((e) => {
    console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
