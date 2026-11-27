import { create } from "zustand";
import type { Proyecto, Puerto } from "../domain/schema";
import * as C from "../domain/commands";
import { getNodeType } from "../nodeTypes/registry";
import { vistaDe } from "../nodeViews/registry";
import { guardarDoc, leerDoc } from "../persistence/coleccion";
import { configurado, type Visibilidad } from "../lib/supabase";
import { useAuth } from "./authStore";
import { ErrorNube, esIdNube, guardarProyecto, obtenerProyecto, revisionActual, type RolProyecto } from "../persistence/nube";
import { guardarCache, leerCache } from "../persistence/cache";

/**
 * Store del DOCUMENTO abierto: Ãºnica fuente de verdad del proyecto en ediciÃ³n, con historial de
 * deshacer/rehacer (snapshots inmutables, mÃ¡x. 50). Al abrir otro proyecto el historial se reinicia.
 * No sabe nada de viewport, selecciÃ³n ni tema.
 *
 * Modos:
 *  - `local`   proyecto del navegador (comportamiento historico).
 *  - `cloud`   proyecto en Supabase con permiso de edicion; autoguardado por RPC `save_project`.
 *  - `lectura` proyecto de la nube visible pero sin permiso de edicion (visitante o viewer).
 *  - `offline` copia en cache porque no hay red; no se permite guardar.
 */
const MAX_HISTORIAL = 50;

export type ModoProyecto = "local" | "cloud" | "lectura" | "offline";

export interface ConflictoProyecto {
  mensaje: string;
  revision: number | null;
}

interface ProjectState {
  projectId: string | null;
  doc: Proyecto | null;
  saveError: string | null;
  modo: ModoProyecto;
  revision: number | null;
  miRol: RolProyecto | null;
  visibilidad: Visibilidad | null;
  ownerId: string | null;
  conflicto: ConflictoProyecto | null;
  sinConexion: boolean;
  guardando: boolean;
  /** Hay cambios sin guardar en la nube (se reintentan al volver la conexion). */
  sucio: boolean;
  ultimoGuardado: string | null;
  past: Proyecto[];
  future: Proyecto[];
  abrirProyecto: (id: string) => Promise<{ ok: true } | { ok: false; issues: string[] }>;
  cerrarProyecto: () => void;
  undo: () => void;
  redo: () => void;
  reemplazarProyecto: (doc: Proyecto) => void;
  guardarAhora: () => Promise<void>;
  recargarDelServidor: () => Promise<boolean>;
  guardarEncima: () => Promise<boolean>;
  sincronizarMeta: (p: { revision?: number; visibilidad?: Visibilidad; miRol?: RolProyecto }) => void;
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
let guardandoEnCurso = false;
let guardadoPendiente = false;

const SIN_RED = "Sin conexion: estas viendo una copia local. Vuelve a conectarte para guardar.";
const TIEMPO_AGOTADO = Symbol("tiempo-agotado");

/** Limita la espera de una promesa; si expira se rechaza con TIEMPO_AGOTADO. */
function conTiempo<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rechazar) => setTimeout(() => rechazar(TIEMPO_AGOTADO), ms)),
  ]);
}

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
    if (get().modo === "lectura") return { ok: false, error: "Este proyecto es de solo lectura. Inicia sesion con permiso de edicion para modificarlo." };
    if (r.ok) commit(r.doc, key);
    return r;
  };
  const d = () => get().doc!;
  /** TamaÃ±o del marco de colocaciÃ³n de cada nodo segÃºn su tipo (para decidir en quÃ© zona cae). */
  const frame = (): C.Frame => (id) => { const n = get().doc!.nodos.find((x) => x.id === id); return n ? getNodeType(n.tipo).size : { w: 0, h: 0 }; };
  /** TamaÃ±o real de la tarjeta segÃºn su vista (para medir la separaciÃ³n mÃ­nima de las flechas verticales). */
  const card: C.CardSize = (id) => {
    const doc = get().doc!;
    const n = doc.nodos.find((x) => x.id === id);
    return n ? vistaDe(doc, n).size(getNodeType(n.tipo)) : { w: 0, h: 0 };
  };

  return {
    projectId: null,
    doc: null,
    saveError: null,
    modo: "local",
    revision: null,
    miRol: null,
    visibilidad: null,
    ownerId: null,
    conflicto: null,
    sinConexion: false,
    guardando: false,
    sucio: false,
    ultimoGuardado: null,
    past: [],
    future: [],

    abrirProyecto: async (id) => {
      flush();
      const local = () => {
        const r = leerDoc(id);
        if (!r.ok) return r;
        set({ projectId: id, doc: r.doc, past: [], future: [], saveError: null, modo: "local", revision: null, miRol: null, visibilidad: null, ownerId: null, conflicto: null, sinConexion: false, sucio: false, ultimoGuardado: null });
        return { ok: true as const };
      };

      if (!configurado || !esIdNube(id)) return local();

      const uid = useAuth.getState().user?.id ?? null;
      const sinRed = typeof navigator !== "undefined" && navigator.onLine === false;
      const desdeCache = (): { ok: true } | { ok: false; issues: string[] } => {
        const c = leerCache(id);
        if (!c) return { ok: false, issues: ["Sin conexion y este proyecto no tiene una copia guardada en este navegador."] };
        const editable = !!uid && (c.rol === "owner" || c.rol === "editor");
        set({
          projectId: id, doc: c.doc, past: [], future: [], saveError: null,
          modo: sinRed ? "offline" : editable ? "cloud" : "lectura",
          revision: c.revision, miRol: (c.rol as RolProyecto) ?? null, visibilidad: c.visibilidad, ownerId: c.ownerId,
          conflicto: null, sinConexion: sinRed, sucio: false, ultimoGuardado: null,
        });
        return { ok: true };
      };

      if (sinRed) return desdeCache();

      try {
        const p = await obtenerProyecto(id, uid);
        if (!p) {
          const c = leerCache(id);
          if (c) return desdeCache();
          return { ok: false, issues: ["El proyecto no existe o no tienes permiso para verlo."] };
        }
        const editable = !!uid && (p.rol === "owner" || p.rol === "editor");
        guardarCache(id, { doc: p.data, revision: p.revision, actualizadoEn: p.actualizadoEn, ownerId: p.ownerId, visibilidad: p.visibilidad, rol: p.rol });
        set({
          projectId: id, doc: p.data, past: [], future: [], saveError: null,
          modo: editable ? "cloud" : "lectura",
          revision: p.revision, miRol: p.rol, visibilidad: p.visibilidad, ownerId: p.ownerId,
          conflicto: null, sinConexion: false, sucio: false, ultimoGuardado: null,
        });
        return { ok: true };
      } catch (e) {
        const c = leerCache(id);
        if (c) return desdeCache();
        return { ok: false, issues: [e instanceof Error ? e.message : "No se pudo abrir el proyecto."] };
      }
    },

    cerrarProyecto: () => {
      flush();
      set({ projectId: null, doc: null, past: [], future: [], saveError: null, modo: "local", revision: null, miRol: null, visibilidad: null, ownerId: null, conflicto: null, sinConexion: false, guardando: false, sucio: false, ultimoGuardado: null });
    },
    undo: () => { if (get().modo === "lectura") return; lastKey = null; set((s) => (s.past.length ? { doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc!, ...s.future] } : s)); },
    redo: () => { if (get().modo === "lectura") return; lastKey = null; set((s) => (s.future.length ? { doc: s.future[0], future: s.future.slice(1), past: [...s.past, s.doc!].slice(-MAX_HISTORIAL) } : s)); },
    reemplazarProyecto: (doc) => { if (get().modo !== "lectura") commit({ ...doc, id: get().projectId! }); },

    guardarAhora: async () => { await guardarNube(); },

    recargarDelServidor: async () => {
      const s = get();
      if (!s.projectId) return false;
      try {
        const p = await obtenerProyecto(s.projectId, useAuth.getState().user?.id ?? null);
        if (!p) throw new Error("No se pudo leer la version del servidor.");
        const editable = p.rol === "owner" || p.rol === "editor";
        set({ doc: p.data, revision: p.revision, modo: editable ? "cloud" : "lectura", miRol: p.rol, visibilidad: p.visibilidad, ownerId: p.ownerId, conflicto: null, sinConexion: false, sucio: false, past: [], future: [], saveError: null });
        guardarCache(p.id, { doc: p.data, revision: p.revision, actualizadoEn: p.actualizadoEn, ownerId: p.ownerId, visibilidad: p.visibilidad, rol: p.rol });
        return true;
      } catch (e) {
        set({ saveError: e instanceof Error ? e.message : "No se pudo recargar." });
        return false;
      }
    },

    guardarEncima: async () => {
      const s = get();
      if (!s.projectId || !s.doc) return false;
      try {
        const p = await guardarProyecto(s.projectId, s.doc, null);
        set({ revision: p.revision, conflicto: null, guardando: false, sucio: false, ultimoGuardado: new Date().toISOString(), sinConexion: false, saveError: null, modo: "cloud" });
        guardarCache(p.id, { doc: s.doc, revision: p.revision, actualizadoEn: new Date().toISOString(), ownerId: p.ownerId, visibilidad: p.visibilidad, rol: s.miRol ?? "owner" });
        return true;
      } catch (e) {
        set({ conflicto: { mensaje: e instanceof Error ? e.message : "No se pudo guardar.", revision: s.revision }, guardando: false });
        return false;
      }
    },

    sincronizarMeta: (p) => set((s) => ({
      revision: p.revision ?? s.revision,
      visibilidad: p.visibilidad ?? s.visibilidad,
      miRol: p.miRol ?? s.miRol,
    })),

    crearNodo: (tipo, parentId, pos, cat) => apply(C.crearNodo(d(), tipo, parentId, pos, getNodeType(tipo).defaults(), cat)),
    // Al soltar, el nodo se acomoda si una flecha vertical quedarÃ­a sin tramo visible; el ajuste es parte del mismo paso de deshacer.
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
    conectar: (s, t, pi, pf) => {
      const doc = d();
      // Sin lados explícitos (arrastre desde un handle o sobre el cuerpo del nodo): elige el par más natural.
      const auto = pi && pf ? null : C.puertosAutomaticos(doc, s, t, frame(), card);
      const puertoInicio = pi ?? auto?.puertoInicio ?? "derecha";
      const puertoFin = pf ?? auto?.puertoFin ?? "izquierda";
      return apply(C.conectarAcomodado(doc, s, t, puertoInicio, puertoFin, frame(), card));
    },
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

/** Guarda el proyecto abierto. Local = sincrono; nube = RPC con control de revision. */
async function guardarNube(): Promise<void> {
  const s = useProjectStore.getState();
  if (!s.projectId || !s.doc) return;
  if (s.modo === "lectura") return;
  if (s.modo === "offline" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    if (!s.sinConexion) useProjectStore.setState({ sinConexion: true, saveError: SIN_RED });
    return;
  }
  if (s.conflicto) return;
  if (guardandoEnCurso) { guardadoPendiente = true; return; }

  guardandoEnCurso = true;
  useProjectStore.setState({ guardando: true });
  const doc = s.doc;
  try {
    // Comprobacion previa: detecta el conflicto sin depender de que el RPC
    // devuelva 40001 (en algunos despliegues PostgREST deja esa respuesta colgada).
    let revision = s.revision;
    if (revision !== null) {
      const revServidor = await revisionActual(s.projectId);
      if (revServidor === null) throw new ErrorNube("El proyecto ya no existe o no tienes permiso para guardarlo.");
      if (revServidor !== revision) {
        useProjectStore.setState({ guardando: false, conflicto: { mensaje: `La version del servidor (${revServidor}) es mas nueva que la tuya (${revision}).`, revision }, saveError: null });
        return;
      }
      revision = revServidor;
    }
    const fila = await conTiempo(guardarProyecto(s.projectId, doc, revision), 15000);
    guardarCache(s.projectId, {
      doc, revision: fila.revision, actualizadoEn: new Date().toISOString(),
      ownerId: fila.ownerId, visibilidad: fila.visibilidad, rol: s.miRol ?? "editor",
    });
    useProjectStore.setState((cur) => cur.projectId === s.projectId
      ? { revision: fila.revision, guardando: false, sucio: cur.doc === doc ? false : cur.sucio, ultimoGuardado: new Date().toISOString(), sinConexion: false, saveError: null }
      : { guardando: false });
  } catch (e) {
    if (e === TIEMPO_AGOTADO) {
      const rev = await revisionActual(s.projectId).catch(() => null);
      if (rev !== null && rev !== s.revision) {
        useProjectStore.setState({ guardando: false, conflicto: { mensaje: `La version del servidor (${rev}) avanzo mientras guardabas.`, revision: s.revision }, saveError: null });
        return;
      }
      useProjectStore.setState({ guardando: false, saveError: "El guardado tardo demasiado. Revisa tu conexion e intentalo de nuevo." });
      return;
    }
    if (e instanceof ErrorNube && e.code === "40001") {
      useProjectStore.setState({ guardando: false, conflicto: { mensaje: e.message, revision: s.revision }, saveError: null });
      return;
    }
    const sinRed = typeof navigator !== "undefined" && navigator.onLine === false;
    useProjectStore.setState({
      guardando: false,
      sinConexion: sinRed,
      saveError: sinRed ? SIN_RED : e instanceof Error ? e.message : "No se pudo guardar el proyecto.",
    });
  } finally {
    guardandoEnCurso = false;
    if (guardadoPendiente) {
      guardadoPendiente = false;
      void guardarNube();
    }
  }
}

// ---- Autoguardado del proyecto abierto: debounce + volcado inmediato al cerrar/ocultar/cambiar de proyecto ----
function flush() {
  clearTimeout(timer);
  const { doc, projectId, modo, conflicto } = useProjectStore.getState();
  if (!doc || !projectId) return;
  if (modo === "local") {
    const r = guardarDoc(doc);
    const err = r.ok ? null : r.error;
    if (err !== useProjectStore.getState().saveError) useProjectStore.setState({ saveError: err });
    return;
  }
  if (modo === "cloud" && !conflicto && useProjectStore.getState().sucio) void guardarNube();
}
useProjectStore.subscribe((s, p) => {
  if (s.doc && s.doc !== p.doc && s.projectId === p.projectId) {
    if (s.modo === "lectura") return;
    if (!s.sucio) useProjectStore.setState({ sucio: true });
    clearTimeout(timer);
    timer = setTimeout(() => { void guardarNube(); }, 700);
  }
});
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("offline", () => useProjectStore.setState({ sinConexion: true }));
  window.addEventListener("online", () => {
    const s = useProjectStore.getState();
    const modo = s.modo === "offline" ? (s.miRol === "owner" || s.miRol === "editor" ? "cloud" : "lectura") : s.modo;
    useProjectStore.setState({ sinConexion: false, saveError: null, modo });
    if (modo === "cloud" && s.sucio) void guardarNube();
  });
}


