import type { ReactNode } from "react";
import type { Nodo } from "../domain/schema";
import { useProjectStore } from "../store/projectStore";
import { useIconPreview } from "../iconos/preview";
import { resolverIcono } from "../iconos/resolver";

export const esImagen = (icono?: string | null) => !!icono && icono.startsWith("data:image/");
/** Icono resuelto de una clave (`lucide:`, `si:` o la antigua `preset:`); `undefined` si no es un icono de catálogo. */
export const presetDe = resolverIcono;

type NodoIco = Pick<Nodo, "icono" | "categoriaId"> & { id?: string };

function useIconoEfectivo(nodo: NodoIco) {
  const cat = useProjectStore((s) => s.doc?.categorias.find((c) => c.id === nodo.categoriaId));
  const prev = useIconPreview((s) => (nodo.id && s.id === nodo.id ? s.clave : null));
  return { cat, icono: prev ?? nodo.icono ?? cat?.icono };
}

/**
 * Icono del nodo: imagen propia > icono de catálogo elegido > icono por defecto de su categoría (del proyecto) > `fallback` (el del tipo).
 * Una clave desconocida cae a la categoría sin romper.
 */
export function NodeIcon({ nodo, fallback }: { nodo: NodoIco; fallback: ReactNode }) {
  const { cat, icono } = useIconoEfectivo(nodo);
  if (esImagen(icono)) return <img src={icono!} alt="" draggable={false} decoding="async" />;
  const ico = resolverIcono(icono) ?? resolverIcono(cat?.icono);
  if (ico) return <ico.Svg />;
  return <>{fallback}</>;
}

/** Marco cuadrado con el icono; el borde toma el color de la categoría. */
export function IconTile({ nodo, fallback, size = "md" }: { nodo: NodoIco; fallback: ReactNode; size?: "sm" | "md" | "lg" }) {
  const { cat, icono } = useIconoEfectivo(nodo);
  const marca = !esImagen(icono) && !!icono?.startsWith("si:");
  return (
    <span className={`ico-tile ${size}${esImagen(icono) ? " has-img" : ""}${marca ? " is-brand" : ""}`} style={cat ? { borderColor: cat.color } : undefined}>
      <NodeIcon nodo={nodo} fallback={fallback} />
    </span>
  );
}
