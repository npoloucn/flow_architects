import { useReactFlow, useStore } from "@xyflow/react";
import { IconFit, IconMinus, IconPlus } from "../icons";

export function ZoomControls({ onFit }: { onFit: () => void }) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div className="zoomctl nowheel" role="group" aria-label="Controles de zoom">
      <button onClick={() => rf.zoomOut({ duration: 200 })} aria-label="Alejar" title="Alejar"><IconMinus /></button>
      <span className="zoom-val" aria-live="off">{Math.round(zoom * 100)}%</span>
      <button onClick={() => rf.zoomIn({ duration: 200 })} aria-label="Acercar" title="Acercar"><IconPlus /></button>
      <i className="sep" />
      <button onClick={onFit} aria-label="Encuadrar todo" title="Encuadrar todo"><IconFit /></button>
    </div>
  );
}
