import { useEffect, useRef, useState } from "react";
import { useColeccion } from "../../store/coleccionStore";
import type { IndiceProyecto } from "../../persistence/coleccion";
import { hrefCanvas, irA } from "../../router";
import { useCanvasStore } from "../../store/canvasStore";
import { exportarProyecto, importarProyectoNuevo, pedirDuplicarProyecto, pedirEliminarProyecto, toast } from "../actions";
import { IconCopy, IconDownload, IconEntrar, IconMore, IconPencil, IconPlus, IconTrash, IconUpload } from "../icons";

const fecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};

/** Botón de icono con tooltip (CSS) y nombre accesible. */
function IconAct({ cls, tip, label, onClick, children, haspopup }: { cls: string; tip: string; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; haspopup?: boolean }) {
  return (
    <button type="button" className={`icon-act ${cls}`} data-tip={tip} aria-label={label} aria-haspopup={haspopup ? "menu" : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

/** Diálogo de nuevo proyecto / renombrar (nombre obligatorio + descripción corta). */
function ProjectForm({ inicial, onClose }: { inicial: IndiceProyecto | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [desc, setDesc] = useState(inicial?.descripcion ?? "");
  const [err, setErr] = useState<string | null>(null);
  const crear = useColeccion((s) => s.crear);
  const renombrar = useColeccion((s) => s.renombrar);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  const enviar = () => {
    const r = inicial ? renombrar(inicial.id, nombre, desc) : crear(nombre, desc);
    if (!r.ok) return setErr(r.error);
    onClose();
    if (!inicial) irA(hrefCanvas(r.id));
    else toast("Proyecto actualizado.");
  };
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="pf-title" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <h2 id="pf-title">{inicial ? "Renombrar proyecto" : "Nuevo proyecto"}</h2>
        <label className="lbl">Nombre
          <input className="inp" value={nombre} onChange={(e) => { setNombre(e.target.value); setErr(null); }} maxLength={80} autoFocus placeholder="Por ejemplo: Plataforma de pagos" />
        </label>
        <label className="lbl">Descripción (opcional)
          <textarea className="inp" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} placeholder="Qué arquitectura se sigue en este proyecto" />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">{inicial ? "Guardar cambios" : "Crear proyecto"}</button>
        </div>
      </form>
    </div>
  );
}

export function ProjectsPage() {
  const lista = useColeccion((s) => s.lista);
  const meta = useColeccion((s) => s.meta);
  const refrescar = useColeccion((s) => s.refrescar);
  const descartarAviso = useColeccion((s) => s.descartarAviso);
  const crearEjemplo = useColeccion((s) => s.crearEjemplo);
  const [form, setForm] = useState<"nuevo" | IndiceProyecto | null>(null);
  const [q, setQ] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { refrescar(); }, [refrescar]);
  useEffect(() => { useCanvasStore.getState().closeDialog(); }, []);

  const filtrada = [...lista]
    .filter((p) => !q.trim() || `${p.nombre} ${p.descripcion}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
  const importInput = (
    <input ref={file} type="file" hidden accept="application/json,.json" data-testid="import-project-input"
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarProyectoNuevo(f); }} />
  );

  return (
    <main className="page">
      <div className="page-in">
        {meta.aviso && (
          <div className="banner" role="status">
            <p>{meta.aviso}</p>
            <button className="btn sm" onClick={descartarAviso}>Entendido</button>
          </div>
        )}
        <header className="page-head">
          <div>
            <h1>Proyectos</h1>
            <p className="muted">{lista.length === 0 ? "Aquí vive cada arquitectura que sigues." : `${lista.length} ${lista.length === 1 ? "proyecto guardado" : "proyectos guardados"} en este navegador.`}</p>
          </div>
          {lista.length > 0 && (
            <div className="row-start">
              <button className="btn" onClick={() => file.current?.click()}><IconUpload /> Importar proyecto</button>
              <button className="btn primary" onClick={() => setForm("nuevo")}><IconPlus /> Nuevo proyecto</button>
            </div>
          )}
        </header>
        {importInput}

        {lista.length === 0 ? (
          <section className="onboard" aria-labelledby="ob-t">
            <h2 id="ob-t">Empieza tu primer proyecto</h2>
            <p>Un proyecto es un canvas donde modelas piezas de arquitectura (servicios, MCP, repos, decisiones), las conectas con flechas que tu mismo configuras (color, puntas y etiquetas) y sigues sus tareas. Todo se guarda en este navegador.</p>
            <div className="row-start">
              <button className="btn primary" onClick={() => setForm("nuevo")}><IconPlus /> Crear proyecto</button>
              <button className="btn" onClick={() => { const r = crearEjemplo(); if (r.ok) irA(hrefCanvas(r.id)); else toast(r.error); }}>Explorar con un ejemplo</button>
              <button className="btn" onClick={() => file.current?.click()}><IconUpload /> Importar desde JSON</button>
            </div>
          </section>
        ) : (
          <>
            {lista.length > 3 && (
              <div className="tools-row">
                <input className="inp search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripción" aria-label="Buscar proyectos" />
              </div>
            )}
            {filtrada.length === 0 ? (
              <div className="empty-block">
                <h2>Ningún proyecto coincide con «{q}»</h2>
                <button className="btn" onClick={() => setQ("")}>Limpiar búsqueda</button>
              </div>
            ) : (
              <table className="ptable">
                <thead>
                  <tr><th scope="col">Proyecto</th><th scope="col" className="col-fecha">Actualizado</th><th scope="col" className="num">Nodos</th><th scope="col" className="num">Tareas abiertas</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {filtrada.map((p) => (
                    <tr key={p.id} data-project={p.id}>
                      <td>
                        <div className="pname">
                          <a href={hrefCanvas(p.id)}><b>{p.nombre}</b></a>
                          <span className="muted">{p.descripcion || "Sin descripción"}</span>
                        </div>
                      </td>
                      <td className="nowrap col-fecha">{fecha(p.actualizadoEn)}</td>
                      <td className="num">{p.nodos}</td>
                      <td className="num">{p.tareasAbiertas}<span className="muted"> de {p.tareas}</span></td>
                      <td>
                        <div className="pact" role="group" aria-label={`Acciones de ${p.nombre}`}>
                          <button className="btn sm primary" aria-label={`Abrir «${p.nombre}»`} onClick={() => irA(hrefCanvas(p.id))}><IconEntrar /> Abrir</button>
                          <IconAct cls="act-sec" tip="Renombrar" label={`Renombrar «${p.nombre}»`} onClick={() => setForm(p)}><IconPencil /></IconAct>
                          <IconAct cls="act-sec" tip="Duplicar" label={`Duplicar «${p.nombre}»`} onClick={() => pedirDuplicarProyecto(p.id)}><IconCopy /></IconAct>
                          <IconAct cls="act-sec" tip="Exportar JSON" label={`Exportar «${p.nombre}» como JSON`} onClick={() => exportarProyecto(p.id)}><IconDownload /></IconAct>
                          <IconAct cls="act-sec danger" tip="Eliminar" label={`Eliminar «${p.nombre}»`} onClick={() => pedirEliminarProyecto(p.id)}><IconTrash /></IconAct>
                          <IconAct
                            cls="act-more" tip="Más acciones" label={`Más acciones de «${p.nombre}»`} haspopup
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              useCanvasStore.getState().openMenu({
                                x: Math.max(8, r.right - 210), y: r.bottom + 6,
                                items: [
                                  { label: "Renombrar", run: () => setForm(p) },
                                  { label: "Duplicar…", run: () => pedirDuplicarProyecto(p.id) },
                                  { label: "Exportar JSON", run: () => exportarProyecto(p.id) },
                                  { label: "Eliminar…", run: () => pedirEliminarProyecto(p.id) },
                                ],
                              });
                            }}
                          ><IconMore /></IconAct>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      {form && <ProjectForm inicial={form === "nuevo" ? null : form} onClose={() => setForm(null)} />}
    </main>
  );
}
