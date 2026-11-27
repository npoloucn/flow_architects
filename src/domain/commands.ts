// Comandos puros (documento, parámetros) -> documento nuevo | error. Sin React ni DOM.
// Todas las mutaciones del grafo pasan por aquí; si un comando falla, el documento queda intacto.
import { HEX, ICONO_RE, IMAGEN_RE, LIMITE_DESCRIPCION_TAREA, LIMITES_TEXTO, type Categoria, type Estado, type Puerto, type Zona, ZONA_MIN, RELACION_DEFECTO, type Documento, type EstadoTarea, type Nodo, type Proyecto, type Relacion, type RelacionConfig, type Tarea } from "./schema";
import { descendientesIds } from "./selectors";

export type Res<T extends object = object> = ({ ok: true; doc: Proyecto } & T) | { ok: false; error: string };

const now = () => new Date().toISOString();
export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const touch = (d: Proyecto): Proyecto => ({ ...d, actualizadoEn: now() });

export interface Impacto { nodos: number; tareas: number; documentos: number; relaciones: number }

/** Qué se borra en cascada. `incluirPropio`: cuenta también las tareas/documentos/flechas del propio nodo. */
export function impacto(doc: Proyecto, id: string, incluirPropio: boolean): Impacto {
  const desc = descendientesIds(doc, id);
  const ids = new Set(desc);
  if (incluirPropio) ids.add(id);
  return {
    nodos: desc.size,
    tareas: doc.tareas.filter((t) => ids.has(t.nodoId)).length,
    documentos: doc.documentos.filter((d) => ids.has(d.nodoId)).length,
    relaciones: doc.relaciones.filter((r) => ids.has(r.sourceId) || ids.has(r.targetId) || (r.scopeId !== null && ids.has(r.scopeId))).length,
  };
}

function quitarNodos(doc: Proyecto, ids: Set<string>): Proyecto {
  return touch({
    ...doc,
    zonas: doc.zonas.filter((z) => z.scopeId === null || !ids.has(z.scopeId)),
    nodos: doc.nodos.filter((n) => !ids.has(n.id)),
    relaciones: doc.relaciones.filter((r) => !ids.has(r.sourceId) && !ids.has(r.targetId) && !(r.scopeId !== null && ids.has(r.scopeId))),
    tareas: doc.tareas.filter((t) => !ids.has(t.nodoId)),
    documentos: doc.documentos.filter((d) => !ids.has(d.nodoId)),
  });
}

// ---------------- nodos ----------------
export function crearNodo(
  doc: Proyecto, tipo: string, parentId: string | null, pos: { x: number; y: number },
  base: Pick<Nodo, "titulo" | "descripcion" | "estadoId" | "responsables">,
  categoriaId?: string,
): Res<{ id: string }> {
  if (parentId !== null && !doc.nodos.some((n) => n.id === parentId)) return fail("El nivel donde ibas a crear el nodo ya no existe.");
  const id = uid("nd");
  const cat = doc.categorias.find((c) => c.id === categoriaId) ?? doc.categorias.find((c) => c.id === "general") ?? doc.categorias[0];
  const estadoId = doc.estados.some((e) => e.id === base.estadoId) ? base.estadoId : [...doc.estados].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))[0].id;
  const nodo: Nodo = { id, parentId, tipo, categoriaId: cat.id, ...base, estadoId, posicion: pos, colapsado: false, creadoEn: now(), actualizadoEn: now() };
  return { ok: true, id, doc: touch({ ...doc, nodos: [...doc.nodos, nodo] }) };
}

/** Tamaño del marco de colocación de cada nodo (lo aporta la UI; el dominio no conoce el registro de tipos). */
export type Frame = (nodoId: string) => { w: number; h: number };

/** Zona más pequeña del nivel que contiene el punto (cx,cy), o null. */
export function zonaEnPunto(doc: Proyecto, scopeId: string | null, cx: number, cy: number): string | null {
  let mejor: { id: string; area: number } | null = null;
  for (const z of doc.zonas) {
    if (z.scopeId !== scopeId) continue;
    const { x, y } = z.posicion, { ancho, alto } = z.tamano;
    if (cx >= x && cx <= x + ancho && cy >= y && cy <= y + alto && (!mejor || ancho * alto < mejor.area)) mejor = { id: z.id, area: ancho * alto };
  }
  return mejor?.id ?? null;
}
const centroDe = (n: Nodo, frame: Frame) => { const f = frame(n.id); return { cx: n.posicion.x + f.w / 2, cy: n.posicion.y + f.h / 2 }; };

/** Mueve el nodo; con `frame`, al soltarlo recalcula su zona (dentro = pertenece, fuera = se desvincula). */
export function moverNodo(doc: Proyecto, id: string, pos: { x: number; y: number }, frame?: Frame): Res {
  const n = doc.nodos.find((x) => x.id === id);
  if (!n) return fail("El nodo ya no existe.");
  const mov = { ...n, posicion: pos };
  const zonaId = frame ? zonaEnPunto(doc, n.parentId, centroDe(mov, frame).cx, centroDe(mov, frame).cy) : n.zonaId ?? null;
  if (n.posicion.x === pos.x && n.posicion.y === pos.y && (n.zonaId ?? null) === zonaId) return fail("Sin cambios.");
  return { ok: true, doc: touch({ ...doc, nodos: doc.nodos.map((x) => (x.id === id ? { ...x, posicion: pos, zonaId, actualizadoEn: now() } : x)) }) };
}

/** Tamaño real de la tarjeta (lo aporta la vista del nodo; el dominio solo lo usa para medir huecos). */
export type CardSize = (nodoId: string) => { w: number; h: number };

/**
 * Hueco vertical mínimo entre las tarjetas de dos nodos conectados por puertos arriba/abajo. La flecha deja 30 u
 * de aire en la salida y 16 u en la entrada, así que el hueco = tramo visible ~100 u + 30 + 16 u de aire. Se mide entre bordes de
 * tarjeta, no de marco.
 */
export const SEPARACION_VERTICAL_MINIMA = 146;

interface Caja { x: number; y: number; w: number; h: number }
const cajaDe = (n: Nodo, pos: { x: number; y: number }, frame: Frame, card: CardSize): Caja => {
  const f = frame(n.id), s = card(n.id);
  return { x: pos.x + (f.w - s.w) / 2, y: pos.y + (f.h - s.h) / 2, w: s.w, h: s.h };
};
/** La flecha se dibuja como carril vertical solo si los puertos son opuestos arriba/abajo y el orden lo permite. */
const esApilada = (r: Relacion, a: Caja, b: Caja) =>
  (r.puertoInicio === "abajo" && r.puertoFin === "arriba" && b.y >= a.y) ||
  (r.puertoInicio === "arriba" && r.puertoFin === "abajo" && a.y >= b.y);

// ---------------- lados automáticos al crear una flecha ----------------
const NORMAL_PUERTO: Record<Puerto, { x: number; y: number }> = {
  izquierda: { x: -1, y: 0 }, derecha: { x: 1, y: 0 }, arriba: { x: 0, y: -1 }, abajo: { x: 0, y: 1 },
};

/** Punto del puerto sobre el borde de la tarjeta. */
function puntoDePuerto(c: Caja, p: Puerto): { x: number; y: number } {
  switch (p) {
    case "izquierda": return { x: c.x, y: c.y + c.h / 2 };
    case "derecha": return { x: c.x + c.w, y: c.y + c.h / 2 };
    case "arriba": return { x: c.x + c.w / 2, y: c.y };
    case "abajo": return { x: c.x + c.w / 2, y: c.y + c.h };
  }
}

/**
 * Par de lados más natural entre dos nodos al crear una flecha (se ignora el handle de origen). Evalúa los
 * cuatro pares opuestos (derecha→izquierda, izquierda→derecha, abajo→arriba, arriba→abajo) y elige el de menor
 * costo: distancia entre puertos + penalización si el lado mira en contra del otro nodo o si el destino queda
 * atrás. Desempata por el eje dominante y, por último, por el orden fijo de la lista (determinista).
 * Usa los tamaños reales de tarjeta (`frame`/`card`), así que funciona con las vistas completa/compacta/icono.
 */
export function puertosAutomaticos(
  doc: Proyecto, sourceId: string, targetId: string, frame: Frame, card: CardSize,
): { puertoInicio: Puerto; puertoFin: Puerto } {
  const porDefecto = { puertoInicio: "derecha" as Puerto, puertoFin: "izquierda" as Puerto };
  const s = doc.nodos.find((n) => n.id === sourceId);
  const t = doc.nodos.find((n) => n.id === targetId);
  if (!s || !t) return porDefecto;
  const cs = cajaDe(s, s.posicion, frame, card), ct = cajaDe(t, t.posicion, frame, card);
  const centroS = { x: cs.x + cs.w / 2, y: cs.y + cs.h / 2 };
  const centroT = { x: ct.x + ct.w / 2, y: ct.y + ct.h / 2 };
  const ejeDominante: "h" | "v" = Math.abs(centroT.x - centroS.x) >= Math.abs(centroT.y - centroS.y) ? "h" : "v";

  const PENAL_MIRA = 1e6;
  const PENAL_ATRAS = 1e5;
  const pares: { pi: Puerto; pf: Puerto; eje: "h" | "v"; orden: number; costo: number }[] = [];
  const candidatos: [Puerto, Puerto, "h" | "v"][] = [
    ["derecha", "izquierda", "h"], ["izquierda", "derecha", "h"],
    ["abajo", "arriba", "v"], ["arriba", "abajo", "v"],
  ];
  candidatos.forEach(([pi, pf, eje], orden) => {
    const a = puntoDePuerto(cs, pi), b = puntoDePuerto(ct, pf);
    const nA = NORMAL_PUERTO[pi], nB = NORMAL_PUERTO[pf];
    // El puerto mira en contra si su normal no apunta hacia el centro del otro nodo.
    const miraContra =
      nA.x * (centroT.x - a.x) + nA.y * (centroT.y - a.y) <= 0 ||
      nB.x * (centroS.x - b.x) + nB.y * (centroS.y - b.y) <= 0;
    const avance = eje === "h"
      ? (pi === "derecha" ? b.x - a.x : a.x - b.x)
      : (pi === "abajo" ? b.y - a.y : a.y - b.y);
    const costo = Math.hypot(b.x - a.x, b.y - a.y) + (miraContra ? PENAL_MIRA : 0) + (avance < 0 ? PENAL_ATRAS : 0);
    pares.push({ pi, pf, eje, orden, costo });
  });
  pares.sort((x, y) => {
    if (Math.abs(x.costo - y.costo) > 1e-6) return x.costo - y.costo;
    const ex = x.eje === ejeDominante ? 0 : 1, ey = y.eje === ejeDominante ? 0 : 1;
    return ex - ey || x.orden - y.orden;
  });
  return { puertoInicio: pares[0].pi, puertoFin: pares[0].pf };
}

/**
 * Acomoda la posición de un nodo para que ninguna flecha vertical que sale o entra de él quede sin tramo visible.
 * Solo mueve el nodo indicado (vertical), respetando su posición horizontal; la separación se resuelve en el orden
 * actual de las tarjetas (no salta al otro lado) y solo aplica a puertos opuestos arriba/abajo.
 */
export function posicionConSeparacionVertical(
  doc: Proyecto, id: string, pos: { x: number; y: number }, frame: Frame, card: CardSize, min = SEPARACION_VERTICAL_MINIMA,
): { x: number; y: number } {
  const n = doc.nodos.find((x) => x.id === id);
  if (!n) return pos;
  const f = frame(id), s = card(id);
  const propia = cajaDe(n, pos, frame, card);
  let lo = -Infinity, hi = Infinity;
  for (const r of doc.relaciones) {
    if (r.sourceId !== id && r.targetId !== id) continue;
    const otro = doc.nodos.find((x) => x.id === (r.sourceId === id ? r.targetId : r.sourceId));
    if (!otro || otro.parentId !== n.parentId) continue;
    const lejana = cajaDe(otro, otro.posicion, frame, card);
    const vertical = (r.puertoInicio === "abajo" && r.puertoFin === "arriba") || (r.puertoInicio === "arriba" && r.puertoFin === "abajo");
    if (!vertical) continue;
    // Se conserva el orden actual (no se salta de lado): si la tarjeta está por debajo, baja; si está encima, sube.
    const cPropia = propia.y + propia.h / 2, cLejana = lejana.y + lejana.h / 2;
    const destinoDebajo = r.puertoInicio === "abajo";
    const moverDebajo = cPropia === cLejana ? (r.sourceId === id ? !destinoDebajo : destinoDebajo) : cPropia > cLejana;
    if (moverDebajo) {
      lo = Math.max(lo, lejana.y + lejana.h + min - (f.h - s.h) / 2); // esta tarjeta queda debajo de la otra
    } else {
      hi = Math.min(hi, lejana.y - min - (f.h - s.h) / 2 - s.h); // esta tarjeta queda encima de la otra
    }
  }
  let y = pos.y;
  if (lo > hi) y = (lo + hi) / 2; // no cabe entre ambos vecinos: el punto medio evita el solape extremo
  else y = Math.min(Math.max(pos.y, lo), hi);
  return { x: pos.x, y: Math.round(y) };
}

/** Mueve el destino de una relación recién creada/cambiada si su hueco vertical con el origen es menor que el mínimo. */
export function separarDestino(doc: Proyecto, relId: string, frame: Frame, card: CardSize, min = SEPARACION_VERTICAL_MINIMA): { x: number; y: number } | null {
  const r = doc.relaciones.find((x) => x.id === relId);
  if (!r) return null;
  const s = doc.nodos.find((x) => x.id === r.sourceId), t = doc.nodos.find((x) => x.id === r.targetId);
  if (!s || !t) return null;
  const cs = cajaDe(s, s.posicion, frame, card), ct = cajaDe(t, t.posicion, frame, card);
  if (!esApilada(r, cs, ct)) return null;
  const haciaAbajo = r.puertoInicio === "abajo"; // abajo→arriba: el destino queda debajo
  const hueco = haciaAbajo ? ct.y - (cs.y + cs.h) : cs.y - (ct.y + ct.h);
  if (hueco >= min) return null;
  const delta = min - hueco;
  return { x: t.posicion.x, y: Math.round(t.posicion.y + (haciaAbajo ? delta : -delta)) };
}

/** Después de cambiar los puertos, separa el destino si la flecha pasó a ser un carril vertical sin tramo visible. */
export function acomodarRelacion(doc: Proyecto, relId: string, frame: Frame, card: CardSize): Proyecto {
  const r = doc.relaciones.find((x) => x.id === relId);
  if (!r) return doc;
  const pos = separarDestino(doc, relId, frame, card);
  if (!pos) return doc;
  const mov = moverNodo(doc, r.targetId, pos, frame);
  return mov.ok ? mov.doc : doc;
}

/** Crea la relación y, en el mismo paso, separa el destino si el carril vertical quedaría sin tramo visible. */
export function conectarAcomodado(doc: Proyecto, sourceId: string, targetId: string, puertoInicio: Puerto, puertoFin: Puerto, frame: Frame, card: CardSize): Res<{ id: string }> {
  const r = conectar(doc, sourceId, targetId, puertoInicio, puertoFin);
  if (!r.ok) return r;
  return { ok: true, id: r.id, doc: acomodarRelacion(r.doc, r.id, frame, card) };
}

export type NodoPatch = Partial<Pick<Nodo, "titulo" | "descripcion" | "estadoId" | "responsables" | "categoriaId" | "icono" | "vista" | "colorFondo" | "colorBorde">>;

export function actualizarNodo(doc: Proyecto, id: string, patch: NodoPatch): Res {
  if (!doc.nodos.some((n) => n.id === id)) return fail("El nodo ya no existe.");
  const p: NodoPatch = { ...patch };
  if (p.titulo !== undefined) {
    p.titulo = p.titulo.trim();
    if (!p.titulo) return fail("El título no puede estar vacío.");
  }
  if (p.categoriaId !== undefined && !doc.categorias.some((c) => c.id === p.categoriaId)) return fail("La categoría ya no existe.");
  if (p.estadoId !== undefined && !doc.estados.some((e) => e.id === p.estadoId)) return fail("El estado ya no existe.");
  for (const k of ["colorFondo", "colorBorde"] as const) {
    const v = p[k];
    if (typeof v === "string") { if (!HEX.test(v)) return fail("El color debe ser hexadecimal, por ejemplo #FFDD00."); p[k] = v.toUpperCase(); }
  }
  if (p.responsables) p.responsables = [...new Set(p.responsables.map((r) => r.trim()).filter(Boolean))];
  return { ok: true, doc: touch({ ...doc, nodos: doc.nodos.map((n) => (n.id === id ? { ...n, ...p, actualizadoEn: now() } : n)) }) };
}

/** Cambia el tipo. Si `eliminarHijos`, borra en cascada el contenido interno (para tipos que no contienen subflujo). */
export function cambiarTipoNodo(doc: Proyecto, id: string, tipo: string, eliminarHijos: boolean): Res {
  const n = doc.nodos.find((x) => x.id === id);
  if (!n) return fail("El nodo ya no existe.");
  let d = doc;
  if (eliminarHijos) d = quitarNodos(d, descendientesIds(d, id));
  return { ok: true, doc: touch({ ...d, nodos: d.nodos.map((x) => (x.id === id ? { ...x, tipo, actualizadoEn: now() } : x)) }) };
}

export function eliminarNodo(doc: Proyecto, id: string): Res {
  if (!doc.nodos.some((n) => n.id === id)) return fail("El nodo ya no existe.");
  const ids = descendientesIds(doc, id);
  ids.add(id);
  return { ok: true, doc: quitarNodos(doc, ids) };
}

export function duplicarNodo(doc: Proyecto, id: string, conHijos: boolean): Res<{ id: string }> {
  const orig = doc.nodos.find((n) => n.id === id);
  if (!orig) return fail("El nodo ya no existe.");
  const ids = new Set([id]);
  if (conHijos) descendientesIds(doc, id).forEach((x) => ids.add(x));
  const map = new Map<string, string>();
  ids.forEach((x) => map.set(x, uid("nd")));
  // zonas que viven dentro del contenido copiado se copian y sus nodos se reenlazan
  const zmap = new Map<string, string>();
  const zonasCopia: Zona[] = doc.zonas.filter((z) => z.scopeId !== null && ids.has(z.scopeId)).map((z) => { const nid = uid("zn"); zmap.set(z.id, nid); return { ...z, id: nid, scopeId: map.get(z.scopeId!)!, creadoEn: now(), actualizadoEn: now() }; });
  const nodos: Nodo[] = doc.nodos.filter((n) => ids.has(n.id)).map((n) => {
    const raiz = n.id === id;
    return {
      ...n, id: map.get(n.id)!, parentId: raiz ? n.parentId : map.get(n.parentId!)!,
      zonaId: raiz ? n.zonaId : n.zonaId ? zmap.get(n.zonaId) ?? null : null,
      titulo: raiz ? `${n.titulo} (copia)` : n.titulo,
      posicion: raiz ? { x: n.posicion.x + 48, y: n.posicion.y + 48 } : n.posicion,
      creadoEn: now(), actualizadoEn: now(),
    };
  });
  const relaciones: Relacion[] = doc.relaciones
    .filter((r) => r.scopeId !== null && ids.has(r.scopeId) && ids.has(r.sourceId) && ids.has(r.targetId))
    .map((r) => ({ ...r, id: uid("rel"), scopeId: map.get(r.scopeId!)!, sourceId: map.get(r.sourceId)!, targetId: map.get(r.targetId)!, creadoEn: now() }));
  const tareas: Tarea[] = doc.tareas.filter((t) => ids.has(t.nodoId)).map((t) => ({ ...t, id: uid("tsk"), nodoId: map.get(t.nodoId)!, creadoEn: now(), actualizadoEn: now() }));
  const documentos: Documento[] = doc.documentos.filter((d) => ids.has(d.nodoId)).map((d) => ({ ...d, id: uid("doc"), nodoId: map.get(d.nodoId)!, actualizadoEn: now() }));
  return {
    ok: true, id: map.get(id)!,
    doc: touch({ ...doc, zonas: [...doc.zonas, ...zonasCopia], nodos: [...doc.nodos, ...nodos], relaciones: [...doc.relaciones, ...relaciones], tareas: [...doc.tareas, ...tareas], documentos: [...doc.documentos, ...documentos] }),
  };
}

// ---------------- zonas ----------------
const COLORES_ZONA = ["#352FCC", "#008755", "#C04C36", "#5828A1", "#867035", "#4666FF"];
export const ALTO_CABECERA_ZONA = 56;

/** Recalcula la zona de todos los nodos del nivel según su posición actual. */
function reasignarNivel(doc: Proyecto, scopeId: string | null, frame: Frame): Proyecto {
  return { ...doc, nodos: doc.nodos.map((n) => { if (n.parentId !== scopeId) return n; const c = centroDe(n, frame); const z = zonaEnPunto(doc, scopeId, c.cx, c.cy); return (n.zonaId ?? null) === z ? n : { ...n, zonaId: z }; }) };
}

export function crearZona(doc: Proyecto, scopeId: string | null, pos: { x: number; y: number }, frame: Frame): Res<{ id: string }> {
  if (scopeId !== null && !doc.nodos.some((n) => n.id === scopeId)) return fail("El nivel donde ibas a crear la zona ya no existe.");
  const id = uid("zn");
  const color = COLORES_ZONA[doc.zonas.length % COLORES_ZONA.length];
  const z: Zona = { id, scopeId, titulo: "Nueva zona", subtitulo: "", colorFondo: color, colorBorde: color, opacidad: 0.18, posicion: pos, tamano: { ancho: 420, alto: 280 }, creadoEn: now(), actualizadoEn: now() };
  const d = { ...doc, zonas: [...doc.zonas, z] };
  return { ok: true, id, doc: touch(reasignarNivel(d, scopeId, frame)) };
}

export type ZonaPatch = Partial<Pick<Zona, "titulo" | "subtitulo" | "colorFondo" | "colorBorde" | "opacidad" | "icono" | "imagen" | "tamanoIcono">>;
export function actualizarZona(doc: Proyecto, id: string, patch: ZonaPatch): Res {
  if (!doc.zonas.some((z) => z.id === id)) return fail("La zona ya no existe.");
  const p: ZonaPatch = { ...patch };
  if (p.titulo !== undefined) { p.titulo = p.titulo.trim().slice(0, 80); if (!p.titulo) return fail("El título de la zona no puede estar vacío."); }
  if (p.subtitulo !== undefined) p.subtitulo = p.subtitulo.trim().slice(0, 120);
  for (const k of ["colorFondo", "colorBorde"] as const) { const v = p[k]; if (typeof v === "string") { if (!HEX.test(v)) return fail("El color debe ser hexadecimal, por ejemplo #FFDD00."); p[k] = v.toUpperCase(); } }
  if (p.opacidad !== undefined) p.opacidad = Math.min(1, Math.max(0, p.opacidad));
  if (p.icono !== undefined && !ICONO_RE.test(p.icono)) return fail("El icono no es válido.");
  if (p.tamanoIcono !== undefined) p.tamanoIcono = Math.min(72, Math.max(16, Math.round(p.tamanoIcono)));
  if (p.imagen !== undefined && !IMAGEN_RE.test(p.imagen)) return fail("La imagen no es válida.");
  return { ok: true, doc: touch({ ...doc, zonas: doc.zonas.map((z) => (z.id === id ? { ...z, ...p, actualizadoEn: now() } : z)) }) };
}

/** Mueve la zona y, como bloque, los nodos que le pertenecen (misma posición relativa). */
export function moverZona(doc: Proyecto, id: string, pos: { x: number; y: number }): Res {
  const z = doc.zonas.find((x) => x.id === id);
  if (!z) return fail("La zona ya no existe.");
  const dx = pos.x - z.posicion.x, dy = pos.y - z.posicion.y;
  if (!dx && !dy) return fail("Sin cambios.");
  return {
    ok: true,
    doc: touch({
      ...doc,
      zonas: doc.zonas.map((x) => (x.id === id ? { ...x, posicion: pos, actualizadoEn: now() } : x)),
      nodos: doc.nodos.map((n) => (n.zonaId === id ? { ...n, posicion: { x: n.posicion.x + dx, y: n.posicion.y + dy }, actualizadoEn: now() } : n)),
    }),
  };
}

/** Cambia posición y tamaño (mínimo ZONA_MIN) y recalcula qué nodos del nivel quedan dentro. */
export function redimensionarZona(doc: Proyecto, id: string, pos: { x: number; y: number }, tam: { ancho: number; alto: number }, frame: Frame): Res {
  const z = doc.zonas.find((x) => x.id === id);
  if (!z) return fail("La zona ya no existe.");
  const t = { ancho: Math.max(ZONA_MIN.ancho, Math.round(tam.ancho)), alto: Math.max(ZONA_MIN.alto, Math.round(tam.alto)) };
  if (z.posicion.x === pos.x && z.posicion.y === pos.y && z.tamano.ancho === t.ancho && z.tamano.alto === t.alto) return fail("Sin cambios.");
  const d = { ...doc, zonas: doc.zonas.map((x) => (x.id === id ? { ...x, posicion: pos, tamano: t, actualizadoEn: now() } : x)) };
  return { ok: true, doc: touch(reasignarNivel(d, z.scopeId, frame)) };
}

/** Los nodos no se borran: quedan sin zona. */
export function eliminarZona(doc: Proyecto, id: string): Res {
  if (!doc.zonas.some((z) => z.id === id)) return fail("La zona ya no existe.");
  return { ok: true, doc: touch({ ...doc, zonas: doc.zonas.filter((z) => z.id !== id), nodos: doc.nodos.map((n) => (n.zonaId === id ? { ...n, zonaId: null } : n)) }) };
}

export const nodosDeZona = (doc: Proyecto, id: string) => doc.nodos.filter((n) => n.zonaId === id).length;

/** Ajusta la zona a los nodos que contiene (con margen y espacio para la cabecera). */
export function ajustarZonaANodos(doc: Proyecto, id: string, frame: Frame): Res {
  const z = doc.zonas.find((x) => x.id === id);
  if (!z) return fail("La zona ya no existe.");
  const m = doc.nodos.filter((n) => n.zonaId === id);
  if (!m.length) return fail("La zona no contiene nodos.");
  const x0 = Math.min(...m.map((n) => n.posicion.x)) - 28, y0 = Math.min(...m.map((n) => n.posicion.y)) - ALTO_CABECERA_ZONA;
  const x1 = Math.max(...m.map((n) => n.posicion.x + frame(n.id).w)) + 28, y1 = Math.max(...m.map((n) => n.posicion.y + frame(n.id).h)) + 28;
  const t = { ancho: Math.max(ZONA_MIN.ancho, x1 - x0), alto: Math.max(ZONA_MIN.alto, y1 - y0) };
  return { ok: true, doc: touch({ ...doc, zonas: doc.zonas.map((x) => (x.id === id ? { ...x, posicion: { x: Math.round(x0), y: Math.round(y0) }, tamano: { ancho: Math.round(t.ancho), alto: Math.round(t.alto) }, actualizadoEn: now() } : x)) }) };
}

/** Asigna (o quita) la zona de un nodo desde el panel; si el nodo queda fuera de la zona, se coloca dentro. */
export function asignarZona(doc: Proyecto, nodoId: string, zonaId: string | null, frame: Frame): Res {
  const n = doc.nodos.find((x) => x.id === nodoId);
  if (!n) return fail("El nodo ya no existe.");
  if (zonaId === null) return { ok: true, doc: touch({ ...doc, nodos: doc.nodos.map((x) => (x.id === nodoId ? { ...x, zonaId: null, actualizadoEn: now() } : x)) }) };
  const z = doc.zonas.find((x) => x.id === zonaId);
  if (!z) return fail("La zona ya no existe.");
  if (z.scopeId !== n.parentId) return fail("La zona está en otro nivel.");
  const f = frame(nodoId);
  const lx = z.posicion.x + 16, rx = z.posicion.x + z.tamano.ancho - f.w - 16, ty = z.posicion.y + ALTO_CABECERA_ZONA, by = z.posicion.y + z.tamano.alto - f.h - 16;
  const pos = { x: Math.round(Math.max(lx, Math.min(n.posicion.x, rx))), y: Math.round(Math.max(ty, Math.min(n.posicion.y, by))) };
  return { ok: true, doc: touch({ ...doc, nodos: doc.nodos.map((x) => (x.id === nodoId ? { ...x, zonaId, posicion: pos, actualizadoEn: now() } : x)) }) };
}
// ---------------- relaciones ----------------
/** Se permiten varias flechas entre el mismo par de nodos (el canvas las separa con un desplazamiento paralelo). */
export function conectar(doc: Proyecto, sourceId: string, targetId: string, puertoInicio: Puerto = "derecha", puertoFin: Puerto = "izquierda"): Res<{ id: string }> {
  if (sourceId === targetId) return fail("Un nodo no se puede conectar consigo mismo.");
  const s = doc.nodos.find((n) => n.id === sourceId);
  const t = doc.nodos.find((n) => n.id === targetId);
  if (!s || !t) return fail("Alguno de los nodos ya no existe.");
  if (s.parentId !== t.parentId) return fail("Solo se pueden conectar nodos del mismo nivel.");
  const id = uid("rel");
  const rel: Relacion = { id, scopeId: s.parentId, sourceId, targetId, ...RELACION_DEFECTO, puertoInicio, puertoFin, creadoEn: now() };
  return { ok: true, id, doc: touch({ ...doc, relaciones: [...doc.relaciones, rel] }) };
}

export type RelacionPatch = Partial<RelacionConfig>;

export function actualizarRelacion(doc: Proyecto, id: string, patch: RelacionPatch): Res {
  const r = doc.relaciones.find((x) => x.id === id);
  if (!r) return fail("La flecha ya no existe.");
  const p: RelacionPatch = { ...patch };
  for (const k of ["color", "colorTextoFin"] as const) {
    const v = p[k];
    if (typeof v === "string") {
      if (!HEX.test(v)) return fail("El color debe ser hexadecimal, por ejemplo #FFDD00.");
      p[k] = v.toUpperCase();
    }
  }
  if (p.textoCentro !== undefined && p.textoCentro.length > LIMITES_TEXTO.centro) return fail(`El texto central admite hasta ${LIMITES_TEXTO.centro} caracteres.`);
  if (p.textoInicio !== undefined && p.textoInicio.length > LIMITES_TEXTO.inicio) return fail(`El texto de inicio admite hasta ${LIMITES_TEXTO.inicio} caracteres.`);
  if (p.textoFin !== undefined && p.textoFin.length > LIMITES_TEXTO.fin) return fail(`El texto de fin admite hasta ${LIMITES_TEXTO.fin} caracteres.`);
  return { ok: true, doc: touch({ ...doc, relaciones: doc.relaciones.map((x) => (x.id === id ? { ...x, ...p } : x)) }) };
}

/**
 * Invierte la dirección: intercambia origen y destino y conmuta los textos de inicio/fin (cada texto se queda junto
 * al mismo nodo). Las puntas no se mueven: la flecha cambia de sentido. El texto de inicio siempre usa el color de
 * la flecha, así que el color propio del texto final se descarta.
 */
export function invertirRelacion(doc: Proyecto, id: string): Res {
  const r = doc.relaciones.find((x) => x.id === id);
  if (!r) return fail("La flecha ya no existe.");
  const inv: Relacion = { ...r, sourceId: r.targetId, targetId: r.sourceId, textoInicio: r.textoFin, textoFin: r.textoInicio, colorTextoFin: null, puertoInicio: r.puertoFin, puertoFin: r.puertoInicio };
  return { ok: true, doc: touch({ ...doc, relaciones: doc.relaciones.map((x) => (x.id === id ? inv : x)) }) };
}

export function eliminarRelacion(doc: Proyecto, id: string): Res {
  if (!doc.relaciones.some((r) => r.id === id)) return fail("La flecha ya no existe.");
  return { ok: true, doc: touch({ ...doc, relaciones: doc.relaciones.filter((r) => r.id !== id) }) };
}
// ---------------- tareas ----------------
export type TareaPatch = Partial<Pick<Tarea, "titulo" | "descripcion" | "estado" | "prioridad" | "venceEn" | "responsables">>;

export function crearTarea(doc: Proyecto, nodoId: string, titulo: string, descripcion = ""): Res<{ id: string }> {
  const t = titulo.trim();
  if (!t) return fail("La tarea necesita un título.");
  if (descripcion.length > LIMITE_DESCRIPCION_TAREA) return fail(`La descripción admite hasta ${LIMITE_DESCRIPCION_TAREA} caracteres.`);
  if (!doc.nodos.some((n) => n.id === nodoId)) return fail("El nodo ya no existe.");
  const id = uid("tsk");
  const tarea: Tarea = {
    id, nodoId, titulo: t, descripcion, estado: "pendiente", prioridad: "media", responsables: [], venceEn: null,
    origen: "local", externo: null, creadoEn: now(), actualizadoEn: now(),
  };
  return { ok: true, id, doc: touch({ ...doc, tareas: [...doc.tareas, tarea] }) };
}

export function actualizarTarea(doc: Proyecto, id: string, patch: TareaPatch): Res {
  if (!doc.tareas.some((t) => t.id === id)) return fail("La tarea ya no existe.");
  const p = { ...patch };
  if (p.titulo !== undefined) {
    p.titulo = p.titulo.trim();
    if (!p.titulo) return fail("El título de la tarea no puede estar vacío.");
  }
  if (p.descripcion !== undefined && p.descripcion.length > LIMITE_DESCRIPCION_TAREA) return fail(`La descripción admite hasta ${LIMITE_DESCRIPCION_TAREA} caracteres.`);
  if (p.responsables) p.responsables = [...new Set(p.responsables.map((r) => r.trim()).filter(Boolean))];
  return { ok: true, doc: touch({ ...doc, tareas: doc.tareas.map((t) => (t.id === id ? { ...t, ...p, actualizadoEn: now() } : t)) }) };
}

export function eliminarTarea(doc: Proyecto, id: string): Res {
  if (!doc.tareas.some((t) => t.id === id)) return fail("La tarea ya no existe.");
  return { ok: true, doc: touch({ ...doc, tareas: doc.tareas.filter((t) => t.id !== id) }) };
}

export const siguienteEstadoTarea: Record<EstadoTarea, EstadoTarea> = { pendiente: "en-curso", "en-curso": "hecha", hecha: "bloqueada", bloqueada: "pendiente" };

// ---------------- documentos ----------------
export interface DocInput { tipo: Documento["tipo"]; titulo: string; url?: string; ruta?: string; contenido?: string }

export function validarDocumento(d: DocInput): string | null {
  if (!d.titulo.trim()) return "El documento necesita un título.";
  if (d.tipo === "url") {
    try {
      const u = new URL((d.url ?? "").trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return "La URL debe empezar por http:// o https://.";
    } catch {
      return "Escribe una URL válida, por ejemplo https://git.ejemplo.interno/repo.";
    }
  }
  if (d.tipo === "archivo" && !(d.ruta ?? "").trim()) return "Indica la ruta del archivo local.";
  return null;
}

function aDocumento(id: string, nodoId: string, d: DocInput): Documento {
  return {
    id, nodoId, tipo: d.tipo, titulo: d.titulo.trim(),
    url: d.tipo === "url" ? (d.url ?? "").trim() : null,
    ruta: d.tipo === "archivo" ? (d.ruta ?? "").trim() : null,
    contenido: d.tipo === "nota" ? d.contenido ?? "" : null,
    cache: null, actualizadoEn: now(),
  };
}

export function crearDocumento(doc: Proyecto, nodoId: string, d: DocInput): Res<{ id: string }> {
  const err = validarDocumento(d);
  if (err) return fail(err);
  if (!doc.nodos.some((n) => n.id === nodoId)) return fail("El nodo ya no existe.");
  const id = uid("doc");
  return { ok: true, id, doc: touch({ ...doc, documentos: [...doc.documentos, aDocumento(id, nodoId, d)] }) };
}

export function actualizarDocumento(doc: Proyecto, id: string, d: DocInput): Res {
  const prev = doc.documentos.find((x) => x.id === id);
  if (!prev) return fail("El documento ya no existe.");
  const err = validarDocumento(d);
  if (err) return fail(err);
  return { ok: true, doc: touch({ ...doc, documentos: doc.documentos.map((x) => (x.id === id ? aDocumento(id, prev.nodoId, d) : x)) }) };
}

export function eliminarDocumento(doc: Proyecto, id: string): Res {
  if (!doc.documentos.some((d) => d.id === id)) return fail("El documento ya no existe.");
  return { ok: true, doc: touch({ ...doc, documentos: doc.documentos.filter((d) => d.id !== id) }) };
}

// ---------------- proyecto: vista de nodos y categorías ----------------
export function establecerVistaProyecto(doc: Proyecto, vista: string): Res {
  if (doc.vistaNodo === vista) return fail("Sin cambios.");
  return { ok: true, doc: touch({ ...doc, vistaNodo: vista }) };
}

const normCat = (c: Partial<Categoria>) => ({ ...c, ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}), ...(c.color ? { color: c.color.toUpperCase() } : {}) });

export function crearCategoria(doc: Proyecto, nombre: string): Res<{ id: string }> {
  const n = nombre.trim();
  if (!n) return fail("La categoría necesita un nombre.");
  if (doc.categorias.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) return fail("Ya existe una categoría con ese nombre.");
  const id = uid("cat");
  const cat: Categoria = { id, nombre: n.slice(0, 40), color: "#4AA1FF", icono: "lucide:server" };
  return { ok: true, id, doc: touch({ ...doc, categorias: [...doc.categorias, cat] }) };
}

export function actualizarCategoria(doc: Proyecto, id: string, patch: Partial<Omit<Categoria, "id">>): Res {
  if (!doc.categorias.some((c) => c.id === id)) return fail("La categoría ya no existe.");
  const p = normCat(patch);
  if (p.nombre !== undefined) {
    if (!p.nombre) return fail("La categoría necesita un nombre.");
    if (doc.categorias.some((c) => c.id !== id && c.nombre.toLowerCase() === p.nombre!.toLowerCase())) return fail("Ya existe una categoría con ese nombre.");
  }
  if (p.color !== undefined && !HEX.test(p.color)) return fail("El color debe ser hexadecimal.");
  return { ok: true, doc: touch({ ...doc, categorias: doc.categorias.map((c) => (c.id === id ? { ...c, ...p } : c)) }) };
}

/** Nodos que usan la categoría. */
export const nodosConCategoria = (doc: Proyecto, id: string) => doc.nodos.filter((n) => n.categoriaId === id).length;

/** Elimina la categoría y reasigna sus nodos a `reasignarA` (obligatoria y distinta). */
export function eliminarCategoria(doc: Proyecto, id: string, reasignarA: string): Res {
  if (doc.categorias.length <= 1) return fail("Debe quedar al menos una categoría.");
  if (!doc.categorias.some((c) => c.id === id)) return fail("La categoría ya no existe.");
  if (reasignarA === id || !doc.categorias.some((c) => c.id === reasignarA)) return fail("Elige otra categoría a la que reasignar los nodos.");
  return {
    ok: true,
    doc: touch({ ...doc, categorias: doc.categorias.filter((c) => c.id !== id), nodos: doc.nodos.map((n) => (n.categoriaId === id ? { ...n, categoriaId: reasignarA, actualizadoEn: now() } : n)) }),
  };
}

// ---------------- proyecto: estados de nodo ----------------
export const estadosDe = (doc: Pick<Proyecto, "estados">): Estado[] =>
  [...doc.estados].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

export function crearEstado(doc: Proyecto, nombre: string): Res<{ id: string }> {
  const n = nombre.trim();
  if (!n) return fail("El estado necesita un nombre.");
  if (doc.estados.some((e) => e.nombre.toLowerCase() === n.toLowerCase())) return fail("Ya existe un estado con ese nombre.");
  const orden = doc.estados.length ? Math.max(...doc.estados.map((e) => e.orden)) + 1 : 0;
  const estado: Estado = { id: uid("est"), nombre: n.slice(0, 40), color: "#4AA1FF", orden };
  return { ok: true, id: estado.id, doc: touch({ ...doc, estados: [...doc.estados, estado] }) };
}

export type EstadoPatch = Partial<Pick<Estado, "nombre" | "color">>;

export function actualizarEstado(doc: Proyecto, id: string, patch: EstadoPatch): Res {
  if (!doc.estados.some((e) => e.id === id)) return fail("El estado ya no existe.");
  const p: EstadoPatch = { ...patch };
  if (p.nombre !== undefined) {
    p.nombre = p.nombre.trim().slice(0, 40);
    if (!p.nombre) return fail("El estado necesita un nombre.");
    if (doc.estados.some((e) => e.id !== id && e.nombre.toLowerCase() === p.nombre!.toLowerCase())) return fail("Ya existe un estado con ese nombre.");
  }
  if (p.color !== undefined) {
    if (!HEX.test(p.color)) return fail("El color debe ser hexadecimal, por ejemplo #FFDD00.");
    p.color = p.color.toUpperCase();
  }
  return { ok: true, doc: touch({ ...doc, estados: doc.estados.map((e) => (e.id === id ? { ...e, ...p } : e)) }) };
}

/** Mueve un estado una posición arriba (-1) o abajo (+1) y renumera el orden. */
export function moverEstado(doc: Proyecto, id: string, dir: -1 | 1): Res {
  const lista = estadosDe(doc);
  const i = lista.findIndex((e) => e.id === id);
  if (i < 0) return fail("El estado ya no existe.");
  const j = i + dir;
  if (j < 0 || j >= lista.length) return fail("Sin cambios.");
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ok: true, doc: touch({ ...doc, estados: lista.map((e, k) => ({ ...e, orden: k })) }) };
}

/** Nodos que usan el estado. */
export const nodosConEstado = (doc: Proyecto, id: string) => doc.nodos.filter((n) => n.estadoId === id).length;

/** Elimina el estado y reasigna sus nodos a `reasignarA` (obligatorio y distinto). */
export function eliminarEstado(doc: Proyecto, id: string, reasignarA: string): Res {
  if (doc.estados.length <= 1) return fail("Debe quedar al menos un estado.");
  if (!doc.estados.some((e) => e.id === id)) return fail("El estado ya no existe.");
  if (reasignarA === id || !doc.estados.some((e) => e.id === reasignarA)) return fail("Elige otro estado al que reasignar los nodos.");
  return {
    ok: true,
    doc: touch({ ...doc, estados: doc.estados.filter((e) => e.id !== id), nodos: doc.nodos.map((n) => (n.estadoId === id ? { ...n, estadoId: reasignarA, actualizadoEn: now() } : n)) }),
  };
}