import { EstadoPill } from "../../ui/common/StatusBadge";
import { IconEntrar } from "../../ui/icons";
import { NodeIcon } from "../../ui/nodeIcons";
import type { NodeViewDef } from "../registry";

/** Estilo n8n: icono o imagen grande, título debajo (2 líneas con «…») y estado como punto en la esquina. */
export const icono: NodeViewDef = {
  id: "icono",
  label: "Icono",
  description: "Icono grande con el título debajo, como en n8n.",
  size: () => ({ w: 88, h: 88 }),
  etiquetaAbajo: 56,
  Render: ({ nodo, def, summary, estado }) => {
    const sub = !!summary.bar;
    const total = sub ? summary.bar!.reduce((a, s) => a + s.value, 0) : 0;
    return (
      <div className={`card card-icono${sub ? " is-sub" : ""}`}>
        <div className="ci-art"><NodeIcon nodo={nodo} fallback={def.icon} /></div>
        <span className="ci-state" title={estado.nombre} aria-label={`Estado: ${estado.nombre}`}><EstadoPill estado={estado} /></span>
        {sub && <span className="enter-dot ci-enter" title="Doble clic para entrar" aria-label="Doble clic para entrar"><IconEntrar /></span>}
        {sub && (
          <div className="seg-bar ci-bar" role="img" aria-label={`${total} tareas en el subflujo`}>
            {total === 0 ? <span className="seg seg-empty" style={{ flex: 1 }} /> : summary.bar!.map((s) => s.value > 0 && <span key={s.id} className={`seg seg-${s.tone}`} style={{ flex: s.value }} />)}
          </div>
        )}
        <div className="ci-label">
          <h3 className="card-title" title={nodo.titulo}>{nodo.titulo}</h3>
          {sub && <span className="ci-sub">{total} {total === 1 ? "tarea" : "tareas"}</span>}
        </div>
      </div>
    );
  },
};