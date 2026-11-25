import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { hijos, ruta } from "../../domain/selectors";
import { IconChevron } from "../icons";
import { IconTile } from "../nodeIcons";
import { getNodeType } from "../../nodeTypes/registry";

export function Breadcrumb() {
  const doc = useProjectStore((s) => s.doc)!;
  const level = useCanvasStore((s) => s.levelId);
  const navigate = useCanvasStore((s) => s.navigate);
  const path = ruta(doc, level);
  const items = [{ id: null as string | null, titulo: doc.nombre, nodo: null as (typeof path)[number] | null }, ...path.map((n) => ({ id: n.id as string | null, titulo: n.titulo, nodo: n as (typeof path)[number] | null }))];
  return (
    <nav className="crumbs nowheel" aria-label="Ruta del nivel">
      <ol>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={it.id ?? "root"}>
              {last ? (
                <span className="crumb is-current" aria-current="page">{it.nodo && <IconTile size="sm" nodo={it.nodo} fallback={getNodeType(it.nodo.tipo).icon} />}{it.titulo}</span>
              ) : (
                <button className="crumb" onClick={() => navigate(it.id)} title={`Ir a ${it.titulo}`}>{it.nodo && <IconTile size="sm" nodo={it.nodo} fallback={getNodeType(it.nodo.tipo).icon} />}{it.titulo}</button>
              )}
              {!last && <IconChevron className="crumb-sep" />}
            </li>
          );
        })}
      </ol>
      <span className="crumb-meta">Nivel {items.length} · {hijos(doc, level).length} {hijos(doc, level).length === 1 ? "nodo" : "nodos"}</span>
    </nav>
  );
}
