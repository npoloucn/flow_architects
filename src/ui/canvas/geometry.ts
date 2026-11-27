import type { Edge, Node } from "@xyflow/react";
import type { Proyecto, Relacion } from "../../domain/schema";
import { hijos, relacionesDeNivel } from "../../domain/selectors";
import { getNodeType } from "../../nodeTypes/registry";
import { vistaDe } from "../../nodeViews/registry";
import { SALIENTE_VERTICAL } from "./edgeVisual";

const HANDLE: Record<string, string> = { izquierda: "l", derecha: "r", arriba: "t", abajo: "b" };
export const PUERTO_DE_HANDLE: Record<string, "izquierda" | "derecha" | "arriba" | "abajo"> = { l: "izquierda", r: "derecha", t: "arriba", b: "abajo" };

export interface Rect { x: number; y: number; width: number; height: number }
export interface Vp { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;


export function nodeRect(doc: Proyecto, id: string): Rect {
  const n = doc.nodos.find((x) => x.id === id)!;
  const s = getNodeType(n.tipo).size;
  return { x: n.posicion.x, y: n.posicion.y, width: s.w, height: s.h };
}

/** Tamaño real de la tarjeta según su vista (el marco de colocación sigue siendo `nodeRect`). */
export function nodeSize(doc: Proyecto, id: string): { w: number; h: number } {
  const n = doc.nodos.find((x) => x.id === id)!;
  return vistaDe(doc, n).size(getNodeType(n.tipo));
}

export function levelBounds(doc: Proyecto, level: string | null): Rect {
  const ns = hijos(doc, level);
  const zs = doc.zonas.filter((z) => z.scopeId === level);
  if (!ns.length && !zs.length) return { x: -140, y: -80, width: 280, height: 160 };
  const rs = [...ns.map((n) => nodeRect(doc, n.id)), ...zs.map((z) => ({ x: z.posicion.x, y: z.posicion.y, width: z.tamano.ancho, height: z.tamano.alto }))];
  const x1 = Math.min(...rs.map((r) => r.x));
  const y1 = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.width));
  const y2 = Math.max(...rs.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Viewport que encuadra `r` dentro de w×h con margen proporcional. */
/** Banda inferior (px) que el encuadre deja libre para que el mini-mapa (esquina inferior derecha) no tape nodos. */
export const MINIMAP_RESERVA = 150;

export function fitVp(r: Rect, w: number, h0: number, pad = 0.07, maxZoom = 1.15, reserva = 0): Vp {
  const h = h0 - reserva;
  const zoom = Math.max(MIN_ZOOM, Math.min(maxZoom, (w * (1 - 2 * pad)) / r.width, (h * (1 - 2 * pad)) / r.height));
  return { zoom, x: w / 2 - (r.x + r.width / 2) * zoom, y: h / 2 - (r.y + r.height / 2) * zoom };
}

export type FlowNode = Node<{ nodoId: string; ghost?: boolean }, "flow">;

export function projectNodes(doc: Proyecto, level: string | null, ghost = false): FlowNode[] {
  return hijos(doc, level).map((n) => ({
    id: n.id,
    type: "flow",
    position: n.posicion,
    data: { nodoId: n.id, ghost },
    deletable: false,
  }));
}

export const SEP_PARALELO = 48;
/** Separación mínima entre carriles paralelos verticales. */
const SEP_VERTICAL_MIN = 12;
const extraAbajo = (doc: Proyecto, id: string, puerto: string) => {
  if (puerto !== "abajo") return 0;
  const n = doc.nodos.find((x) => x.id === id)!;
  return vistaDe(doc, n).etiquetaAbajo ?? 0;
};
/**
 * Saliente (canvas) del puerto inferior del subflujo: React Flow ancla el puerto «abajo» en el borde inferior de la
 * caja del handle (−20 px + medio handle), no en su centro; 24,5 lo devuelve al borde de la tarjeta.
 */
const SALIENTE_SUBFLUJO_ABAJO = 24.5;
export const salienteVertical = (doc: Proyecto, id: string, puerto: string) => {
  const n = doc.nodos.find((x) => x.id === id);
  return n && puerto === "abajo" && getNodeType(n.tipo).id === "subflujo" ? SALIENTE_SUBFLUJO_ABAJO : SALIENTE_VERTICAL;
};

/** Reparto de ranuras: 0 (recta), +1, -1, +2, -2… La primera flecha de un par nunca se mueve al añadir otras. */
const nivel = (slot: number) => (slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2));
/** Par de puertos verticales (arriba/abajo en ambos extremos). */
const esVertical = (r: Pick<Relacion, "puertoInicio" | "puertoFin">) =>
  (r.puertoInicio === "arriba" || r.puertoInicio === "abajo") &&
  (r.puertoFin === "arriba" || r.puertoFin === "abajo");

export interface PosicionEnPar { slot: number; total: number; off: number }

/**
 * Desplazamiento perpendicular (en unidades del canvas) de cada flecha cuando hay varias entre el mismo par de nodos,
 * en cualquier sentido. El orden es el de creación (fecha e id), así que una flecha nueva no mueve a las anteriores;
 * solo al borrar una flecha vecina las posteriores ocupan su ranura. Las verticales se reparten por el ancho de la
 * tarjeta para que todas las puntas sigan entrando por su borde.
 */
export function posicionesEnPar(doc: Proyecto, rels: Relacion[] = doc.relaciones): Map<string, PosicionEnPar> {
  const grupos = new Map<string, Relacion[]>();
  for (const r of doc.relaciones) {
    const k = [r.sourceId, r.targetId].sort().join("|");
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  const out = new Map<string, PosicionEnPar>();
  const quiere = new Set(rels.map((r) => r.id));
  for (const g of grupos.values()) {
    if (!g.some((r) => quiere.has(r.id))) continue;
    g.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn) || a.id.localeCompare(b.id));
    const a = nodeSize(doc, g[0].sourceId), c = nodeSize(doc, g[0].targetId);
    const asigna = (lista: Relacion[], mitad: number, minSep: number) => {
      const maxNivel = Math.ceil((lista.length - 1) / 2);
      const sep = maxNivel === 0 ? 0 : Math.min(SEP_PARALELO, Math.max(minSep, mitad / maxNivel));
      lista.forEach((r, i) => out.set(r.id, { slot: i, total: lista.length, off: nivel(i) * sep }));
    };
    asigna(g.filter((r) => !esVertical(r)), Math.min(a.w, a.h, c.w, c.h) / 2 - 12, 14);
    asigna(g.filter(esVertical), Math.min(a.w, c.w) / 2 - 10, SEP_VERTICAL_MIN);
  }
  return out;
}

/**
 * Proyecta las relaciones del nivel a aristas. Las flechas apiladas (arriba/abajo) van centradas en las tarjetas;
 * si hay varias en el mismo par se reparten simétricamente alrededor del eje, con una separación mínima.
 */
export function projectEdges(doc: Proyecto, level: string | null, selectedEdgeId: string | null = null): Edge[] {
  const rels = relacionesDeNivel(doc, level);
  const pos = posicionesEnPar(doc, rels);
  const par = (x: Relacion) => [x.sourceId, x.targetId].sort().join("|");
  // Centro del paquete: media de los desplazamientos de las flechas verticales del mismo par.
  const centroVertical = new Map<string, number>();
  {
    const grupos = new Map<string, Relacion[]>();
    for (const r of rels) if (esVertical(r)) grupos.set(par(r), [...(grupos.get(par(r)) ?? []), r]);
    for (const [k, g] of grupos) centroVertical.set(k, g.reduce((s, r) => s + (pos.get(r.id)?.off ?? 0), 0) / g.length);
  }
  /** Carril de una flecha vertical: su ranura respecto al eje central (0 = centrada). */
  const laneDe = (r: Relacion): number | undefined => {
    if (!esVertical(r)) return undefined;
    return (pos.get(r.id)?.off ?? 0) - (centroVertical.get(par(r)) ?? 0);
  };
  return rels.map((r) => {
    return {
      id: r.id,
      selected: r.id === selectedEdgeId,
      source: r.sourceId,
      target: r.targetId,
      sourceHandle: HANDLE[r.puertoInicio],
      targetHandle: HANDLE[r.puertoFin],
      type: "typed",
      data: {
        rel: r,
        off: pos.get(r.id)?.off ?? 0,
        extraS: extraAbajo(doc, r.sourceId, r.puertoInicio),
        extraT: extraAbajo(doc, r.targetId, r.puertoFin),
        lane: laneDe(r),
        salienteS: salienteVertical(doc, r.sourceId, r.puertoInicio),
        salienteT: salienteVertical(doc, r.targetId, r.puertoFin),
        // Tamaño real de cada tarjeta: el motor de rutas rodea las tarjetas en los desvíos.
        tamS: nodeSize(doc, r.sourceId),
        tamT: nodeSize(doc, r.targetId),
      },
    } satisfies Edge;
  });
}

