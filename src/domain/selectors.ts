// Selectores puros sobre el documento. Sin React ni DOM.
import type { Estado, EstadoTarea, Nodo, Proyecto, Tarea } from "./schema";

export const hijos = (doc: Proyecto, id: string | null): Nodo[] => doc.nodos.filter((n) => n.parentId === id);

export function descendientesIds(doc: Proyecto, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const h of hijos(doc, cur)) {
      out.add(h.id);
      stack.push(h.id);
    }
  }
  return out;
}

export const tareasDeNodo = (doc: Proyecto, id: string): Tarea[] => doc.tareas.filter((t) => t.nodoId === id);

/** Tareas del propio nodo + las de todos sus descendientes. */
export function tareasDeSubarbol(doc: Proyecto, id: string): Tarea[] {
  const ids = descendientesIds(doc, id);
  ids.add(id);
  return doc.tareas.filter((t) => ids.has(t.nodoId));
}

export function contarPorEstado(tareas: Tarea[]): Record<EstadoTarea, number> {
  const c: Record<EstadoTarea, number> = { pendiente: 0, "en-curso": 0, hecha: 0, bloqueada: 0 };
  for (const t of tareas) c[t.estado]++;
  return c;
}

/** Ancestros desde la raíz hasta el nivel dado (incluido). `null` = nivel raíz => []. */
export function ruta(doc: Proyecto, levelId: string | null): Nodo[] {
  const out: Nodo[] = [];
  let cur = levelId;
  while (cur) {
    const n = doc.nodos.find((x) => x.id === cur);
    if (!n) break;
    out.unshift(n);
    cur = n.parentId;
  }
  return out;
}

/** ¿`a` es ancestro estricto de `b`? (`null` = raíz, ancestro de todo nivel no raíz). */
export function esAncestro(doc: Proyecto, a: string | null, b: string | null): boolean {
  if (a === b) return false;
  if (a === null) return true;
  return ruta(doc, b).some((n) => n.id === a);
}

export const profundidad = (doc: Proyecto, id: string) => ruta(doc, id).length;

export const relacionesDeNivel = (doc: Proyecto, level: string | null) => doc.relaciones.filter((r) => r.scopeId === level);

export const primeraLinea = (md: string) =>
  (md.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "").replace(/[*_`>]/g, "").trim();

// ---- metadatos de estado ----
/** Estados del proyecto ordenados; los nodos los referencian por `estadoId`. */
export const estadosOrdenados = (doc: Pick<Proyecto, "estados">): Estado[] =>
  [...doc.estados].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

/** Estado de un nodo; si falta (documento dañado) cae al primero del proyecto. */
export const estadoDeNodo = (doc: Pick<Proyecto, "estados">, nodo: Pick<Nodo, "estadoId">): Estado =>
  doc.estados.find((e) => e.id === nodo.estadoId) ?? estadosOrdenados(doc)[0];

export const ESTADO_TAREA_LABEL: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  "en-curso": "En curso",
  hecha: "Hecha",
  bloqueada: "Bloqueada",
};
export const ESTADO_TAREA_PLURAL: Record<EstadoTarea, string> = {
  pendiente: "pendientes",
  "en-curso": "en curso",
  hecha: "hechas",
  bloqueada: "bloqueadas",
};

export const categoriaDe = (doc: Proyecto, id: string) => doc.categorias.find((c) => c.id === id);