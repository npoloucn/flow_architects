// Colección de proyectos en localStorage.
//   flowarq.proyectos.v2        -> índice ligero (para pintar la lista sin cargar documentos)
//   flowarq.proyecto.v2.<id>    -> documento completo de cada proyecto
//   flowarq.meta.v2             -> { migrado, aviso }
//   flowarq.proyecto.v1         -> formato anterior (proyecto único): se migra una vez y se CONSERVA como respaldo
import { CATEGORIAS_DEFECTO, ESTADOS_NODO_DEFECTO, validarProyecto, type Proyecto, type Resultado } from "../domain/schema";
import { uid } from "../domain/commands";
import { nodeTypeIds } from "../nodeTypes/registry";

const IDX = "flowarq.proyectos.v2";
const PREF = "flowarq.proyecto.v2.";
const LEGACY = "flowarq.proyecto.v1";
const META = "flowarq.meta.v2";
const RESPALDO = "flowarq.respaldo.v1";

export const ERROR_CUOTA = "El almacenamiento del navegador está lleno. Quita imágenes grandes, elimina proyectos que no uses o exporta el proyecto a JSON.";

export interface IndiceProyecto {
  id: string; nombre: string; descripcion: string; creadoEn: string; actualizadoEn: string;
  nodos: number; tareas: number; tareasAbiertas: number;
}
export interface Meta { migrado: boolean; aviso: string | null }

const leer = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const escribir = (k: string, v: string): string | null => {
  try { localStorage.setItem(k, v); return null; } catch { return ERROR_CUOTA; }
};

export function resumen(d: Proyecto): IndiceProyecto {
  return {
    id: d.id, nombre: d.nombre, descripcion: d.descripcion, creadoEn: d.creadoEn, actualizadoEn: d.actualizadoEn,
    nodos: d.nodos.length, tareas: d.tareas.length, tareasAbiertas: d.tareas.filter((t) => t.estado !== "hecha").length,
  };
}

function reconstruirIndice(): IndiceProyecto[] {
  const out: IndiceProyecto[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREF)) {
        const r = validarProyecto(JSON.parse(localStorage.getItem(k) ?? "null"), nodeTypeIds());
        if (r.ok) out.push(resumen(r.doc));
      }
    }
  } catch { /* se ignoran entradas ilegibles */ }
  if (out.length) escribir(IDX, JSON.stringify(out));
  return out;
}

export function listar(): IndiceProyecto[] {
  const raw = leer(IDX);
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v as IndiceProyecto[];
    } catch { /* índice dañado: se reconstruye */ }
  }
  return reconstruirIndice();
}

const RESP_V = "flowarq.respaldo.v";

export function leerDoc(id: string): Resultado {
  const raw = leer(PREF + id);
  if (!raw) return { ok: false, issues: ["No existe un proyecto con ese identificador."] };
  try {
    const r = validarProyecto(JSON.parse(raw), nodeTypeIds());
    // Documento en schemaVersion 1: se guarda una copia intacta y se reescribe ya migrado a la versión 2.
    if (r.ok && r.migrado) {
      if (leer(RESP_V + (r.desde ?? 1) + "." + id) === null) escribir(RESP_V + (r.desde ?? 1) + "." + id, raw);
      guardarDoc(r.doc);
    }
    return r;
  } catch {
    return { ok: false, issues: ["El proyecto guardado está dañado (JSON ilegible)."] };
  }
}

export function guardarDoc(doc: Proyecto): { ok: true } | { ok: false; error: string } {
  const e = escribir(PREF + doc.id, JSON.stringify(doc));
  if (e) return { ok: false, error: e };
  const lista = listar().filter((x) => x.id !== doc.id);
  lista.push(resumen(doc));
  const e2 = escribir(IDX, JSON.stringify(lista));
  return e2 ? { ok: false, error: e2 } : { ok: true };
}

export function eliminarDoc(id: string): void {
  try {
    localStorage.removeItem(PREF + id);
  } catch { /* nada que hacer */ }
  escribir(IDX, JSON.stringify(listar().filter((x) => x.id !== id)));
}

export const existe = (id: string) => leer(PREF + id) !== null;

export function proyectoVacio(nombre: string, descripcion: string): Proyecto {
  const ahora = new Date().toISOString();
  return { schemaVersion: 5, id: uid("prj"), nombre: nombre.trim(), descripcion: descripcion.trim(), creadoEn: ahora, actualizadoEn: ahora, categorias: CATEGORIAS_DEFECTO, estados: ESTADOS_NODO_DEFECTO, vistaNodo: "completa", zonas: [], nodos: [], relaciones: [], tareas: [], documentos: [] };
}

export function leerMeta(): Meta {
  try {
    const m = JSON.parse(leer(META) ?? "null");
    if (m && typeof m.migrado === "boolean") return { migrado: m.migrado, aviso: typeof m.aviso === "string" ? m.aviso : null };
  } catch { /* meta dañada: se asume sin migrar */ }
  return { migrado: false, aviso: null };
}
export const escribirMeta = (m: Meta) => escribir(META, JSON.stringify(m));

/** Migración única del formato anterior (clave de proyecto único). No borra nada: el original queda como respaldo. */
export function migrar(): void {
  if (leerMeta().migrado) return;
  const raw = leer(LEGACY);
  if (!raw) {
    escribirMeta({ migrado: true, aviso: null });
    return;
  }
  let aviso: string;
  try {
    const r = validarProyecto(JSON.parse(raw), nodeTypeIds());
    if (!r.ok) throw new Error("esquema");
    let doc = r.doc;
    if (existe(doc.id)) doc = { ...doc, id: uid("prj") };
    const g = guardarDoc(doc);
    if (!g.ok) return; // sin espacio: no se marca migrado, se reintenta en la próxima carga
    aviso = `Tu proyecto guardado «${doc.nombre}» (${doc.nodos.length} nodos, ${doc.tareas.length} tareas) se migró a la nueva lista de proyectos. No se perdió nada; el original se conserva como respaldo.`;
  } catch {
    escribir(RESPALDO, raw);
    aviso = "Había un proyecto guardado con el formato anterior, pero no pasó la validación y no pudo migrarse. Se conservó una copia intacta como respaldo en el navegador.";
  }
  escribirMeta({ migrado: true, aviso });
}
