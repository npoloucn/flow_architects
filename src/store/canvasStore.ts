import { create } from "zustand";
import type { ReactNode } from "react";

/** Store de VISTA: nivel activo, selección, tema y UI efímera (diálogos, menú, toasts). Nunca guarda datos de dominio. */
export interface Viewport { x: number; y: number; zoom: number }
export type Theme = "light" | "dark";
export interface DialogAction { label: string; kind?: "primary" | "danger"; run: () => void }
export interface DialogSpec { title: string; body: ReactNode; actions: DialogAction[]; cancelLabel?: string }
export interface MenuItem { label: string; run: () => void }
export interface MenuSpec { x: number; y: number; items: MenuItem[] }
export interface ToastSpec { id: number; text: string; undo?: boolean }

const THEME_KEY = "flowarq.tema";
const applyTheme = (t: Theme) => {
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* sin almacenamiento: el tema sigue aplicándose en la sesión */
  }
};

interface CanvasState {
  levelId: string | null;
  selectedId: string | null;
  selectedEdgeId: string | null;
  selectedZonaId: string | null;
  selectZona: (id: string | null) => void;
  /** Vista previa en vivo de una zona (arrastre, redimensión, color): no toca el documento. */
  zonaPreview: { id: string; x?: number; y?: number; w?: number; h?: number; dx?: number; dy?: number; colorFondo?: string; colorBorde?: string; opacidad?: number; tamanoIcono?: number } | null;
  setZonaPreview: (p: CanvasState["zonaPreview"]) => void;
  /** Nodo mostrado en el panel de detalle. Se retrasa ~260 ms respecto a `selectedId` para no tapar el nodo durante un doble clic. */
  panelId: string | null;
  renamingId: string | null;
  /** Nodo resaltado (parpadeo) tras saltar desde la vista de tareas, y petición de centrar la vista en él. */
  highlightId: string | null;
  /** Textos de cada flecha que no caben (flechas cortas) y se ocultan o recortan en el canvas. */
  /** Color en vivo mientras se arrastra la rueda: solo lo lee la flecha afectada (no toca el documento ni el historial). */
  /** Color de nodo en vivo mientras se arrastra la rueda (no toca el documento). */
  previewNode: { id: string; campo: "colorFondo" | "colorBorde"; hex: string } | null;
  setPreviewNode: (p: CanvasState["previewNode"]) => void;
  /** Categoría con la que se crean los nodos nuevos (null = «General»). */
  categoriaSel: string | null;
  setCategoriaSel: (id: string | null) => void;
  catDialog: boolean;
  setCatDialog: (v: boolean) => void;
  estadosDialog: boolean;
  setEstadosDialog: (v: boolean) => void;
  previewColor: { id: string; field: "color" | "colorTextoFin"; hex: string } | null;
  setPreviewColor: (p: CanvasState["previewColor"]) => void;
  edgeOcultos: Record<string, string[]>;
  setEdgeOcultos: (id: string, textos: string[]) => void;
  focus: { id: string; n: number } | null;
  paletteOpen: boolean;
  theme: Theme;
  dialog: DialogSpec | null;
  menu: MenuSpec | null;
  toast: ToastSpec | null;
  /** Petición de navegación; la ejecuta (animada) el canvas. */
  pendingNav: { target: string | null } | null;
  navigating: boolean;
  veil: boolean;
  viewports: Record<string, Viewport>;
  select: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setRenaming: (id: string | null) => void;
  focusNode: (id: string) => void;
  clearFocus: () => void;
  resetVista: () => void;
  navigate: (target: string | null) => void;
  setNav: (p: Partial<Pick<CanvasState, "pendingNav" | "navigating" | "veil" | "levelId" | "selectedId">>) => void;
  saveViewport: (levelId: string | null, v: Viewport) => void;
  togglePalette: () => void;
  toggleTheme: () => void;
  openDialog: (d: DialogSpec) => void;
  closeDialog: () => void;
  openMenu: (m: MenuSpec) => void;
  closeMenu: () => void;
  showToast: (text: string, undo?: boolean) => void;
  hideToast: () => void;
}

let panelTimer: ReturnType<typeof setTimeout> | undefined;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let focusN = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;
export const levelKey = (id: string | null) => id ?? "__root__";

export const useCanvasStore = create<CanvasState>((set, get) => ({
  levelId: null,
  selectedId: null,
  selectedEdgeId: null,
  selectedZonaId: null,
  selectZona: (id) => { clearTimeout(panelTimer); set({ selectedZonaId: id, selectedId: null, selectedEdgeId: null, panelId: null }); },
  zonaPreview: null,
  setZonaPreview: (p) => set({ zonaPreview: p }),
  panelId: null,
  renamingId: null,
  highlightId: null,
  previewNode: null,
  setPreviewNode: (p) => set({ previewNode: p }),
  categoriaSel: null,
  setCategoriaSel: (id) => set({ categoriaSel: id }),
  catDialog: false,
  setCatDialog: (v) => set({ catDialog: v }),
  estadosDialog: false,
  setEstadosDialog: (v) => set({ estadosDialog: v }),
  previewColor: null,
  setPreviewColor: (p) => set({ previewColor: p }),
  edgeOcultos: {},
  setEdgeOcultos: (id, textos) =>
    set((s) => ((s.edgeOcultos[id] ?? []).join("|") === textos.join("|") ? s : { edgeOcultos: { ...s.edgeOcultos, [id]: textos } })),
  focus: null,
  paletteOpen: true,
  theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  dialog: null,
  menu: null,
  toast: null,
  pendingNav: null,
  navigating: false,
  veil: false,
  viewports: {},
  select: (id) => {
    clearTimeout(panelTimer);
    set({ selectedId: id, selectedEdgeId: null, selectedZonaId: null });
    if (id === null) set({ panelId: null });
    else if (get().panelId !== null) set({ panelId: id });
    else panelTimer = setTimeout(() => set((s) => (s.selectedId === id ? { panelId: id } : s)), 260);
  },
  selectEdge: (id) => {
    clearTimeout(panelTimer);
    set({ selectedEdgeId: id, selectedId: null, panelId: null, selectedZonaId: null });
  },
  setRenaming: (id) => set({ renamingId: id }),
  focusNode: (id) => {
    clearTimeout(highlightTimer);
    set({ focus: { id, n: ++focusN }, highlightId: id });
    highlightTimer = setTimeout(() => set({ highlightId: null }), 3200);
  },
  clearFocus: () => set({ focus: null }),
  resetVista: () => {
    clearTimeout(panelTimer);
    set({ levelId: null, selectedId: null, selectedEdgeId: null, selectedZonaId: null, zonaPreview: null, panelId: null, renamingId: null, highlightId: null, focus: null, viewports: {}, pendingNav: null, navigating: false, veil: false, menu: null, dialog: null });
  },
  navigate: (target) => {
    const s = get();
    if (s.navigating || s.pendingNav || target === s.levelId) return;
    clearTimeout(panelTimer); // el panel pendiente de abrirse no debe aparecer durante la transición
    set({ pendingNav: { target }, renamingId: null, menu: null });
  },
  setNav: (p) => {
    if (p.selectedId === null) clearTimeout(panelTimer);
    set(p.selectedId === null ? { ...p, panelId: null, selectedEdgeId: null, selectedZonaId: null } : p);
  },
  saveViewport: (levelId, v) => set((s) => ({ viewports: { ...s.viewports, [levelKey(levelId)]: v } })),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  toggleTheme: () => {
    const t: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(t);
    set({ theme: t });
  },
  openDialog: (d) => set({ dialog: d, menu: null }),
  closeDialog: () => set({ dialog: null }),
  openMenu: (m) => set({ menu: m }),
  closeMenu: () => set({ menu: null }),
  showToast: (text, undo) => {
    clearTimeout(toastTimer);
    const id = ++toastId;
    set({ toast: { id, text, undo } });
    toastTimer = setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), 6000);
  },
  hideToast: () => set({ toast: null }),
}));
