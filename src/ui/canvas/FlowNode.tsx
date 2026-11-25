import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { getNodeType } from "../../nodeTypes/registry";
import { vistaDe } from "../../nodeViews/registry";
import { categoriaDe, estadoDeNodo } from "../../domain/selectors";
import { estiloNodo } from "../nodeStyle";
import { report } from "../actions";
import type { FlowNode } from "./geometry";

/** Renombrado en línea: input superpuesto al elemento `.card-title` de la tarjeta. */
function RenameInput({ nodoId, titulo, wrap }: { nodoId: string; titulo: string; wrap: HTMLElement }) {
  const rf = useReactFlow();
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [v, setV] = useState(titulo);
  const done = useRef(false);
  useLayoutEffect(() => {
    const t = wrap.querySelector(".card-title") as HTMLElement | null;
    if (!t) return;
    const z = rf.getZoom();
    const a = t.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    setBox({ left: (a.left - b.left) / z - 4, top: (a.top - b.top) / z - 3, width: Math.max(a.width / z + 8, 120), height: Math.max(a.height / z, 20) + 6 });
  }, [wrap, rf]);
  const finish = (ok: boolean) => {
    if (done.current) return;
    done.current = true;
    if (ok && v.trim() !== titulo) report(useProjectStore.getState().actualizarNodo(nodoId, { titulo: v }));
    useCanvasStore.getState().setRenaming(null);
  };
  if (!box) return null;
  return (
    <input
      className="rename-input nodrag nopan nowheel" style={box} value={v} autoFocus aria-label="Nuevo título del nodo"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

/**
 * Envoltorio genérico: la vista (registro de vistas) dibuja la tarjeta y el tipo (registro de tipos) aporta datos.
 * Cuatro puntos de conexión (izquierda, derecha, arriba, abajo). La tarjeta se centra en el marco del tipo para que
 * cambiar de vista no mueva el centro del nodo.
 */
function FlowNodeImpl({ data, selected }: NodeProps<FlowNode>) {
  const doc = useProjectStore((s) => s.doc)!;
  const renaming = useCanvasStore((s) => s.renamingId === data.nodoId);
  const flash = useCanvasStore((s) => s.highlightId === data.nodoId);
  const pv = useCanvasStore((s) => (s.previewNode && s.previewNode.id === data.nodoId ? s.previewNode : null));
  const wrap = useRef<HTMLDivElement>(null);
  const nodo = doc.nodos.find((n) => n.id === data.nodoId);
  if (!nodo) return null;
  const def = getNodeType(nodo.tipo);
  const summary = def.summary(nodo, doc);
  const view = vistaDe(doc, nodo);
  const sz = view.size(def);
  const dx = (def.size.w - sz.w) / 2, dy = (def.size.h - sz.h) / 2;
  const cat = categoriaDe(doc, nodo.categoriaId);
  const estado = estadoDeNodo(doc, nodo);
  const estilo = {
    ...estiloNodo(pv ? { ...nodo, [pv.campo]: pv.hex } : nodo),
    ...(dx || dy ? { left: dx, top: dy } : {}),
  } as CSSProperties;
  return (
    <div
      ref={wrap}
      className={`flow-node tipo-${def.id} vista-${view.id}${selected ? " is-selected" : ""}${flash ? " is-flash" : ""}`}
      style={estilo}
      onDoubleClickCapture={(e) => {
        if (data.ghost) return;
        if ((e.target as HTMLElement).closest(".card-title")) {
          e.stopPropagation();
          useCanvasStore.getState().setRenaming(nodo.id);
        }
      }}
    >
      <Handle id="l" type="source" position={Position.Left} className="h" />
      <Handle id="t" type="source" position={Position.Top} className="h" />
      <view.Render nodo={nodo} def={def} summary={summary} selected={!!selected} cat={cat} estado={estado} />
      <Handle id="r" type="source" position={Position.Right} className="h" />
      <Handle id="b" type="source" position={Position.Bottom} className="h" />
      {renaming && !data.ghost && wrap.current && <RenameInput nodoId={nodo.id} titulo={nodo.titulo} wrap={wrap.current} />}
    </div>
  );
}

export const FlowNodeView = memo(FlowNodeImpl);