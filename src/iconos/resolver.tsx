import type { SVGProps } from "react";
import { normalizarClave } from "./compat";
import { LUCIDE } from "./lucide.generated";
import { SI } from "./si.generated";

export interface IconoResuelto { clave: string; label: string; Svg: (p: SVGProps<SVGSVGElement>) => JSX.Element }

const cache = new Map<string, IconoResuelto | null>();

/** Resuelve una clave (`lucide:x`, `si:x` o la antigua `preset:x`) a un componente SVG; `undefined` si no existe. */
export function resolverIcono(clave: string | null | undefined): IconoResuelto | undefined {
  const k = normalizarClave(clave);
  if (!k) return undefined;
  const hit = cache.get(k);
  if (hit !== undefined) return hit ?? undefined;
  let r: IconoResuelto | null = null;
  if (k.startsWith("lucide:")) {
    const L = LUCIDE[k.slice(7)];
    if (L) r = { clave: k, label: k.slice(7), Svg: (p) => <L aria-hidden {...(p as object)} /> };
  } else if (k.startsWith("si:")) {
    const d = SI[k.slice(3)];
    if (d) r = { clave: k, label: d[0], Svg: (p) => <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden {...p}><path d={d[1]} /></svg> };
  }
  cache.set(k, r);
  return r ?? undefined;
}
