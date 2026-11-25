import { useEffect } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import { exportar, pedirEliminarNodo, pedirEliminarRelacion, pedirEliminarZona } from "./actions";

const editable = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input:not([type=range]),textarea,select,[contenteditable='true']");

/** Atajos globales: Del, Ctrl+Z / Ctrl+Y, Ctrl+S, Esc (sube de nivel si no hay edición/diálogo abierto). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cv = useCanvasStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (mod && k === "s") {
        e.preventDefault();
        exportar();
        return;
      }
      if (cv.dialog) return;
      if (mod && (k === "z" || k === "y")) {
        if (editable(e.target)) return; // deshacer nativo del texto
        e.preventDefault();
        const p = useProjectStore.getState();
        if (k === "y" || e.shiftKey) p.redo();
        else p.undo();
        return;
      }
      if (e.key === "Escape") {
        if (editable(e.target)) return;
        if (cv.menu) return;
        if (cv.levelId !== null) {
          const parent = useProjectStore.getState().doc!.nodos.find((n) => n.id === cv.levelId)?.parentId ?? null;
          cv.navigate(parent);
        } else {
          cv.select(null);
          cv.selectEdge(null);
          cv.selectZona(null);
        }
        return;
      }
      if (e.key === "Delete" && !editable(e.target) && !cv.navigating) {
        if (cv.selectedId) pedirEliminarNodo(cv.selectedId);
        else if (cv.selectedEdgeId) pedirEliminarRelacion(cv.selectedEdgeId);
        else if (cv.selectedZonaId) pedirEliminarZona(cv.selectedZonaId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
