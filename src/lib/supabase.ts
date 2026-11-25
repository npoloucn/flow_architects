import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente unico de Supabase para toda la app.
 *
 * La `anon key` es publica por diseno: RLS es quien protege los datos. Nunca se
 * debe usar aqui la `service_role`.
 *
 * Si faltan las variables (por ejemplo en un build de GitHub Pages sin secrets)
 * `configurado` queda en false y la app sigue funcionando en modo local.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const configurado = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = configurado
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // El router de la app vive en el hash; los tokens de recuperacion /
        // enlace magico los consume manualmente authStore para no chocar.
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    })
  : null;

export type Visibilidad = "privado" | "enlace" | "publico";

export const ETIQUETA_VISIBILIDAD: Record<Visibilidad, string> = {
  privado: "Privado",
  enlace: "Con enlace",
  publico: "Publico",
};

/** Mensaje unico para cuando no hay backend configurado. */
export const SIN_BACKEND = "Sin backend configurado: los proyectos se guardan solo en este navegador.";
