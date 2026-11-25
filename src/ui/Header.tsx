import { useRef } from "react";
import { useProjectStore } from "../store/projectStore";
import { useCanvasStore } from "../store/canvasStore";
import { hrefCanvas, hrefProyectos, hrefTareas, type Route } from "../router";
import { exportar, importarArchivo } from "./actions";
import { IconDownload, IconMoon, IconRedo, IconSun, IconUndo, IconUpload } from "./icons";

export function Header({ route }: { route: Route }) {
  const doc = useProjectStore((s) => s.doc);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const theme = useCanvasStore((s) => s.theme);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const file = useRef<HTMLInputElement>(null);
  const dark = theme === "dark";
  const enProyecto = route.name !== "proyectos" && !!doc;
  const abiertas = doc ? doc.tareas.filter((t) => t.estado !== "hecha").length : 0;
  const cur = (n: string) => (route.name === n ? "page" : undefined);
  return (
    <header className="appbar">
      <div className="brand">
        <a href={hrefProyectos()} className="brand-link"><b>FlowArquitecture</b></a>
        {enProyecto && <span className="muted crumb-proj">/ {doc!.nombre}</span>}
      </div>
      <nav className="mainnav" aria-label="Navegación principal">
        <a href={hrefProyectos()} aria-current={cur("proyectos")}>Proyectos</a>
        {enProyecto && <a href={hrefCanvas(doc!.id)} aria-current={cur("canvas")}>Canvas</a>}
        {enProyecto && <a href={hrefTareas(doc!.id)} aria-current={cur("tareas")}>Tareas <span className="count">{abiertas}</span></a>}
      </nav>
      <div className="bar-actions">
        {enProyecto && (
          <>
            <button className="bar-btn" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer"><IconUndo /><span>Deshacer</span></button>
            <button className="bar-btn" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer"><IconRedo /><span>Rehacer</span></button>
            <i className="sep" />
            <button className="bar-btn" onClick={() => file.current?.click()} title="Importar JSON y reemplazar este proyecto" aria-label="Importar JSON"><IconUpload /><span>Importar</span></button>
            <button className="bar-btn" onClick={exportar} title="Exportar proyecto a JSON (Ctrl+S)" aria-label="Exportar JSON"><IconDownload /><span>Exportar</span></button>
            <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-input"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarArchivo(f); }} />
            <i className="sep" />
          </>
        )}
        <button className="bar-btn" onClick={toggleTheme} aria-pressed={dark} title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
          {dark ? <IconSun /> : <IconMoon />}<span>{dark ? "Modo claro" : "Modo oscuro"}</span>
        </button>
      </div>
    </header>
  );
}
