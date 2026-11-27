/**
 * MOTOR DE RUTAS DE FLECHAS (híbrido, puro y testeable)
 *
 * Decide y dibuja el trazado entre dos puertos del canvas a partir de su posición y del lado del nodo
 * por el que salen/entran. No conoce React Flow, el documento ni el DOM: todas las entradas son puntos.
 *
 * Reglas (en orden):
 *  a) puertos opuestos, alineados en el eje perpendicular (dentro de la tolerancia) → recta;
 *  b) puertos opuestos con desfase perpendicular → curva en S (cúbica con controles sobre las normales);
 *  c) puertos perpendiculares (p. ej. derecha→arriba) → ortogonal con esquinas redondeadas;
 *  d) puertos que miran en contra del otro nodo o salen por el mismo lado (override manual) → ortogonal
 *     con desvío: sale por su lado, rodea y entra por su lado (nunca un lazo Bézier).
 *
 * Las tangentes devueltas son las derivadas reales del trazado en t=0 y t=1 (curvas) o la dirección del
 * primer/último tramo (rectas y ortogonales), de modo que las puntas siempre quedan alineadas a la línea.
 */
import type { Lado } from "./edgeVisual";

export interface Punto {
  x: number;
  y: number;
}

/** Puerto de salida/entrada: punto ya desplazado por `off`/`lane` y lado del nodo. */
export interface PuertoRuta extends Punto {
  lado: Lado;
}

/** Rectángulo de un nodo (opcional) para que el desvío rodee las tarjetas y no las atraviese. */
export interface RectNodo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpcionesRuta {
  /** Tolerancia (unidades del canvas) para considerar los puertos alineados en el eje perpendicular. */
  tolerancia?: number;
  /** Radio de las esquinas del trazado ortogonal (se recorta a la mitad de cada tramo). */
  radio?: number;
  /** Rectángulos de los nodos, si se conocen, para calcular por dónde rodear en el caso (d). */
  rectOrigen?: RectNodo;
  rectDestino?: RectNodo;
}

export type TipoRuta = "recta" | "curva" | "ortogonal";

export interface Ruta {
  /** Atributo `d` listo para un <path>. */
  path: string;
  tipo: TipoRuta;
  /** Punto medio del recorrido (por longitud de arco) para colocar el texto central. */
  centro: Punto;
  /** Dirección de avance en el origen. */
  tangenteInicio: Punto;
  /** Dirección de avance en el destino (apunta hacia el nodo destino). */
  tangenteFin: Punto;
}

const TOLERANCIA = 1.5;
const RADIO = 16;
const MARGEN_DESVIO = 28;

const NORMAL: Record<Lado, Punto> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

const esHorizontal = (l: Lado) => l === "left" || l === "right";
const restar = (a: Punto, b: Punto): Punto => ({ x: a.x - b.x, y: a.y - b.y });
const sumar = (a: Punto, n: Punto, d: number): Punto => ({ x: a.x + n.x * d, y: a.y + n.y * d });
const longitud = (v: Punto) => Math.hypot(v.x, v.y);
const normalizar = (v: Punto): Punto => {
  const l = longitud(v);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};
const red = (v: number) => Math.round(v * 100) / 100;
const punto = (x: number, y: number): Punto => ({ x, y });

/** Recta explícita entre dos puntos (la usan las flechas verticales apiladas para no curvarse). */
export function rutaRecta(a: Punto, b: Punto): Ruta {
  const dir = normalizar(restar(b, a));
  return {
    path: `M ${red(a.x)} ${red(a.y)} L ${red(b.x)} ${red(b.y)}`,
    tipo: "recta",
    centro: punto((a.x + b.x) / 2, (a.y + b.y) / 2),
    tangenteInicio: dir,
    tangenteFin: dir,
  };
}

/** Traza la ruta entre dos puertos según las reglas del motor híbrido. */
export function calcularRuta(s: PuertoRuta, t: PuertoRuta, op: OpcionesRuta = {}): Ruta {
  if (longitud(restar(t, s)) < 0.5) return rutaRecta(s, t);
  const tol = op.tolerancia ?? TOLERANCIA;
  const nS = NORMAL[s.lado];
  const nT = NORMAL[t.lado];

  const opuestos = esHorizontal(s.lado) === esHorizontal(t.lado) && s.lado !== t.lado;
  const perpendiculares = esHorizontal(s.lado) !== esHorizontal(t.lado);
  const haciaS = restar(t, s);
  const haciaT = restar(s, t);
  // El puerto "mira" al otro nodo si su normal apunta en la dirección del otro extremo.
  const miraS = nS.x * haciaS.x + nS.y * haciaS.y > 0;
  const miraT = nT.x * haciaT.x + nT.y * haciaT.y > 0;

  if (opuestos && miraS && miraT) {
    const horizontal = esHorizontal(s.lado);
    const desfase = horizontal ? Math.abs(t.y - s.y) : Math.abs(t.x - s.x);
    return desfase <= tol ? rutaRecta(s, t) : rutaCurva(s, t, nS, nT, horizontal);
  }
  if (perpendiculares) return rutaOrtogonalPerpendicular(s, t, nS, nT, op.radio ?? RADIO);
  return rutaOrtogonalDesvio(s, t, nS, nT, op);
}

// ---------------- curva en S (puertos opuestos con desfase) ----------------
function rutaCurva(s: Punto, t: Punto, nS: Punto, nT: Punto, horizontal: boolean): Ruta {
  const axial = Math.abs(horizontal ? t.x - s.x : t.y - s.y);
  // Distancia de control acotada por el avance axial: sin lazos ni sobrepasos.
  const d = axial <= 0 ? 0 : Math.min(Math.max(axial / 2, 12), 96, axial);
  if (d < 0.5) return rutaRecta(s, t);
  const c1 = sumar(s, nS, d);
  const c2 = sumar(t, nT, d);
  const centro = bezier(s, c1, c2, t, 0.5);
  return {
    path: `M ${red(s.x)} ${red(s.y)} C ${red(c1.x)} ${red(c1.y)} ${red(c2.x)} ${red(c2.y)} ${red(t.x)} ${red(t.y)}`,
    tipo: "curva",
    centro,
    tangenteInicio: normalizar(restar(c1, s)),
    tangenteFin: normalizar(restar(t, c2)),
  };
}

function bezier(p0: Punto, p1: Punto, p2: Punto, p3: Punto, t: number): Punto {
  const u = 1 - t;
  return punto(
    u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  );
}

// ---------------- ortogonal: puertos perpendiculares ----------------
function rutaOrtogonalPerpendicular(s: Punto, t: Punto, nS: Punto, nT: Punto, radio: number): Ruta {
  const horizontal = esHorizontal(ladoDe(nS));
  // Stub proporcional al avance axial: evita el tramo intermedio diminuto que hacía "guiñar" la esquina.
  const axial = horizontal ? Math.abs(t.x - s.x) : Math.abs(t.y - s.y);
  const stub = Math.min(28, Math.max(8, axial * 0.5));
  const e = sumar(s, nS, stub);
  const b = sumar(t, nT, stub);
  // Escalera de dos codos: sale por el lado del origen y entra por el del destino.
  const codo = horizontal ? punto(e.x, b.y) : punto(b.x, e.y);
  return construir(limpiar([s, e, codo, b, t]), radio);
}

// ---------------- ortogonal: desvío (mismo lado o mira en contra) ----------------
function rutaOrtogonalDesvio(s: Punto, t: Punto, nS: Punto, nT: Punto, op: OpcionesRuta): Ruta {
  const radio = op.radio ?? RADIO;
  const horizontal = esHorizontal(ladoDe(nS));
  const mismoLado = ladoDe(nS) === ladoDe(nT);
  const stub = largoStub(s, t);
  const e = sumar(s, nS, stub);
  const b = sumar(t, nT, stub);

  // Mismo lado con el destino por delante: una Z limpia sale por el puerto, avanza y entra por su lado.
  if (mismoLado && enFrente(s, b, nS, horizontal) && !cruzaCaja(s, b, horizontal, op)) {
    const codo = horizontal ? punto(b.x, s.y) : punto(s.x, b.y);
    return construir(limpiar([s, codo, b, t]), radio);
  }

  // Desvío perpendicular: sale por su lado, rodea y entra por su lado (sin lazos Bézier).
  if (horizontal) {
    const ys = limitesY(op.rectOrigen, op.rectDestino, s.y, t.y);
    const arriba = ys.min - MARGEN_DESVIO;
    const abajo = ys.max + MARGEN_DESVIO;
    const costeArriba = Math.abs(s.y - arriba) + Math.abs(t.y - arriba);
    const costeAbajo = Math.abs(abajo - s.y) + Math.abs(abajo - t.y);
    const desvio = costeArriba <= costeAbajo ? arriba : abajo;
    return construir(limpiar([s, e, punto(e.x, desvio), punto(b.x, desvio), b, t]), radio);
  }

  const xs = limitesX(op.rectOrigen, op.rectDestino, s.x, t.x);
  const izquierda = xs.min - MARGEN_DESVIO;
  const derecha = xs.max + MARGEN_DESVIO;
  const costeIzquierda = Math.abs(s.x - izquierda) + Math.abs(t.x - izquierda);
  const costeDerecha = Math.abs(derecha - s.x) + Math.abs(derecha - t.x);
  const desvio = costeIzquierda <= costeDerecha ? izquierda : derecha;
  return construir(limpiar([s, e, punto(desvio, e.y), punto(desvio, b.y), b, t]), radio);
}

/** ¿El punto de aproximación `b` queda por delante del puerto, en el sentido de su normal? */
function enFrente(s: Punto, b: Punto, nS: Punto, horizontal: boolean): boolean {
  return horizontal ? (b.x - s.x) * nS.x > 0 : (b.y - s.y) * nS.y > 0;
}

/** ¿El primer tramo de la Z atravesaría la tarjeta destino? Si sí, hay que rodearla. */
function cruzaCaja(s: Punto, b: Punto, horizontal: boolean, op: OpcionesRuta): boolean {
  const r = op.rectDestino;
  if (!r) return false;
  const m = 4;
  if (horizontal) {
    const y = s.y, x0 = Math.min(s.x, b.x), x1 = Math.max(s.x, b.x);
    return y > r.y - m && y < r.y + r.height + m && x1 > r.x - m && x0 < r.x + r.width + m;
  }
  const x = s.x, y0 = Math.min(s.y, b.y), y1 = Math.max(s.y, b.y);
  return x > r.x - m && x < r.x + r.width + m && y1 > r.y - m && y0 < r.y + r.height + m;
}

/** Lado a partir de la normal (para reutilizar el helper de eje). */
function ladoDe(n: Punto): Lado {
  if (n.x > 0) return "right";
  if (n.x < 0) return "left";
  return n.y > 0 ? "bottom" : "top";
}

function largoStub(s: Punto, t: Punto): number {
  return Math.min(28, Math.max(12, longitud(restar(t, s)) * 0.15));
}

interface Limites {
  min: number;
  max: number;
}

function limitesY(r1: RectNodo | undefined, r2: RectNodo | undefined, a: number, b: number): Limites {
  const valores = [a, b];
  if (r1) valores.push(r1.y, r1.y + r1.height);
  if (r2) valores.push(r2.y, r2.y + r2.height);
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

function limitesX(r1: RectNodo | undefined, r2: RectNodo | undefined, a: number, b: number): Limites {
  const valores = [a, b];
  if (r1) valores.push(r1.x, r1.x + r1.width);
  if (r2) valores.push(r2.x, r2.x + r2.width);
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

// ---------------- construcción y redondeo de la polilínea ----------------
function construir(pts: Punto[], radio: number): Ruta {
  if (pts.length < 2) return rutaRecta(pts[0] ?? punto(0, 0), pts[0] ?? punto(0, 0));
  return {
    path: redondear(pts, radio),
    tipo: "ortogonal",
    centro: puntoMedio(pts),
    tangenteInicio: normalizar(restar(pts[1], pts[0])),
    tangenteFin: normalizar(restar(pts[pts.length - 1], pts[pts.length - 2])),
  };
}

/** Quita puntos repetidos y codos colineales (una reversión no es colineal). */
function limpiar(pts: Punto[]): Punto[] {
  const sinRepetidos: Punto[] = [];
  for (const p of pts) {
    const ultimo = sinRepetidos[sinRepetidos.length - 1];
    if (!ultimo || longitud(restar(p, ultimo)) > 0.4) sinRepetidos.push(p);
  }
  const salida: Punto[] = [];
  for (let i = 0; i < sinRepetidos.length; i++) {
    if (i > 0 && i < sinRepetidos.length - 1) {
      const a = sinRepetidos[i - 1], b = sinRepetidos[i], c = sinRepetidos[i + 1];
      const v1 = restar(b, a), v2 = restar(c, b);
      const cruz = v1.x * v2.y - v1.y * v2.x;
      const avance = v1.x * v2.x + v1.y * v2.y;
      if (Math.abs(cruz) < 0.01 && avance > 0) continue;
    }
    salida.push(sinRepetidos[i]);
  }
  return salida.length >= 2 ? salida : sinRepetidos;
}

/** Convierte la polilínea en un path con esquinas redondeadas (radio recortado a la mitad de cada tramo). */
function redondear(pts: Punto[], radio: number): string {
  if (pts.length < 2) return "";
  let d = `M ${red(pts[0].x)} ${red(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = longitud(restar(b, a)), l2 = longitud(restar(c, b));
    const r = Math.min(radio, l1 / 2, l2 / 2);
    if (r < 0.5) {
      d += ` L ${red(b.x)} ${red(b.y)}`;
      continue;
    }
    const u1 = normalizar(restar(a, b));
    const u2 = normalizar(restar(c, b));
    const p1 = punto(b.x + u1.x * r, b.y + u1.y * r);
    const p2 = punto(b.x + u2.x * r, b.y + u2.y * r);
    d += ` L ${red(p1.x)} ${red(p1.y)} Q ${red(b.x)} ${red(b.y)} ${red(p2.x)} ${red(p2.y)}`;
  }
  const final = pts[pts.length - 1];
  return d + ` L ${red(final.x)} ${red(final.y)}`;
}

/** Punto a la mitad de la longitud de arco (sitúa el texto central sobre el trazado). */
function puntoMedio(pts: Punto[]): Punto {
  if (pts.length === 0) return punto(0, 0);
  if (pts.length === 1) return pts[0];
  const tramos: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = longitud(restar(pts[i + 1], pts[i]));
    tramos.push(l);
    total += l;
  }
  let resto = total / 2;
  for (let i = 0; i < tramos.length; i++) {
    if (tramos[i] > 0 && resto <= tramos[i]) {
      const k = resto / tramos[i];
      return punto(pts[i].x + (pts[i + 1].x - pts[i].x) * k, pts[i].y + (pts[i + 1].y - pts[i].y) * k);
    }
    resto -= tramos[i];
  }
  return pts[pts.length - 1];
}
