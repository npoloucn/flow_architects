import { useReactFlow } from "@xyflow/react";
import { useCanvasStore } from "../../store/canvasStore";
import { listNodeTypes } from "../../nodeTypes/registry";
import { IconGrip, IconSidebar } from "../icons";
import { crearNodoEn, crearZonaEn, report } from "../actions";
import { useProjectStore } from "../../store/projectStore";
import { listViews } from "../../nodeViews/registry";
import { presetDe } from "../nodeIcons";
import { CategoriesDialog } from "./CategoriesDialog";
import { EstadosDialog } from "./EstadosDialog";
import { EstadoDot } from "../common/StatusBadge";
import { estadosOrdenados } from "../../domain/selectors";

export function Palette() {
  const open = useCanvasStore((s) => s.paletteOpen);
  const toggle = useCanvasStore((s) => s.togglePalette);
  const rf = useReactFlow();
  const doc = useProjectStore((s) => s.doc)!;
  const catSel = useCanvasStore((s) => s.categoriaSel);
  const cats = doc.categorias;
  const selId = cats.some((c) => c.id === catSel) ? catSel! : (cats.find((c) => c.id === "general") ?? cats[0]).id;

  const addAtCenter = (tipo: string) => {
    const stage = document.querySelector(".stage") as HTMLElement;
    const r = stage.getBoundingClientRect();
    const def = listNodeTypes().find((d) => d.id === tipo)!;
    const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    crearNodoEn(tipo, { x: Math.round(p.x - def.size.w / 2 + Math.random() * 40), y: Math.round(p.y - def.size.h / 2 + Math.random() * 40) }, false);
  };

  if (!open) {
    return (
      <aside className="palette is-collapsed">
        <button className="icon-btn" onClick={toggle} aria-label="Abrir paleta" title="Abrir paleta"><IconSidebar /></button>
      </aside>
    );
  }
  return (
    <aside className="palette" aria-label="Paleta de nodos">
      <header className="pal-head">
        <h1>Paleta</h1>
        <button className="icon-btn" onClick={toggle} aria-label="Colapsar paleta" title="Colapsar paleta"><IconSidebar /></button>
      </header>

      <section>
        <h2>Nodos</h2>
        <p className="pal-note">Arrastra al canvas o haz clic para añadir al nivel actual. También: doble clic en el fondo o clic derecho.</p>
        <ul className="pal-list">
          {listNodeTypes().map((d) => (
            <li key={d.id}>
              <button
                className="pal-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-flow-node", d.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => addAtCenter(d.id)}
              >
                <span className="pal-ico" style={{ background: d.color }}>{d.icon}</span>
                <span className="pal-txt"><b>{d.label}</b><small>{d.description}</small></span>
                <IconGrip className="pal-grip" />
              </button>
            </li>
          ))}
          <li>
            <button
              className="pal-item" draggable
              onDragStart={(e) => { e.dataTransfer.setData("application/x-flow-zone", "zona"); e.dataTransfer.effectAllowed = "copy"; }}
              onClick={() => { const stage = document.querySelector(".stage") as HTMLElement; const r = stage.getBoundingClientRect(); const p = rf.screenToFlowPosition({ x: r.left + r.width / 2 - 120, y: r.top + r.height / 2 - 90 }); crearZonaEn({ x: Math.round(p.x), y: Math.round(p.y) }); }}
            >
              <span className="pal-ico pal-zona" aria-hidden />
              <span className="pal-txt"><b>Zona</b><small>Rectángulo de color con título para agrupar nodos.</small></span>
              <IconGrip className="pal-grip" />
            </button>
          </li>
        </ul>
      </section>

      <section>
        <h2>Categorías</h2>
        <p className="pal-note">Los nodos nuevos toman la categoría marcada.</p>
        <ul className="cat-list">
          {cats.map((c) => { const P = presetDe(c.icono); return (
            <li key={c.id}><button className="cat-item" aria-pressed={c.id === selId} onClick={() => useCanvasStore.getState().setCategoriaSel(c.id)}><span className="cat-ico" style={{ borderColor: c.color }}>{P ? <P.Svg /> : null}</span>{c.nombre}</button></li>
          ); })}
        </ul>
        <button className="btn sm" onClick={() => useCanvasStore.getState().setCatDialog(true)}>Administrar categorías…</button>
      </section>

      <section>
        <h2>Vista de los nodos</h2>
        <p className="pal-note">Cómo se dibujan todos los nodos del proyecto. Cada nodo puede tener la suya.</p>
        <div className="seg-views" role="group" aria-label="Vista de los nodos">
          {listViews().map((v) => <button key={v.id} aria-pressed={doc.vistaNodo === v.id} title={v.description} onClick={() => report(useProjectStore.getState().establecerVista(v.id))}>{v.label}</button>)}
        </div>
      </section>

      <section>
        <h2>Flechas</h2>
        <p className="pal-note">Arrastra desde cualquiera de los cuatro puntos de un nodo hasta otro para crear una flecha; al soltar se abre su panel para elegir color, puntas, estilo y textos.</p>
      </section>

      <section>
        <h2>Estados de los nodos</h2>
        <p className="pal-note">Nombre, color y orden del proyecto. Los nodos eligen uno por su id.</p>
        <ul className="legend">
          {estadosOrdenados(doc).map((e) => <li key={e.id}><EstadoDot color={e.color} />{e.nombre}</li>)}
        </ul>
        <button className="btn sm" onClick={() => useCanvasStore.getState().setEstadosDialog(true)}>Administrar estados…</button>
      </section>

      <section>
        <h2>Estados de las tareas</h2>
        <p className="pal-note">Las tareas conservan sus cuatro estados propios.</p>
        <ul className="legend">
          {(["pendiente", "en-curso", "hecha", "bloqueada"] as const).map((s) => (
            <li key={s}><i className="dot" data-st={s} />{{ pendiente: "Pendiente", "en-curso": "En curso", hecha: "Hecha", bloqueada: "Bloqueada" }[s]}</li>
          ))}
        </ul>
      </section>
      <CategoriesDialog />
      <EstadosDialog />
    </aside>
  );
}
