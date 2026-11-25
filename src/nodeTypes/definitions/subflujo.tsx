import { contarPorEstado, hijos, primeraLinea, profundidad, tareasDeSubarbol, ESTADO_TAREA_PLURAL } from "../../domain/selectors";
import { ESTADOS_TAREA } from "../../domain/schema";
import { IconEntrar, IconSubflujo } from "../../ui/icons";
import { IconTile } from "../../ui/nodeIcons";
import { EstadoPill } from "../../ui/common/StatusBadge";
import type { NodeCardProps, NodeTypeDef, Stat } from "../registry";
import { respShort } from "./common";

function SubflowCard({ nodo, summary, cat, estado }: NodeCardProps) {
  const bar = summary.bar ?? [];
  const total = bar.reduce((a, s) => a + s.value, 0);
  const nodos = summary.stats.find((s) => s.id === "nodos")?.value ?? 0;
  return (
    <div className="card card-sub">
      <div className="sub-band">
        <span className="card-kind"><IconSubflujo /> Subflujo</span>
        <span className="enter-chip"><IconEntrar /> Doble clic para entrar</span>
      </div>
      <div className="sub-body">
        <div className="card-head">
          <span className="card-kind muted-ink"><IconTile nodo={nodo} fallback={<IconSubflujo />} /> {cat?.nombre ?? "Nodo"}</span>
          <EstadoPill estado={estado} />
        </div>
        <h3 className="card-title">{nodo.titulo}</h3>
        <p className="card-desc">{primeraLinea(nodo.descripcion)}</p>
        <div className="sub-summary" aria-label="Resumen de tareas del subflujo">
          <div className="seg-bar" role="img" aria-label={`${total} tareas en el subflujo`}>
            {total === 0 ? <span className="seg seg-empty" style={{ flex: 1 }} /> :
              bar.map((s) => s.value > 0 && <span key={s.id} className={`seg seg-${s.tone}`} style={{ flex: s.value }} />)}
          </div>
          <ul className="sub-counts">
            {bar.map((s) => (
              <li key={s.id} className={s.value === 0 ? "is-zero" : ""} title={`${s.value} ${s.label}`}>
                <i className="dot" data-st={s.tone} /><b>{s.value}</b><span>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card-foot">
          <span><b>{nodos}</b> {nodos === 1 ? "nodo interno" : "nodos internos"}</span>
          <span className="foot-owner" title={nodo.responsables.join(", ")}>{respShort(nodo.responsables)}</span>
        </div>
      </div>
    </div>
  );
}

export const subflujo: NodeTypeDef = {
  id: "subflujo",
  label: "Nodo subflujo",
  description: "Contiene su propio canvas. Agrega las tareas de todo lo que hay dentro.",
  icon: <IconSubflujo />,
  color: "var(--type-subflujo)",
  size: { w: 288, h: 232 },
  defaults: () => ({ titulo: "Nuevo subflujo", descripcion: "Agrupa las piezas de esta área.", estadoId: "idea", responsables: [] }),
  fields: [
    { id: "nodos", label: "Nodos internos", render: (n, d) => hijos(d, n.id).length },
    { id: "nivel", label: "Profundidad", render: (n, d) => `Nivel ${profundidad(d, n.id) + 1}` },
  ],
  canContain: true,
  Card: SubflowCard,
  summary: (n, doc) => {
    const c = contarPorEstado(tareasDeSubarbol(doc, n.id));
    const bar: Stat[] = ESTADOS_TAREA.map((e) => ({ id: e, label: ESTADO_TAREA_PLURAL[e], value: c[e], tone: e }));
    return { bar, stats: [...bar, { id: "nodos", label: "nodos internos", value: hijos(doc, n.id).length, tone: "neutral" }] };
  },
  onDoubleClick: (n, a) => a.openLevel(n.id),
  actions: [{ id: "abrir", label: "Abrir subflujo", run: (n, a) => a.openLevel(n.id) }],
};


