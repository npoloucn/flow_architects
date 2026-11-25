import { primeraLinea } from "../../domain/selectors";
import { IconBasico } from "../../ui/icons";
import { IconTile } from "../../ui/nodeIcons";
import { Dot, EstadoPill } from "../../ui/common/StatusBadge";
import type { NodeCardProps, NodeTypeDef } from "../registry";
import { resumenTareasPropias, respShort } from "./common";

function BasicCard({ nodo, summary, cat, estado }: NodeCardProps) {
  const total = summary.stats.find((s) => s.id === "total")?.value ?? 0;
  const hechas = summary.stats.find((s) => s.id === "hecha")?.value ?? 0;
  const bloq = summary.stats.find((s) => s.id === "bloqueada")?.value ?? 0;
  return (
    <div className="card card-basic">
      <div className="card-head">
        <span className="card-kind"><IconTile nodo={nodo} fallback={<IconBasico />} /> {cat?.nombre ?? "Nodo"}</span>
        <EstadoPill estado={estado} />
      </div>
      <h3 className="card-title">{nodo.titulo}</h3>
      <p className="card-desc">{primeraLinea(nodo.descripcion)}</p>
      <div className="card-foot">
        <span className="foot-stats">
          {total ? <span>{hechas}/{total} tareas hechas</span> : <span className="muted">Sin tareas</span>}
          {bloq > 0 && <span className="foot-block"><Dot st="bloqueada" />{bloq}</span>}
        </span>
        <span className="foot-owner" title={nodo.responsables.join(", ")}>{respShort(nodo.responsables)}</span>
      </div>
    </div>
  );
}


export const basico: NodeTypeDef = {
  id: "basico",
  label: "Nodo básico",
  description: "Pieza de arquitectura con ficha, estado, responsables y tareas.",
  icon: <IconBasico />,
  color: "var(--type-basico)",
  size: { w: 272, h: 156 },
  defaults: () => ({ titulo: "Nuevo nodo", descripcion: "Describe qué hace esta pieza.", estadoId: "idea", responsables: [] }),
  fields: [],
  Card: BasicCard,
  summary: resumenTareasPropias,
  onDoubleClick: (n, a) => a.select(n.id),
};


