import { create } from "zustand";

/** Previsualización efímera del icono sobre la tarjeta real del nodo (hover/foco en el selector). No se persiste. */
export const useIconPreview = create<{ id: string | null; clave: string | null; set: (id: string | null, clave: string | null) => void }>((set) => ({
  id: null,
  clave: null,
  set: (id, clave) => set({ id, clave }),
}));
