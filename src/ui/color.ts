// Utilidades de color para flechas: contraste WCAG, versión aclarada/oscurecida y contorno automático.
export const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (c: [number, number, number]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const mezclar = (a: string, b: string, t: number) => {
  const x = rgb(a), y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};

export const MIN_CONTRASTE = 3;

/** Versión del mismo color aclarada (fondo oscuro) u oscurecida (fondo claro) hasta alcanzar el contraste mínimo. */
export function ajustarContraste(hex: string, fondo: string, min = MIN_CONTRASTE): string {
  const destino = luminancia(fondo) < 0.5 ? "#FFFFFF" : "#000000";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mezclar(hex, destino, t);
    if (contraste(c, fondo) >= min) return c;
  }
  return destino;
}

export const normalizarHex = (v: string): string | null => {
  const s = v.trim().replace(/^#?/, "#");
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : /^#[0-9a-fA-F]{3}$/.test(s) ? "#" + [...s.slice(1)].map((c) => c + c).join("").toUpperCase() : null;
};

/** Colores reales del tema activo (tokens resueltos): fondo del canvas, texto y superficie. */
export function coloresTema(): { bg: string; text: string; surface: string } {
  const cs = getComputedStyle(document.documentElement);
  const get = (n: string, fb: string) => {
    const v = cs.getPropertyValue(n).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fb;
  };
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    bg: get("--bg", dark ? "#272422" : "#F7F7F7"),
    text: get("--text", dark ? "#FEFFFF" : "#2C2A29"),
    surface: dark ? mezclar("#FEFFFF", "#272422", 0.93) : "#FEFFFF",
  };
}

// ---- HSV (rueda de color): h 0-360, s y v 0-1 ----
export interface Hsv { h: number; s: number; v: number }

/** `hPrev` conserva el matiz cuando el color es gris/negro (el matiz no se puede deducir). */
export function hexToHsv(hex: string, hPrev = 0): Hsv {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = hPrev;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}