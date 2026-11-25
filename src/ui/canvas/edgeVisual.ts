import type { EstiloLinea, Relacion } from "../../domain/schema";
import { MIN_CONTRASTE, ajustarContraste, contraste, luminancia, mezclar } from "../color";

/** Aspecto de una flecha derivado de su configuración y del tema. Compartido por el canvas y la vista previa del panel. */
export const DASH: Record<EstiloLinea, string | undefined> = { continua: undefined, punteada: "1 7", discontinua: "9 6" };
export const ANCHO: Record<EstiloLinea, number> = { continua: 2.4, punteada: 3.4, discontinua: 2.4 };
export const LARGO_PUNTA = 13;
/** Grosor extra del contorno (solo con contraste bajo): 1 px por lado. */
export const GROSOR_CONTORNO = 2;
/** Separación de las etiquetas de extremo respecto a la línea (deja libre el texto central). */
export const SEP_TAG = 16;

export interface Tema { bg: string; text: string; surface: string }

/** Contorno bajo la línea: del color del fondo (separa cruces); si el color casi no se ve, un neutro que contrasta. */
export function contorno(color: string, t: Tema): { halo: string; bajo: boolean } {
  const bajo = contraste(color, t.bg) < MIN_CONTRASTE;
  if (!bajo) return { halo: "none", bajo };
  return { halo: mezclar(luminancia(t.bg) > 0.5 ? "#2C2A29" : "#FEFFFF", t.bg, 0.15), bajo };
}

/** Contraste mínimo del texto de las etiquetas sobre el fondo del canvas (texto pequeño). */
export const MIN_CONTRASTE_TEXTO = 4.5;
/** Color del texto de una etiqueta: el de la flecha, aclarado u oscurecido (mismo matiz) solo si no alcanza el mínimo. */
export function colorEtiqueta(textoColor: string, t: Tema): string {
  return contraste(textoColor, t.bg) >= MIN_CONTRASTE_TEXTO ? textoColor : ajustarContraste(textoColor, t.bg, MIN_CONTRASTE_TEXTO);
}

/** REGLA FIJA: el texto de inicio siempre es del color de la flecha. No existe ningún campo para cambiarlo. */
export const colorTextoInicio = (r: Pick<Relacion, "color">) => r.color;
/** El texto de fin sigue el color de la flecha salvo que tenga uno propio. */
export const colorTextoFin = (r: Pick<Relacion, "color" | "colorTextoFin">) => r.colorTextoFin ?? r.color;

// ---------------- geometría por lado ----------------
/** Lado del nodo (valores de `Position` de React Flow). */
export type Lado = "left" | "right" | "top" | "bottom";
const SALE: Record<Lado, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
export const horizontal = (l: Lado) => l === "left" || l === "right";

/** Triángulo con la punta en (x,y) apuntando en la dirección unitaria (dx,dy). */
export const puntaVec = (x: number, y: number, dx: number, dy: number) => {
  const bx = x - dx * LARGO_PUNTA, by = y - dy * LARGO_PUNTA, px = -dy * 6.5, py = dx * 6.5;
  return `M${x} ${y}L${bx + px} ${by + py}L${bx - px} ${by - py}Z`;
};
/** Punta en un puerto: apunta hacia dentro del nodo (para el inicio y para el fin). */
export const puntaEn = (x: number, y: number, lado: Lado) => puntaVec(x, y, -SALE[lado][0], -SALE[lado][1]);
/** Compat. horizontal: punta en (x,y) apuntando hacia `dir` (+1 derecha, -1 izquierda). */
export const punta = (x: number, y: number, dir: 1 | -1) => puntaVec(x, y, dir, 0);

// ---------------- recorrido vertical (recta centrada en la tarjeta) ----------------
/**
 * Distancia (canvas) entre el punto de conexión que entrega React Flow y el borde de la tarjeta: los puertos
 * sobresalen del borde, así que la recta se recorta hasta el borde para medir el aire.
 */
export const SALIENTE_VERTICAL = 11;
/** Aire entre el borde de la tarjeta y el inicio/fin del tramo vertical: la punta queda apuntando al nodo/rótulo. */
export const AIRE_VERTICAL = 16;
/** Aire del extremo de salida (puerto abajo o arriba del origen): mayor que el de entrada para que la flecha arranque despegada. */
export const AIRE_SALIDA = 30;

/**
 * Flechas entre puertos verticales: una sola recta sobre el eje central de las tarjetas, sin desplazamiento
 * lateral. El tramo se acorta en cada extremo para no tocar las tarjetas.
 */
export interface RutaVertical {
  d: string;
  /** Punto medio del tramo, para el texto central. */
  centro: { x: number; y: number };
}

export function rutaVertical(sx: number, sy: number, tx: number, ty: number): RutaVertical {
  return {
    d: `M ${sx} ${sy} L ${tx} ${ty}`,
    centro: { x: (sx + tx) / 2, y: (sy + ty) / 2 },
  };
}

// ---------------- disposición de textos (flechas cortas y verticales) ----------------
const FONT_TAG = '700 11px "CIBFont Sans","Segoe UI",sans-serif';
const FONT_CENTRO = '400 11.5px "CIBFont Sans","Segoe UI",sans-serif';
export const ALTO_TAG = 17;
export const ALTO_CENTRO = 20;
const MIN_TAG = 34;
const MAX_VERTICAL = 150;
let ctx: CanvasRenderingContext2D | null = null;
const medir = (t: string, font: string) => {
  ctx ??= document.createElement("canvas").getContext("2d")!;
  ctx.font = font;
  return ctx.measureText(t).width * 1.04;
};
export const anchoTag = (t: string) => medir(t, FONT_TAG) + 12;
export const anchoCentro = (t: string) => medir(t, FONT_CENTRO) + 22;

function recortar(t: string, max: number): string {
  if (anchoTag(t) <= max) return t;
  let s = t;
  while (s.length > 1 && anchoTag(s + "…") > max) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

interface R { x0: number; x1: number; y0: number; y1: number }
const choca = (a: R, b: R, m = 3) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.y0 < b.y1 + m && a.y1 > b.y0 - m;

/** Anclaje de la etiqueta de un extremo: punto y desplazamientos porcentuales (0 | -1) del propio elemento. */
export interface Ancla { ax: number; ay: number; tx: 0 | -1; ty: 0 | -1 }
/**
 * Etiqueta de extremo. Puerto horizontal: junto a la línea, encima (`lado` -1) o debajo (+1).
 * Puerto vertical: al costado de la línea, a la izquierda (-1) o a la derecha (+1), pegada al nodo.
 */
export function ancla(x: number, y: number, puerto: Lado, punta: number, lado: 1 | -1): Ancla {
  const [dx, dy] = SALE[puerto];
  const off = 8 + punta;
  if (dx !== 0) return { ax: x + dx * off, ay: y + lado * SEP_TAG, tx: dx > 0 ? 0 : -1, ty: lado < 0 ? -1 : 0 };
  return { ax: x + lado * 10, ay: y + dy * off, tx: lado < 0 ? -1 : 0, ty: dy > 0 ? 0 : -1 };
}
const rectDe = (a: Ancla, w: number, h: number): R => {
  const x0 = a.ax + a.tx * w, y0 = a.ay + a.ty * h;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
};

/** Etiqueta al costado izquierdo del tramo vertical, pegada a la línea. */
export const anclaCarril = (x: number, y: number): Ancla => ({ ax: x - 8, ay: y, tx: -1, ty: 0 });

export interface Geom {
  sx: number; sy: number; tx: number; ty: number; lx: number; ly: number;
  ladoS: Lado; ladoT: Lado; ladoI: 1 | -1; ladoF: 1 | -1;
  /** Espacio extra junto al nodo (título externo de la vista icono) antes de colocar la etiqueta. */
  extraS?: number; extraT?: number;
}
export interface Disposicion {
  inicio: string; fin: string; centro: boolean;
  /** Textos que no caben en la flecha y se ocultan o recortan en el canvas (el panel lo avisa). */
  ocultos: string[];
}

/**
 * Reparte los tres textos sin que dos se pisen ni invadan los nodos. Prioridad: extremos > centro.
 * 1) cada texto de extremo se recorta con «…» al espacio disponible; si no cabe ni 3 letras, se oculta;
 * 2) si los dos extremos se tocan, se recorta a la mitad cada uno (y si aun así chocan, se oculta el de fin);
 * 3) el texto central se oculta si no cabe o si tocaría un texto de extremo.
 */
export function disponerTextos(rel: Pick<Relacion, "puntaInicio" | "puntaFin" | "textoCentro" | "textoInicio" | "textoFin">, g: Geom): Disposicion {
  const hS = rel.puntaInicio ? LARGO_PUNTA : 0;
  const hE = rel.puntaFin ? LARGO_PUNTA : 0;
  const hh = horizontal(g.ladoS) && horizontal(g.ladoT);
  const span = hh ? Math.abs(g.tx - g.sx) : Math.hypot(g.tx - g.sx, g.ty - g.sy);
  const ocultos: string[] = [];
  let ti = rel.textoInicio, tf = rel.textoFin;

  const ajusta = (t: string, avail: number, nombre: string) => {
    if (!t) return "";
    if (avail < MIN_TAG) { ocultos.push(nombre); return ""; }
    const r = recortar(t, avail);
    if (r !== t) ocultos.push(`${nombre} (recortado)`);
    return r;
  };
  const dispI = () => (horizontal(g.ladoS) ? span - (8 + hS) - 8 : MAX_VERTICAL);
  const dispF = () => (horizontal(g.ladoT) ? span - (8 + hE) - 8 : MAX_VERTICAL);
  ti = ajusta(ti, dispI(), "texto de inicio");
  tf = ajusta(tf, dispF(), "texto de fin");

  const aI = ancla(g.sx, g.sy, g.ladoS, hS + (g.extraS ?? 0), g.ladoI), aF = ancla(g.tx, g.ty, g.ladoT, hE + (g.extraT ?? 0), g.ladoF);
  const rectI = (t: string) => rectDe(aI, anchoTag(t), ALTO_TAG);
  const rectF = (t: string) => rectDe(aF, anchoTag(t), ALTO_TAG);

  if (ti && tf && choca(rectI(ti), rectF(tf))) {
    const mitad = hh ? (span - (8 + hS) - (8 + hE) - 6) / 2 : MAX_VERTICAL / 2;
    ti = ajusta(rel.textoInicio, mitad, "texto de inicio");
    tf = ajusta(rel.textoFin, mitad, "texto de fin");
    if (ti && tf && choca(rectI(ti), rectF(tf))) { ocultos.push("texto de fin"); tf = ""; }
  }

  let centro = !!rel.textoCentro;
  if (centro) {
    const w = anchoCentro(rel.textoCentro);
    const c: R = { x0: g.lx - w / 2, x1: g.lx + w / 2, y0: g.ly - ALTO_CENTRO / 2, y1: g.ly + ALTO_CENTRO / 2 };
    const cabe = !hh || w <= span - 2 * Math.max(hS, hE) - 12;
    if (!cabe || (ti && choca(c, rectI(ti), 1)) || (tf && choca(c, rectF(tf), 1))) { centro = false; ocultos.push("texto central"); }
  }
  return { inicio: ti, fin: tf, centro, ocultos };
}

// ---------------- textos de flechas verticales (al costado del tramo) ----------------
const PAD_PUNTA = 4;      // aire entre la punta y el borde de su etiqueta
const SEP_BANDA = 3;      // aire entre la franja del rótulo externo y la etiqueta
const BANDA_ROTULO = 40;  // alto reservado por el rótulo externo (dos líneas)
const MEDIO_ROTULO = 82;  // medio ancho reservado por el rótulo externo centrado

export interface GeomVertical {
  /** Extremos del tramo, ya con el aire respecto al borde de la tarjeta. */
  sx: number; sy: number; tx: number; ty: number;
  /** Borde de la tarjeta en cada extremo (para reservar el rótulo externo). */
  bordeS: number; bordeT: number;
  ladoS: Lado; ladoT: Lado;
  /** Alto del rótulo externo de la vista icono (solo si el puerto es «abajo»). */
  extraS?: number; extraT?: number;
  puntaInicio?: boolean; puntaFin?: boolean;
}
export interface DispVertical extends Disposicion {
  aI: Ancla | null; aF: Ancla | null; aC: Ancla | null;
}

/**
 * Reparte los textos de una flecha vertical al costado izquierdo del tramo, pegados a la línea y sin pisar el
 * rótulo externo de la vista icono. Prioridad: extremos > centro; si no caben, se oculta la central primero.
 */
export function disponerVertical(
  rel: Pick<Relacion, "puntaInicio" | "puntaFin" | "textoCentro" | "textoInicio" | "textoFin">,
  g: GeomVertical,
): DispVertical {
  const ocultos: string[] = [];
  const dir: 1 | -1 = g.ty >= g.sy ? 1 : -1;
  const xEn = (y: number) => (g.ty === g.sy ? g.sx : g.sx + (g.tx - g.sx) * (y - g.sy) / (g.ty - g.sy));
  const anclaEn = (y: number) => anclaCarril(xEn(y), y);

  // El rótulo externo de la vista icono cuelga bajo el borde de la tarjeta: reserva su franja.
  const banda = (cx: number, bordeY: number, extra: number, lado: Lado): R | null =>
    extra > 0 && lado === "bottom"
      ? { x0: cx - MEDIO_ROTULO, x1: cx + MEDIO_ROTULO, y0: bordeY + 8, y1: bordeY + 8 + BANDA_ROTULO }
      : null;
  const bandaS = banda(g.sx, g.bordeS, g.extraS ?? 0, g.ladoS);
  const bandaT = banda(g.tx, g.bordeT, g.extraT ?? 0, g.ladoT);
  const bandas = [bandaS, bandaT].filter(Boolean) as R[];

  const hS = g.puntaInicio ? LARGO_PUNTA : 0;
  const hE = g.puntaFin ? LARGO_PUNTA : 0;
  const limInf = Math.min(g.sy, g.ty), limSup = Math.max(g.sy, g.ty);
  const dentro = (y: number) => y >= limInf + 1 && y + ALTO_TAG <= limSup - 1;
  const libre = (a: Ancla, w: number) => !bandas.some((b) => choca(rectDe(a, w, ALTO_TAG), b, 1));

  const coloca = (t: string, y: number, nombre: string) => {
    if (!t) return null;
    const a = anclaEn(y);
    if (!dentro(y) || !libre(a, anchoTag(t))) { ocultos.push(nombre); return null; }
    return { t, a, r: rectDe(a, anchoTag(t), ALTO_TAG) };
  };

  // Cada etiqueta nace junto a su extremo y se aparta de la franja del rótulo que tenga al lado.
  let yIni = dir > 0 ? g.sy + hS + PAD_PUNTA : g.sy - hS - PAD_PUNTA - ALTO_TAG;
  let yFin = dir > 0 ? g.ty - hE - PAD_PUNTA - ALTO_TAG : g.ty + hE + PAD_PUNTA;
  if (bandaS) yIni = dir > 0 ? Math.max(yIni, bandaS.y1 + SEP_BANDA) : Math.min(yIni, bandaS.y0 - SEP_BANDA - ALTO_TAG);
  if (bandaT) yFin = dir > 0 ? Math.min(yFin, bandaT.y0 - SEP_BANDA - ALTO_TAG) : Math.max(yFin, bandaT.y1 + SEP_BANDA);

  const ini = coloca(rel.textoInicio, yIni, "texto de inicio");
  let fin = coloca(rel.textoFin, yFin, "texto de fin");
  if (ini && fin && choca(ini.r, fin.r, 0)) { ocultos.push("texto de fin"); fin = null; }

  let centro = !!rel.textoCentro;
  let aC: Ancla | null = null;
  if (centro) {
    const mid = (limInf + limSup) / 2;
    const a = anclaEn(mid - ALTO_CENTRO / 2);
    const r = rectDe(a, anchoCentro(rel.textoCentro), ALTO_CENTRO);
    const pisa = (x: { r: R } | null) => !!x && choca(r, x.r, 1);
    if (limSup - limInf < 2 * ALTO_TAG + 8 || bandas.some((b) => choca(r, b, 1)) || pisa(ini) || pisa(fin)) {
      centro = false;
      ocultos.push("texto central");
    } else aC = a;
  }
  return { inicio: ini?.t ?? "", fin: fin?.t ?? "", centro, ocultos, aI: ini?.a ?? null, aF: fin?.a ?? null, aC };
}
