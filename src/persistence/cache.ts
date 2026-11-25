import type { Proyecto } from "../domain/schema";
import type { Visibilidad } from "../lib/supabase";

/**
 * Cache local de la ultima version leida de cada proyecto en la nube.
 * Permite abrir un proyecto sin red (solo lectura de la copia, sin guardar).
 *
 *   flowarq.nube.v1.<id>  -> { doc, revision, actualizadoEn, ownerId, visibilidad, rol }
 *   flowarq.nube.mig.v1   -> { subidos: string[], confirmado: boolean }
 */
const PREF = "flowarq.nube.v1.";
const MIG = "flowarq.nube.mig.v1";

export interface CopiaLocal {
  doc: Proyecto;
  revision: number;
  actualizadoEn: string;
  ownerId: string;
  visibilidad: Visibilidad;
  rol: string;
}

export function guardarCache(id: string, copia: CopiaLocal): void {
  try {
    localStorage.setItem(PREF + id, JSON.stringify(copia));
  } catch {
    /* sin espacio: la cache es opcional */
  }
}

export function leerCache(id: string): CopiaLocal | null {
  try {
    const raw = localStorage.getItem(PREF + id);
    if (!raw) return null;
    const v = JSON.parse(raw) as CopiaLocal;
    if (!v || !v.doc || v.doc.id !== id) return null;
    return v;
  } catch {
    return null;
  }
}

export function borrarCache(id: string): void {
  try {
    localStorage.removeItem(PREF + id);
  } catch {
    /* nada que hacer */
  }
}

export function listarCache(): CopiaLocal[] {
  const out: CopiaLocal[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREF)) continue;
      const v = leerCache(k.slice(PREF.length));
      if (v) out.push(v);
    }
  } catch {
    /* se ignora */
  }
  return out;
}

export interface EstadoMigracion {
  subidos: string[];
  confirmado: boolean;
}

export function leerMigracion(): EstadoMigracion {
  try {
    const v = JSON.parse(localStorage.getItem(MIG) ?? "null");
    if (v && Array.isArray(v.subidos)) return { subidos: v.subidos.filter((x: unknown) => typeof x === "string"), confirmado: !!v.confirmado };
  } catch {
    /* se asume vacio */
  }
  return { subidos: [], confirmado: false };
}

export function escribirMigracion(m: EstadoMigracion): void {
  try {
    localStorage.setItem(MIG, JSON.stringify(m));
  } catch {
    /* nada que hacer */
  }
}
