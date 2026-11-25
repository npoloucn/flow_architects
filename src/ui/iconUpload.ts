import { ERROR_CUOTA } from "../persistence/coleccion";

/** Procesamiento de imágenes propias: valida tipo/tamaño, redimensiona a 128×128 máx. y devuelve un data URL PNG. */
const TIPOS = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_ORIGINAL = 2 * 1024 * 1024;
const MAX_LADO = 128;
const MAX_RESULTADO = 150_000;

export type ResImagen = { ok: true; dataUrl: string } | { ok: false; error: string };

export async function procesarImagen(file: File): Promise<ResImagen> {
  if (!TIPOS.includes(file.type)) return { ok: false, error: "Formato no admitido. Usa PNG, JPG, SVG o WebP." };
  if (file.size > MAX_ORIGINAL) return { ok: false, error: "La imagen pesa más de 2 MB. Elige una más pequeña." };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      return { ok: false, error: "No se pudo leer la imagen. ¿El archivo está dañado?" };
    }
    const w0 = img.naturalWidth || MAX_LADO;
    const h0 = img.naturalHeight || MAX_LADO;
    const k = Math.min(1, MAX_LADO / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return { ok: false, error: "Tu navegador no pudo procesar la imagen." };
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/png");
    if (dataUrl.length > MAX_RESULTADO) return { ok: false, error: "La imagen sigue siendo demasiado pesada tras reducirla. Prueba con otra más simple." };
    return { ok: true, dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Pipeline completo compartido por nodos y zonas: valida, redimensiona y comprueba la cuota. */
export async function subirImagen(file: File): Promise<ResImagen> {
  const r = await procesarImagen(file);
  if (!r.ok) return r;
  const e = hayEspacioPara(r.dataUrl);
  return e.ok ? r : { ok: false, error: e.error };
}

/** ¿Cabe `dataUrl` en el almacenamiento local? Prueba escribirlo antes de aplicar el cambio. */
export function hayEspacioPara(dataUrl: string): { ok: true } | { ok: false; error: string } {
  const k = "flowarq.__probe";
  try {
    localStorage.setItem(k, dataUrl);
    localStorage.removeItem(k);
    return { ok: true };
  } catch {
    try { localStorage.removeItem(k); } catch { /* nada */ }
    return { ok: false, error: ERROR_CUOTA };
  }
}
