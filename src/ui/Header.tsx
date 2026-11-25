import { useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { useCanvasStore } from "../store/canvasStore";
import { useAuth } from "../store/authStore";
import { configurado } from "../lib/supabase";
import { esIdNube } from "../persistence/nube";
import { hrefCanvas, hrefProyectos, hrefTareas, type Route } from "../router";
import { exportar, importarArchivo } from "./actions";
import { IconDownload, IconLink, IconLogout, IconMoon, IconRedo, IconSun, IconUndo, IconUpload } from "./icons";
import { ProjectDialog } from "./projects/ProjectDialog";

function EstadoNube() {
  const modo = useProjectStore((s) => s.modo);
  const guardando = useProjectStore((s) => s.guardando);
  const sinConexion = useProjectStore((s) => s.sinConexion);
  const ultimo = useProjectStore((s) => s.ultimoGuardado);
  if (modo === "local") return null;
  if (sinConexion) return <span className="sync-note offline" title="Sin conexion: no se guarda">Sin conexion</span>;
  if (modo === "lectura") return <span className="sync-note" title="Solo lectura">Solo lectura</span>;
  if (guardando) return <span className="sync-note working" role="status">Guardando...</span>;
  return <span className="sync-note" title={ultimo ? `Ultimo guardado: ${new Date(ultimo).toLocaleTimeString("es-CO")}` : "Sincronizado con la nube"}>En la nube</span>;
}

export function Header({ route }: { route: Route }) {
  const doc = useProjectStore((s) => s.doc);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const modo = useProjectStore((s) => s.modo);
  const projectId = useProjectStore((s) => s.projectId);
  const revision = useProjectStore((s) => s.revision);
  const miRol = useProjectStore((s) => s.miRol);
  const visibilidad = useProjectStore((s) => s.visibilidad);
  const user = useAuth((s) => s.user);
  const salir = useAuth((s) => s.salir);
  const theme = useCanvasStore((s) => s.theme);
  const toggleTheme = useCanvasStore((s) => s.toggleTheme);
  const [panel, setPanel] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dark = theme === "dark";
  const enProyecto = route.name !== "proyectos" && !!doc;
  const enNube = configurado && enProyecto && !!projectId && esIdNube(projectId) && modo !== "local";
  const abiertas = doc ? doc.tareas.filter((t) => t.estado !== "hecha").length : 0;
  const cur = (n: string) => (route.name === n ? "page" : undefined);
  const inicial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <header className="appbar">
      <div className="brand">
        <a href={hrefProyectos()} className="brand-link"><b>FlowArquitecture</b></a>
        {enProyecto && <span className="muted crumb-proj">/ {doc!.nombre}</span>}
      </div>
      <nav className="mainnav" aria-label="Navegacion principal">
        <a href={hrefProyectos()} aria-current={cur("proyectos")}>Proyectos</a>
        {enProyecto && <a href={hrefCanvas(doc!.id)} aria-current={cur("canvas")}>Canvas</a>}
        {enProyecto && <a href={hrefTareas(doc!.id)} aria-current={cur("tareas")}>Tareas <span className="count">{abiertas}</span></a>}
      </nav>
      <div className="bar-actions">
        {enNube && <EstadoNube />}
        {enNube && (
          <button className="bar-btn" onClick={() => setPanel(true)} title="Compartir y revisiones" aria-label="Panel del proyecto" data-testid="panel-proyecto">
            <IconLink /><span>Proyecto</span>
          </button>
        )}
        {enProyecto && modo !== "lectura" && (
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
        {configurado && user && (
          <>
            <i className="sep" />
            <span className="user-chip" title={user.email ?? ""}>
              <span className="avatar" aria-hidden="true">{inicial}</span>
              <span className="user-email">{user.email}</span>
            </span>
            <button className="bar-btn" onClick={() => void salir()} title="Cerrar sesion" aria-label="Cerrar sesion" data-testid="salir"><IconLogout /><span>Salir</span></button>
          </>
        )}
      </div>
      {panel && doc && projectId && (
        <ProjectDialog
          proyectoId={projectId}
          nombre={doc.nombre}
          esMio={miRol === "owner"}
          puedeEditar={miRol === "owner" || miRol === "editor"}
          visibilidad={visibilidad ?? "privado"}
          revision={revision ?? 1}
          onClose={() => setPanel(false)}
          onCambio={() => { /* el store ya sincroniza revision/visibilidad */ }}
        />
      )}
    </header>
  );
}
