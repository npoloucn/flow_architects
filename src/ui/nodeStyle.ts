import type { CSSProperties } from "react";
import type { Nodo } from "../domain/schema";
import { contraste, mezclar } from "./color";

const INK = "#2C2A29", PAPER = "#FEFFFF";

/** Mezcla `texto` hacia `fondo` lo máximo posible sin bajar de 4.5:1. */
function suave(texto: string, fondo: string, m: number): string {
  for (let k = m; k >= 0; k -= 0.03) {
    const c = mezclar(texto, fondo, k);
    if (contraste(c, fondo) >= 4.5) return c;
  }
  return texto;
}
/** Texto de marca (ink/paper) si alcanza 4.5:1; si no (grises medios), negro o blanco puros. */
export function textoSobre(fondo: string): string {
  const c = [INK, PAPER].sort((a, b) => contraste(b, fondo) - contraste(a, fondo))[0];
  if (contraste(c, fondo) >= 4.5) return c;
  return contraste("#000000", fondo) >= contraste("#FFFFFF", fondo) ? "#000000" : "#FFFFFF";
}

/**
 * Variables CSS del nodo a partir de sus colores propios. Con fondo propio el texto, los iconos y las líneas internas
 * se recalculan para contrastar con ese fondo (≥ 4.5:1), sea cual sea el tema. Sin colores propios no devuelve nada.
 */
export function estiloNodo(n: Pick<Nodo, "colorFondo" | "colorBorde">): CSSProperties | undefined {
  const st: Record<string, string> = {};
  if (n.colorFondo) {
    const bg = n.colorFondo, t = textoSobre(bg);
    st["--node-bg"] = bg;
    st["--node-text"] = t;
    st["--node-soft"] = suave(t, bg, 0.14);
    st["--node-mute"] = suave(t, bg, 0.26);
    st["--node-line"] = mezclar(t, bg, 0.72);
  }
  if (n.colorBorde) {
    st["--node-border"] = n.colorBorde;
    st["--node-band-text"] = textoSobre(n.colorBorde);
  }
  return Object.keys(st).length ? (st as CSSProperties) : undefined;
}