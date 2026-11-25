import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

/** Traduce los errores mas comunes de Supabase Auth a algo legible. */
export function mensajeAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contrasena incorrectos.";
  if (m.includes("email not confirmed")) return "Debes confirmar tu correo antes de entrar.";
  if (m.includes("user already registered")) return "Ese correo ya tiene una cuenta. Inicia sesion.";
  if (m.includes("password should be at least")) return "La contrasena debe tener al menos 6 caracteres.";
  if (m.includes("unable to validate email")) return "El correo no tiene un formato valido.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera un momento e intentalo de nuevo.";
  if (m.includes("signups not allowed")) return "El registro esta deshabilitado en este proyecto.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed")) return "No se pudo conectar con el servidor. Revisa tu conexion e intentalo de nuevo.";
  if (m.includes("auth session missing")) return "Tu sesion expiro. Vuelve a iniciar sesion.";
  return msg;
}

const redireccion = () => `${window.location.origin}${window.location.pathname}`;

/** Consume tokens que Supabase deja en el hash (enlace magico / recuperacion). */
async function consumirHash(): Promise<boolean> {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.includes("access_token")) return false;
  const p = new URLSearchParams(raw);
  const access = p.get("access_token");
  const refresh = p.get("refresh_token");
  const tipo = p.get("type");
  // El router usa el hash: se limpia antes de que React lea una ruta invalida.
  window.history.replaceState(null, "", "#/proyectos");
  if (!access || !refresh) return false;
  const { error } = await supabase!.auth.setSession({ access_token: access, refresh_token: refresh });
  if (error) return false;
  return tipo === "recovery";
}

interface AuthState {
  cargando: boolean;
  ocupado: boolean;
  user: User | null;
  session: Session | null;
  /** true cuando se entro por el enlace de restablecer contrasena. */
  recuperacion: boolean;
  error: string | null;
  iniciar: () => Promise<void>;
  entrar: (email: string, password: string) => Promise<boolean>;
  registrar: (email: string, password: string) => Promise<boolean>;
  enlaceMagico: (email: string) => Promise<boolean>;
  recuperar: (email: string) => Promise<boolean>;
  nuevaPassword: (password: string) => Promise<boolean>;
  salir: () => Promise<void>;
  limpiarError: () => void;
}

let arrancado = false;

export const useAuth = create<AuthState>((set) => {
  const fallo = (e: unknown) => {
    set({ ocupado: false, error: mensajeAuth(e instanceof Error ? e.message : String(e)) });
    return false;
  };
  return {
    cargando: true,
    ocupado: false,
    user: null,
    session: null,
    recuperacion: false,
    error: null,

    iniciar: async () => {
      if (arrancado) return;
      arrancado = true;
      if (!supabase) {
        set({ cargando: false });
        return;
      }
      try {
        const recovery = await consumirHash();
        const { data } = await supabase.auth.getSession();
        set({ session: data.session ?? null, user: data.session?.user ?? null, recuperacion: recovery, cargando: false });
        supabase.auth.onAuthStateChange((evento, session) => {
          set({
            session: session ?? null,
            user: session?.user ?? null,
            cargando: false,
            recuperacion: evento === "PASSWORD_RECOVERY" ? true : useAuth.getState().recuperacion,
          });
        });
      } catch {
        set({ cargando: false });
      }
    },

    entrar: async (email, password) => {
      if (!supabase) return false;
      set({ ocupado: true, error: null });
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return fallo(error);
      set({ ocupado: false, user: data.user, session: data.session });
      return true;
    },

    registrar: async (email, password) => {
      if (!supabase) return false;
      set({ ocupado: true, error: null });
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redireccion() },
      });
      if (error) return fallo(error);
      set({ ocupado: false, user: data.user ?? null, session: data.session ?? null });
      return true;
    },

    enlaceMagico: async (email) => {
      if (!supabase) return false;
      set({ ocupado: true, error: null });
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redireccion(), shouldCreateUser: true },
      });
      if (error) return fallo(error);
      set({ ocupado: false });
      return true;
    },

    recuperar: async (email) => {
      if (!supabase) return false;
      set({ ocupado: true, error: null });
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redireccion() });
      if (error) return fallo(error);
      set({ ocupado: false });
      return true;
    },

    nuevaPassword: async (password) => {
      if (!supabase) return false;
      set({ ocupado: true, error: null });
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return fallo(error);
      set({ ocupado: false, recuperacion: false });
      return true;
    },

    salir: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
      set({ user: null, session: null, recuperacion: false, error: null });
    },

    limpiarError: () => set({ error: null }),
  };
});
