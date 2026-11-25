import { create } from "zustand";
import raw from "../data/proyecto-ejemplo.json";
import { validarProyecto, type Proyecto } from "../domain/schema";
import { uid } from "../domain/commands";
import { nodeTypeIds } from "../nodeTypes/registry";
import {
  escribirMeta, eliminarDoc, guardarDoc, leerDoc, leerMeta, listar, migrar, proyectoVacio,
  type IndiceProyecto, type Meta,
} from "../persistence/coleccion";

migrar();

/** Store de la COLECCIÓN de proyectos (lista ligera + aviso de migración). El documento abierto vive en projectStore. */
type R = { ok: true; id: string } | { ok: false; error: string };

interface ColState {
  lista: IndiceProyecto[];
  meta: Meta;
  refrescar: () => void;
  descartarAviso: () => void;
  crear: (nombre: string, descripcion: string) => R;
  crearEjemplo: () => R;
  importar: (doc: Proyecto) => R;
  duplicar: (id: string) => R;
  renombrar: (id: string, nombre: string, descripcion: string) => R;
  eliminar: (id: string) => void;
}

export const useColeccion = create<ColState>((set, get) => {
  const guardarNuevo = (doc: Proyecto): R => {
    const r = guardarDoc(doc);
    get().refrescar();
    return r.ok ? { ok: true, id: doc.id } : { ok: false, error: r.error };
  };
  return {
    lista: listar(),
    meta: leerMeta(),
    refrescar: () => set({ lista: listar(), meta: leerMeta() }),
    descartarAviso: () => {
      escribirMeta({ ...leerMeta(), aviso: null });
      get().refrescar();
    },
    crear: (nombre, descripcion) => {
      if (!nombre.trim()) return { ok: false, error: "El proyecto necesita un nombre." };
      return guardarNuevo(proyectoVacio(nombre, descripcion));
    },
    crearEjemplo: () => {
      const r = validarProyecto(raw, nodeTypeIds());
      if (!r.ok) return { ok: false, error: "El proyecto de ejemplo no es válido." };
      return guardarNuevo({ ...r.doc, id: uid("prj") });
    },
    importar: (doc) => {
      const d = get().lista.some((p) => p.id === doc.id) ? { ...doc, id: uid("prj") } : doc;
      return guardarNuevo(d);
    },
    duplicar: (id) => {
      const r = leerDoc(id);
      if (!r.ok) return { ok: false, error: "No se pudo leer el proyecto a duplicar." };
      const ahora = new Date().toISOString();
      return guardarNuevo({ ...r.doc, id: uid("prj"), nombre: `${r.doc.nombre} (copia)`, creadoEn: ahora, actualizadoEn: ahora });
    },
    renombrar: (id, nombre, descripcion) => {
      if (!nombre.trim()) return { ok: false, error: "El proyecto necesita un nombre." };
      const r = leerDoc(id);
      if (!r.ok) return { ok: false, error: "No se pudo leer el proyecto." };
      return guardarNuevo({ ...r.doc, nombre: nombre.trim(), descripcion: descripcion.trim(), actualizadoEn: new Date().toISOString() });
    },
    eliminar: (id) => {
      eliminarDoc(id);
      get().refrescar();
    },
  };
});
