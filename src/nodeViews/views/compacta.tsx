import { EstadoPill } from "../../ui/common/StatusBadge";
import { IconEntrar } from "../../ui/icons";
import { IconTile } from "../../ui/nodeIcons";
import type { NodeViewDef } from "../registry";

/** Una línea: icono, título (1 línea con «…»), estado y contador de tareas. Los subflujos añaden entrar y una barra de tareas. */
export const compacta: NodeViewDef = {
  id: "compacta",
  label: "Compacta",
  description: "Tarjeta pequeña para grafos densos.",
  size: (def) => ({ w: 224, h: def.canContain ? 64 : 44 }),
  Render: ({ nodo, def, summary, estado }) => {
    const sub = !!summary.bar;
    const total = sub ? summary.bar!.reduce((a, s) => a + s.value, 0) : summary.stats.find((s) => s.id === "total")?.value ?? 0;
    const hechas = sub ? summary.bar!.find((s) => s.id === "hecha")?.value ?? 0 : summary.stats.find((s) => s.id === "hecha")?.value ?? 0;
    return (
      <div className={`card card-compact${sub ? " is-sub" : ""}`}>
        <div className="cc-row">
          <IconTile nodo={nodo} fallback={def.icon} />
          <h3 className="card-title" title={nodo.titulo}>{nodo.titulo}</h3>
          {sub && <span className="enter-dot" title="Doble clic para entrar" aria-label="Doble clic para entrar"><IconEntrar /></span>}
          <span className="cc-state" title={estado.nombre} aria-label={`Estado: ${estado.nombre}`}><EstadoPill estado={estado} /></span>
          {!sub && <span className="cc-count" title="Tareas hechas / total">{total ? `${hechas}/${total}` : "–"}</span>}
        </div>
        {sub && (
          <div className="cc-sub">
            <div className="seg-bar" role="img" aria-label={`${total} tareas en el subflujo`}>
              {total === 0 ? <span className="seg seg-empty" style={{ flex: 1 }} /> : summary.bar!.map((s) => s.value > 0 && <span key={s.id} className={`seg seg-${s.tone}`} style={{ flex: s.value }} />)}
            </div>
            <span className="cc-count">{total} {total === 1 ? "tarea" : "tareas"}</span>
          </div>
        )}
      </div>
    );
  },
};