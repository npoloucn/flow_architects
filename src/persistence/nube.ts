import { supabase, type Visibilidad } from "../lib/supabase";
import type { Proyecto } from "../domain/schema";
import { proyectoVacio } from "./coleccion";

/** Rol efectivo del usuario actual sobre un proyecto. */
export type RolProyecto = "owner" | "editor" | "viewer" | "publico";

export interface ProyectoNube {
  id: string;
  nombre: string;
  descripcion: string;
  data: Proyecto;
  revision: number;
  visibilidad: Visibilidad;
  ownerId: string;
  creadoEn: string;
  actualizadoEn: string;
  rol: RolProyecto;
  esMio: boolean;
  nodos: number;
  tareas: number;
  tareasAbiertas: number;
}

export interface MiembroNube {
  userId: string;
  nombre: string;
  rol: "viewer" | "editor";
  creadoEn: string;
}

export interface RevisionNube {
  id: number;
  revision: number;
  autorId: string | null;
  autor: string;
  creadoEn: string;
}

export class ErrorNube extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ErrorNube";
    this.code = code;
  }
}

export const esIdNube = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const nuevoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const COUNT_FIELDS = "id,owner_id,name,description,data,revision,visibility,created_at,updated_at";

type Fila = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  data: Proyecto;
  revision: number;
  visibility: Visibilidad;
  created_at: string;
  updated_at: string;
};

function mapear(fila: Fila, uid: string | null, roles: Map<string, "viewer" | "editor">): ProyectoNube {
  const doc = { ...(fila.data ?? ({} as Proyecto)), id: fila.id, nombre: fila.name, descripcion: fila.description } as Proyecto;
  const esMio = !!uid && fila.owner_id === uid;
  const rol: RolProyecto = esMio ? "owner" : (roles.get(fila.id) ?? "publico");
  return {
    id: fila.id,
    nombre: fila.name,
    descripcion: fila.description,
    data: doc,
    revision: fila.revision,
    visibilidad: fila.visibility,
    ownerId: fila.owner_id,
    creadoEn: fila.created_at,
    actualizadoEn: fila.updated_at,
    rol,
    esMio,
    nodos: Array.isArray(doc.nodos) ? doc.nodos.length : 0,
    tareas: Array.isArray(doc.tareas) ? doc.tareas.length : 0,
    tareasAbiertas: Array.isArray(doc.tareas) ? doc.tareas.filter((t) => t.estado !== "hecha").length : 0,
  };
}

async function rolesDe(uid: string | null, projectId?: string): Promise<Map<string, "viewer" | "editor">> {
  const out = new Map<string, "viewer" | "editor">();
  if (!uid || !supabase) return out;
  let q = supabase.from("project_members").select("project_id,role").eq("user_id", uid);
  if (projectId) q = q.eq("project_id", projectId);
  const { data } = await q;
  for (const r of data ?? []) out.set(r.project_id, r.role as "viewer" | "editor");
  return out;
}

const requerir = () => {
  if (!supabase) throw new ErrorNube("Supabase no esta configurado en este build.");
  return supabase;
};

export async function listarProyectos(uid: string | null): Promise<ProyectoNube[]> {
  const sb = requerir();
  const { data, error } = await sb.from("projects").select(COUNT_FIELDS).is("deleted_at", null).order("updated_at", { ascending: false });
  if (error) throw new ErrorNube(error.message, error.code);
  const roles = await rolesDe(uid);
  return (data as Fila[]).map((f) => mapear(f, uid, roles));
}

export async function obtenerProyecto(id: string, uid: string | null): Promise<ProyectoNube | null> {
  const sb = requerir();
  const { data, error } = await sb.from("projects").select(COUNT_FIELDS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new ErrorNube(error.message, error.code);
  if (!data) return null;
  const roles = await rolesDe(uid, id);
  return mapear(data as Fila, uid, roles);
}

export interface NuevoProyecto {
  nombre: string;
  descripcion: string;
  visibilidad?: Visibilidad;
  data?: Proyecto;
}

export async function crearProyecto(uid: string, opciones: NuevoProyecto): Promise<ProyectoNube> {
  const sb = requerir();
  const id = nuevoId();
  const ahora = new Date().toISOString();
  const base = opciones.data ?? proyectoVacio(opciones.nombre, opciones.descripcion);
  const doc: Proyecto = {
    ...base,
    id,
    nombre: opciones.nombre.trim(),
    descripcion: opciones.descripcion.trim(),
    creadoEn: base.creadoEn || ahora,
    actualizadoEn: ahora,
  };
  const fila = {
    id,
    owner_id: uid,
    name: doc.nombre,
    description: doc.descripcion,
    data: doc,
    revision: 1,
    visibility: opciones.visibilidad ?? "privado",
  };
  // Sin `returning`: la politica SELECT usa una funcion STABLE que no ve la fila
  // recien insertada en el mismo statement. El objeto se arma en cliente.
  const { error } = await sb.from("projects").insert(fila);
  if (error) throw new ErrorNube(error.message, error.code);
  return mapear({
    id, owner_id: uid, name: doc.nombre, description: doc.descripcion, data: doc,
    revision: 1, visibility: fila.visibility as Visibilidad,
    created_at: ahora, updated_at: ahora,
  }, uid, new Map());
}

/** Renombra y/o cambia visibilidad. Solo el duenio (lo garantiza RLS). */
export async function actualizarMeta(
  id: string,
  uid: string,
  patch: { nombre?: string; descripcion?: string; visibilidad?: Visibilidad },
): Promise<ProyectoNube> {
  const sb = requerir();
  const { data: actual, error: e0 } = await sb.from("projects").select(COUNT_FIELDS).eq("id", id).maybeSingle();
  if (e0) throw new ErrorNube(e0.message, e0.code);
  if (!actual) throw new ErrorNube("Proyecto no encontrado o sin permiso.");
  const fila = actual as Fila;
  const nombre = patch.nombre?.trim() || fila.name;
  const descripcion = patch.descripcion?.trim() ?? fila.description;
  const doc: Proyecto = { ...(fila.data as Proyecto), id, nombre, descripcion };
  const cambios: Record<string, unknown> = { name: nombre, description: descripcion, data: doc };
  if (patch.visibilidad) cambios.visibility = patch.visibilidad;
  const { data, error } = await sb.from("projects").update(cambios).eq("id", id).select(COUNT_FIELDS).maybeSingle();
  if (error) throw new ErrorNube(error.message, error.code);
  if (!data) throw new ErrorNube("Solo el duenio puede cambiar estos datos.");
  return mapear(data as Fila, uid, new Map());
}

export async function eliminarProyecto(id: string): Promise<void> {
  const sb = requerir();
  const { data, error } = await sb.from("projects").delete().eq("id", id).select("id");
  if (error) throw new ErrorNube(error.message, error.code);
  if (!data || data.length === 0) throw new ErrorNube("Solo el duenio puede eliminar el proyecto.");
}

export async function duplicarProyecto(proyecto: ProyectoNube, uid: string): Promise<ProyectoNube> {
  return crearProyecto(uid, {
    nombre: `${proyecto.nombre} (copia)`,
    descripcion: proyecto.descripcion,
    visibilidad: "privado",
    data: proyecto.data,
  });
}

/** Revision actual en el servidor (comprobacion previa al guardado). */
export async function revisionActual(id: string): Promise<number | null> {
  const sb = requerir();
  const { data, error } = await sb.from("projects").select("revision").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new ErrorNube(error.message, error.code);
  return data ? (data.revision as number) : null;
}

export async function guardarProyecto(id: string, data: Proyecto, revisionEsperada: number | null): Promise<ProyectoNube> {
  const sb = requerir();
  const { data: res, error } = await sb.rpc("save_project", {
    p_project: id,
    p_data: data,
    p_expected_revision: revisionEsperada,
  });
  if (error) throw new ErrorNube(error.message, error.code);
  const fila = (Array.isArray(res) ? res[0] : res) as Fila;
  if (!fila) throw new ErrorNube("El servidor no devolvio el proyecto guardado.");
  return mapear(fila, null, new Map());
}

// ------------------------------- Miembros -------------------------------

export async function listarMiembros(id: string): Promise<MiembroNube[]> {
  const sb = requerir();
  const { data, error } = await sb.from("project_members").select("user_id,role,created_at").eq("project_id", id).order("created_at");
  if (error) throw new ErrorNube(error.message, error.code);
  const filas = data ?? [];
  if (filas.length === 0) return [];
  const ids = filas.map((m) => m.user_id);
  const { data: perfiles } = await sb.from("profiles").select("id,display_name").in("id", ids);
  const nombres = new Map((perfiles ?? []).map((p) => [p.id, p.display_name as string]));
  return filas.map((m) => ({
    userId: m.user_id,
    nombre: nombres.get(m.user_id) || m.user_id.slice(0, 8),
    rol: m.role as "viewer" | "editor",
    creadoEn: m.created_at,
  }));
}

export async function agregarMiembro(id: string, email: string, rol: "viewer" | "editor"): Promise<void> {
  const sb = requerir();
  const { error } = await sb.rpc("add_project_member", { p_project: id, p_email: email.trim(), p_role: rol });
  if (error) {
    if (error.code === "P0002" || /no encontrado/i.test(error.message)) {
      throw new ErrorNube("No hay ninguna cuenta con ese correo. La persona debe registrarse primero.");
    }
    throw new ErrorNube(error.message, error.code);
  }
}

export async function cambiarRolMiembro(id: string, userId: string, rol: "viewer" | "editor"): Promise<void> {
  const sb = requerir();
  const { error } = await sb.from("project_members").update({ role: rol }).eq("project_id", id).eq("user_id", userId);
  if (error) throw new ErrorNube(error.message, error.code);
}

export async function quitarMiembro(id: string, userId: string): Promise<void> {
  const sb = requerir();
  const { error } = await sb.from("project_members").delete().eq("project_id", id).eq("user_id", userId);
  if (error) throw new ErrorNube(error.message, error.code);
}

// ------------------------------ Revisiones ------------------------------

export async function listarRevisiones(id: string): Promise<RevisionNube[]> {
  const sb = requerir();
  const { data, error } = await sb
    .from("project_revisions")
    .select("id,revision,author_id,created_at")
    .eq("project_id", id)
    .order("revision", { ascending: false })
    .limit(100);
  if (error) throw new ErrorNube(error.message, error.code);
  const filas = data ?? [];
  const ids = [...new Set(filas.map((r) => r.author_id).filter((x): x is string => !!x))];
  let nombres = new Map<string, string>();
  if (ids.length) {
    const { data: perfiles } = await sb.from("profiles").select("id,display_name").in("id", ids);
    nombres = new Map((perfiles ?? []).map((p) => [p.id, p.display_name as string]));
  }
  return filas.map((r) => ({
    id: r.id,
    revision: r.revision,
    autorId: r.author_id,
    autor: (r.author_id && nombres.get(r.author_id)) || "Alguien",
    creadoEn: r.created_at,
  }));
}

export async function obtenerRevisionData(id: string, revision: number): Promise<Proyecto> {
  const sb = requerir();
  const { data, error } = await sb
    .from("project_revisions")
    .select("data")
    .eq("project_id", id)
    .eq("revision", revision)
    .maybeSingle();
  if (error) throw new ErrorNube(error.message, error.code);
  if (!data) throw new ErrorNube("No se encontro esa revision.");
  return { ...(data.data as Proyecto), id };
}
