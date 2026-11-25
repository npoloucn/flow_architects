import { create } from "zustand";
import type { Proyecto, Puerto } from "../domain/schema";
import * as C from "../domain/commands";
import { getNodeType } from "../nodeTypes/registry";
import { vistaDe } from "../nodeViews/registry";
import { guardarDoc, leerDoc } from "../persistence/coleccion";

/**
 * Store del DOCUMENTO abierto: única fuente de verdad del proyecto en edición, con historial de
 * deshacer/rehacer (snapshots inmutables, máx. 50). Al abrir otro proyecto el historial se reinicia.
 * No sabe nada de viewport, selección ni tema.
 */
const MAX_HISTORIAL = 50;

interface ProjectState {
  projectId: string | null;
  doc: Proyecto | null;
  saveError: string | null;
  past: Proyecto[];
  future: Proyecto[];
  abrirProyecto: (id: string) => { ok: true } | { ok: false; issues: string[] };
  cerrarProyecto: () => void;
  undo: () => void;
  redo: () => void;
  reemplazarProyecto: (doc: Proyecto) => void;
  crearNodo: (tipo: string, parentId: string | null, pos: { x: number; y: number }, categoriaId?: string) => C.Res<{ id: string }>;
  moverNodo: (id: string, pos: { x: number; y: number }) => C.Res;
  crearZona: (scopeId: string | null, pos: { x: number; y: number }) => C.Res<{ id: string }>;
  actualizarZona: (id: string, patch: C.ZonaPatch, coalesce?: string) => C.Res;
  moverZona: (id: string, pos: { x: number; y: number }) => C.Res;
  redimensionarZona: (id: string, pos: { x: number; y: number }, tam: { ancho: number; alto: number }) => C.Res;
  eliminarZona: (id: string) => C.Res;
  ajustarZona: (id: string) => C.Res;
  asignarZona: (nodoId: string, zonaId: string | null) => C.Res;
  actualizarNodo: (id: string, patch: C.NodoPatch, coalesce?: string) => C.Res;
  establecerVista: (vista: string) => C.Res;
  crearCategoria: (nombre: string) => C.Res<{ id: string }>;
  actualizarCategoria: (id: string, patch: Parameters<typeof C.actualizarCategoria>[2], coalesce?: string) => C.Res;
  eliminarCategoria: (id: string, reasignarA: string) => C.Res;
  crearEstado: (nombre: string) => C.Res<{ id: string }>;
  actualizarEstado: (id: string, patch: C.EstadoPatch, coalesce?: string) => C.Res;
  moverEstado: (id: string, dir: -1 | 1) => C.Res;
  eliminarEstado: (id: string, reasignarA: string) => C.Res;
  cambiarTipo: (id: string, tipo: string, eliminarHijos: boolean) => C.Res;
  duplicarNodo: (id: string, conHijos: boolean) => C.Res<{ id: string }>;
  eliminarNodo: (id: string) => C.Res;
  conectar: (source: string, target: string, pi?: Puerto, pf?: Puerto) => C.Res<{ id: string }>;
  /** `coalesce`: ediciones continuas (color, texto) con la misma clave en < 1,2 s forman un solo paso de deshacer. */
  actualizarRelacion: (id: string, patch: C.RelacionPatch, coalesce?: string) => C.Res;
  invertirRelacion: (id: string) => C.Res;
  eliminarRelacion: (id: string) => C.Res;
  crearTarea: (nodoId: string, titulo: string, descripcion?: string) => C.Res<{ id: string }>;
  actualizarTarea: (id: string, patch: C.TareaPatch) => C.Res;
  eliminarTarea: (id: string) => C.Res;
  ciclarTarea: (id: string) => C.Res;
  crearDocumento: (nodoId: string, d: C.DocInput) => C.Res<{ id: string }>;
  actualizarDocumento: (id: string, d: C.DocInput) => C.Res;
  eliminarDocumento: (id: string) => C.Res;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastKey: string | null = null;
let lastAt = 0;

export const useProjectStore = create<ProjectState>((set, get) => {
  const commit = (doc: Proyecto, key?: string) =>
    set((s) => {
      const ahora = Date.now();
      const fusiona = !!key && key === lastKey && ahora - lastAt < 1200 && s.past.length > 0;
      lastKey = key ?? null;
      lastAt = ahora;
      return fusiona ? { doc, future: [] } : { doc, past: [...s.past, s.doc!].slice(-MAX_HISTORIAL), future: [] };
    });
  const apply = <T extends object>(r: C.Res<T>, key?: string): C.Res<T> => {
    if (r.ok) commit(r.doc, key);
    return r;
  };
  const d = () => get().doc!;
  /** Tamaño del marco de colocación de cada nodo según su tipo (para decidir en qué zona cae). */
  const frame = (): C.Frame => (id) => { const n = get().doc!.nodos.find((x) => x.id === id); return n ? getNodeType(n.tipo).size : { w: 0, h: 0 }; };
  /** Tamaño real de la tarjeta según su vista (para medir la separación mínima de las flechas verticales). */
  const card: C.CardSize = (id) => {
    const doc = get().doc!;
    const n = doc.nodos.find((x) => x.id === id);
    return n ? vistaDe(doc, n).size(getNodeType(n.tipo)) : { w: 0, h: 0 };
  };

  return {
    projectId: null,
    doc: null,
    saveError: null,
    past: [],
    future: [],

    abrirProyecto: (id) => {
      flush();
      const r = leerDoc(id);
      if (!r.ok) return r;
      set({ projectId: id, doc: r.doc, past: [], future: [], saveError: null });
      return { ok: true };
    },
    cerrarProyecto: () => {
      flush();
      set({ projectId: null, doc: null, past: [], future: [], saveError: null });
    },
    undo: () => { lastKey = null; set((s) => (s.past.length ? { doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc!, ...s.future] } : s)); },
    redo: () => { lastKey = null; set((s) => (s.future.length ? { doc: s.future[0], future: s.future.slice(1), past: [...s.past, s.doc!].slice(-MAX_HISTORIAL) } : s)); },
    reemplazarProyecto: (doc) => commit({ ...doc, id: get().projectId! }),

    crearNodo: (tipo, parentId, pos, cat) => apply(C.crearNodo(d(), tipo, parentId, pos, getNodeType(tipo).defaults(), cat)),
    // Al soltar, el nodo se acomoda si una flecha vertical quedaría sin tramo visible; el ajuste es parte del mismo paso de deshacer.
    moverNodo: (id, pos) => {
      const doc = d();
      return apply(C.moverNodo(doc, id, C.posicionConSeparacionVertical(doc, id, pos, frame(), card), frame()));
    },
    crearZona: (scope, pos) => apply(C.crearZona(d(), scope, pos, frame())),
    actualizarZona: (id, p, key) => apply(C.actualizarZona(d(), id, p), key),
    moverZona: (id, pos) => apply(C.moverZona(d(), id, pos)),
    redimensionarZona: (id, pos, tam) => apply(C.redimensionarZona(d(), id, pos, tam, frame())),
    eliminarZona: (id) => apply(C.eliminarZona(d(), id)),
    ajustarZona: (id) => apply(C.ajustarZonaANodos(d(), id, frame())),
    asignarZona: (nid, zid) => apply(C.asignarZona(d(), nid, zid, frame())),
    actualizarNodo: (id, patch, key) => apply(C.actualizarNodo(d(), id, patch), key),
    establecerVista: (v) => apply(C.establecerVistaProyecto(d(), v)),
    crearCategoria: (n) => apply(C.crearCategoria(d(), n)),
    actualizarCategoria: (id, p, key) => apply(C.actualizarCategoria(d(), id, p), key),
    eliminarCategoria: (id, to) => apply(C.eliminarCategoria(d(), id, to)),
    crearEstado: (n) => apply(C.crearEstado(d(), n)),
    actualizarEstado: (id, p, key) => apply(C.actualizarEstado(d(), id, p), key),
    moverEstado: (id, dir) => apply(C.moverEstado(d(), id, dir)),
    eliminarEstado: (id, to) => apply(C.eliminarEstado(d(), id, to)),
    cambiarTipo: (id, tipo, eliminarHijos) => apply(C.cambiarTipoNodo(d(), id, tipo, eliminarHijos)),
    duplicarNodo: (id, conHijos) => apply(C.duplicarNodo(d(), id, conHijos)),
    eliminarNodo: (id) => apply(C.eliminarNodo(d(), id)),
    conectar: (s, t, pi, pf) => apply(C.conectarAcomodado(d(), s, t, pi ?? "derecha", pf ?? "izquierda", frame(), card)),
    invertirRelacion: (id) => {
      const r = C.invertirRelacion(d(), id);
      return r.ok ? apply({ ok: true as const, doc: C.acomodarRelacion(r.doc, id, frame(), card) }) : apply(r);
    },
    actualizarRelacion: (id, p, key) => {
      const r = C.actualizarRelacion(d(), id, p);
      if (!r.ok) return apply(r, key);
      const puertos = p.puertoInicio !== undefined || p.puertoFin !== undefined;
      return apply({ ok: true as const, doc: puertos ? C.acomodarRelacion(r.doc, id, frame(), card) : r.doc }, key);
    },
    eliminarRelacion: (id) => apply(C.eliminarRelacion(d(), id)),
    crearTarea: (nodoId, titulo, descripcion) => apply(C.crearTarea(d(), nodoId, titulo, descripcion)),
    actualizarTarea: (id, p) => apply(C.actualizarTarea(d(), id, p)),
    eliminarTarea: (id) => apply(C.eliminarTarea(d(), id)),
    ciclarTarea: (id) => {
      const t = d().tareas.find((x) => x.id === id);
      return t ? apply(C.actualizarTarea(d(), id, { estado: C.siguienteEstadoTarea[t.estado] })) : { ok: false, error: "La tarea ya no existe." };
    },
    crearDocumento: (nodoId, di) => apply(C.crearDocumento(d(), nodoId, di)),
    actualizarDocumento: (id, di) => apply(C.actualizarDocumento(d(), id, di)),
    eliminarDocumento: (id) => apply(C.eliminarDocumento(d(), id)),
  };
});

// ---- Autoguardado del proyecto abierto: debounce + volcado inmediato al cerrar/ocultar/cambiar de proyecto ----
function flush() {
  clearTimeout(timer);
  const { doc, projectId, saveError } = useProjectStore.getState();
  if (!doc || !projectId) return;
  const r = guardarDoc(doc);
  const err = r.ok ? null : r.error;
  if (err !== saveError) useProjectStore.setState({ saveError: err });
}
useProjectStore.subscribe((s, p) => {
  if (s.doc && s.doc !== p.doc && s.projectId === p.projectId) {
    clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }
});
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", flush);
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
