import { CATALOGO, type EntradaIcono } from "./catalogo.generated";

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "en"]);
const porClave = new Map(CATALOGO.map((e) => [e.k, e]));
export const entradaDe = (clave: string) => porClave.get(clave);

/** Búsqueda tolerante a acentos y mayúsculas; todas las palabras deben aparecer (en nombre, sinónimos o categoría). */
export function buscarIconos(consulta: string, categoria: string | null, limite = 360): { items: EntradaIcono[]; total: number } {
  const toks = norm(consulta).split(/\s+/).filter((t) => t && !VACIAS.has(t));
  const pool = categoria ? CATALOGO.filter((e) => e.c === categoria) : CATALOGO;
  if (!toks.length) return { items: pool.slice(0, limite), total: pool.length };
  const res: [number, EntradaIcono][] = [];
  for (const e of pool) {
    let score = 0;
    let ok = true;
    for (const t of toks) {
      if (e.own.includes(t)) score += e.n === t || e.own.startsWith(t) ? 3 : 2;
      else if (e.q.includes(t)) score += 1;
      else { ok = false; break; }
    }
    if (ok) res.push([score + (e.set === "si" ? 0.5 : 0), e]);
  }
  res.sort((a, b) => b[0] - a[0]);
  return { items: res.slice(0, limite).map((r) => r[1]), total: res.length };
}
