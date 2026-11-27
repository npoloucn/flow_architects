import { useEffect, useRef, useState, type ReactNode } from "react";
import { useProjectStore } from "../store/projectStore";
import { useCanvasStore } from "../store/canvasStore";
import { useAuth } from "../store/authStore";
import { configurado } from "../lib/supabase";
import { esIdNube } from "../persistence/nube";
import { hrefCanvas, hrefDocumentacion, hrefProyectos, hrefTareas, type Route } from "../router";
import { exportar, importarArchivo } from "./actions";
import { IconDownload, IconLink, IconLogout, IconMoon, IconMore, IconRedo, IconSun, IconUndo, IconUpload } from "./icons";
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

/** Se pliega a un menu cuando la barra no alcanza para las acciones secundarias. */
const PLEGAR_PX = 900;
function useAngosto(px: number) {
  const q = `(max-width: ${px}px)`;
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setV(m.matches);
    h();
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, [q]);
  return v;
}

/** Menu desplegable accesible: flechas, Esc devuelve el foco, clic fuera y Tab cierran. */
function Menu({ trigger, label, title, className, testid, children }: {
  trigger: ReactNode; label: string; title: string; className: string; testid?: string;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const cerrar = () => setAbierto(false);
  const items = () => Array.from(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  useEffect(() => {
    if (!abierto) return;
    items()[0]?.focus();
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); btn.current?.focus(); return; }
    if (e.key === "Tab") { setAbierto(false); return; }
    const l = items();
    const i = l.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); l[(i + 1) % l.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); l[(i - 1 + l.length) % l.length]?.focus(); }
    if (e.key === "Home") { e.preventDefault(); l[0]?.focus(); }
    if (e.key === "End") { e.preventDefault(); l[l.length - 1]?.focus(); }
  };
  return (
    <div className="menu-wrap" ref={raiz} onKeyDown={teclas}>
      <button ref={btn} type="button" className={className} aria-haspopup="menu" aria-expanded={abierto}
        title={title} aria-label={label} data-testid={testid} onClick={() => setAbierto((v) => !v)}>
        {trigger}
      </button>
      {abierto && <div className="menu" role="menu" aria-label={label}>{children(cerrar)}</div>}
    </div>
  );
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
  const plegado = useAngosto(PLEGAR_PX);
  const dark = theme === "dark";
  const enProyecto = route.name !== "proyectos" && !!doc;
  const enNube = configurado && enProyecto && !!projectId && esIdNube(projectId) && modo !== "local";
  const abiertas = doc ? doc.tareas.filter((t) => t.estado !== "hecha").length : 0;
  const cur = (n: string) => (route.name === n ? "page" : undefined);
  const email = user?.email ?? "";
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const nombreMeta = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const nombre = nombreMeta?.trim() || email.split("@")[0] || "Cuenta";
  const inicial = nombre.slice(0, 1).toUpperCase();
  const editable = enProyecto && modo !== "lectura";
  const tituloTema = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  const iconoTema = dark ? <IconSun /> : <IconMoon />;
  return (
    <header className="appbar">
      <div className="brand">
        <a href={hrefProyectos()} className="brand-link"><b>FlowArquitecture</b></a>
        {enProyecto && <span className="muted crumb-proj" title={doc!.nombre}>/ {doc!.nombre}</span>}
        {enNube && <EstadoNube />}
      </div>
      <nav className="mainnav" aria-label="Navegacion principal">
        <a href={hrefProyectos()} aria-current={cur("proyectos")}>Proyectos</a>
        {enProyecto && <a href={hrefCanvas(doc!.id)} aria-current={cur("canvas")}>Canvas</a>}
        {enProyecto && <a href={hrefTareas(doc!.id)} aria-current={cur("tareas")}>Tareas <span className="count">{abiertas}</span></a>}
        {enProyecto && <a href={hrefDocumentacion(doc!.id)} aria-current={cur("documentacion")} aria-label={`Documentación, ${doc!.documentos.length}`}><span className="nav-full">Documentación</span><span className="nav-short" aria-hidden="true">Docs</span> <span className="count">{doc!.documentos.length}</span></a>}
      </nav>
      <div className="bar-actions">
        {enNube && (
          <button className="bar-btn" onClick={() => setPanel(true)} title="Compartir y revisiones" aria-label="Panel del proyecto" data-testid="panel-proyecto">
            <IconLink /><span className="bar-lbl">Proyecto</span>
          </button>
        )}
        {editable && (
          <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarArchivo(f); }} />
        )}
        {!plegado ? (
          <>
            {editable && (
              <>
                <i className="sep" />
                <button className="bar-btn" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer"><IconUndo /><span className="bar-lbl">Deshacer</span></button>
                <button className="bar-btn" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer"><IconRedo /><span className="bar-lbl">Rehacer</span></button>
                <i className="sep" />
                <button className="bar-btn" onClick={() => file.current?.click()} title="Importar JSON y reemplazar este proyecto" aria-label="Importar JSON"><IconUpload /><span className="bar-lbl">Importar</span></button>
                <button className="bar-btn" onClick={exportar} title="Exportar proyecto a JSON (Ctrl+S)" aria-label="Exportar JSON"><IconDownload /><span className="bar-lbl">Exportar</span></button>
              </>
            )}
            {(editable || enNube) && <i className="sep" />}
            <button className="bar-btn" onClick={toggleTheme} aria-pressed={dark} title={tituloTema} aria-label={tituloTema}>
              {iconoTema}<span className="bar-lbl">{dark ? "Modo claro" : "Modo oscuro"}</span>
            </button>
          </>
        ) : (
          <Menu className="bar-btn" label="Mas acciones" title="Mas acciones" testid="mas-acciones" trigger={<IconMore />}>
            {(cerrar) => (
              <>
                {editable && (
                  <>
                    <button role="menuitem" className="menu-item" disabled={!canUndo} onClick={() => { undo(); cerrar(); }}><IconUndo />Deshacer</button>
                    <button role="menuitem" className="menu-item" disabled={!canRedo} onClick={() => { redo(); cerrar(); }}><IconRedo />Rehacer</button>
                    <button role="menuitem" className="menu-item" onClick={() => { cerrar(); file.current?.click(); }}><IconUpload />Importar JSON</button>
                    <button role="menuitem" className="menu-item" onClick={() => { exportar(); cerrar(); }}><IconDownload />Exportar JSON</button>
                    <hr className="menu-sep" />
                  </>
                )}
                <button role="menuitem" className="menu-item" onClick={() => { toggleTheme(); cerrar(); }}>{iconoTema}{tituloTema}</button>
              </>
            )}
          </Menu>
        )}
        {configurado && user && (
          <>
            <i className="sep" />
            <Menu className="bar-btn user-btn" label={`Cuenta de ${nombre}`} title={email} testid="menu-usuario"
              trigger={<><span className="avatar" aria-hidden="true">{inicial}</span><span className="user-name">{nombre}</span></>}>
              {() => (
                <>
                  <div className="menu-id"><b>{nombre}</b><span className="muted small">{email}</span></div>
                  <hr className="menu-sep" />
                  <button role="menuitem" className="menu-item" onClick={() => void salir()} data-testid="salir"><IconLogout />Cerrar sesion</button>
                </>
              )}
            </Menu>
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