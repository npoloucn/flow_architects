import { useState } from "react";
import type { Nodo } from "../../domain/schema";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { report } from "../actions";
import { ColorPicker } from "./ColorPicker";

/** Color propio del nodo (fondo o borde) con la rueda de color, vista previa en vivo y «Restablecer». */
export function NodeColorField({ nodo, campo, label, inicial }: { nodo: Nodo; campo: "colorFondo" | "colorBorde"; label: string; inicial: string }) {
  const [abierto, setAbierto] = useState(false);
  const valor = nodo[campo];
  const set = (hex: string | null) => { report(useProjectStore.getState().actualizarNodo(nodo.id, { [campo]: hex }, `nc-${nodo.id}-${campo}`)); useCanvasStore.getState().setPreviewNode(null); };
  return (
    <div className="ncolor">
      <div className="ncolor-head">
        <i className={`swatch-now${valor ? "" : " is-default"}`} style={valor ? { background: valor } : undefined} aria-hidden />
        <span className="t">{valor ? valor : "Por defecto"}</span>
        <button className="btn sm" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? "Cerrar" : "Elegir"}</button>
        <button className="btn sm" disabled={!valor} onClick={() => set(null)} aria-label={`Restablecer ${label.toLowerCase()} al color por defecto`}>Restablecer</button>
      </div>
      {abierto && (
        <ColorPicker
          label={label} value={valor ?? inicial}
          onLive={(hex) => useCanvasStore.getState().setPreviewNode({ id: nodo.id, campo, hex })}
          onCommit={(hex) => set(hex)}
        />
      )}
    </div>
  );
}