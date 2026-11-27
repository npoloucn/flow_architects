import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useColeccion } from "../../store/coleccionStore";
import { eliminarDoc, leerDoc, type IndiceProyecto } from "../../persistence/coleccion";
import { hrefCanvas, irA } from "../../router";
import { useCanvasStore } from "../../store/canvasStore";
import { useAuth } from "../../store/authStore";
import { exportarProyecto, importarProyectoNuevo, pedirDuplicarProyecto, pedirEliminarProyecto, toast } from "../actions";
import { IconClose, IconCopy, IconDownload, IconEntrar, IconLink, IconMore, IconPencil, IconPlus, IconTrash, IconUpload } from "../icons";
import { configurado, ETIQUETA_VISIBILIDAD, SIN_BACKEND, type Visibilidad } from "../../lib/supabase";
import {
  actualizarMeta,
  crearProyecto,
  duplicarProyecto,
  eliminarProyecto,
  listarProyectos,
  type ProyectoNube,
} from "../../persistence/nube";
import { descargarJson, validarTexto } from "../../persistence/localStore";
import { nodeTypeIds } from "../../nodeTypes/registry";
import { escribirMigracion, guardarCache, leerMigracion } from "../../persistence/cache";
import { ProjectDialog } from "./ProjectDialog";

const fecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "â€”" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};

/** BotÃ³n de icono con tooltip (CSS) y nombre accesible. */
function IconAct({ cls, tip, label, onClick, children, haspopup }: { cls: string; tip: string; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; haspopup?: boolean }) {
  return (
    <button type="button" className={`icon-act ${cls}`} data-tip={tip} aria-label={label} aria-haspopup={haspopup ? "menu" : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
}

/** DiÃ¡logo de nuevo proyecto / renombrar (nombre obligatorio + descripciÃ³n corta). */
function ProjectForm({ inicial, onClose }: { inicial: IndiceProyecto | null; onClose: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [desc, setDesc] = useState(inicial?.descripcion ?? "");
  const [err, setErr] = useState<string | null>(null);
  const crear = useColeccion((s) => s.crear);
  const renombrar = useColeccion((s) => s.renombrar);
  useEsc(onClose);
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
        <label className="lbl">DescripciÃ³n (opcional)
          <textarea className="inp" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} placeholder="QuÃ© arquitectura se sigue en este proyecto" />
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

/** Modo local historico: sin backend configurado. */
function ProjectsPageLocal() {
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
        <div className="banner" role="status">
          <p><strong>{SIN_BACKEND}</strong> Configura <span className="mono">VITE_SUPABASE_URL</span> y <span className="mono">VITE_SUPABASE_ANON_KEY</span> para activar cuentas y proyectos compartidos.</p>
        </div>
        {meta.aviso && (
          <div className="banner" role="status">
            <p>{meta.aviso}</p>
            <button className="btn sm" onClick={descartarAviso}>Entendido</button>
          </div>
        )}
        <header className="page-head">
          <div>
            <h1>Proyectos</h1>
            <p className="muted">{lista.length === 0 ? "AquÃ­ vive cada arquitectura que sigues." : `${lista.length} ${lista.length === 1 ? "proyecto guardado" : "proyectos guardados"} en este navegador.`}</p>
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
                <input className="inp search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripciÃ³n" aria-label="Buscar proyectos" />
              </div>
            )}
            {filtrada.length === 0 ? (
              <div className="empty-block">
                <h2>NingÃºn proyecto coincide con Â«{q}Â»</h2>
                <button className="btn" onClick={() => setQ("")}>Limpiar bÃºsqueda</button>
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
                          <span className="muted">{p.descripcion || "Sin descripciÃ³n"}</span>
                        </div>
                      </td>
                      <td className="nowrap col-fecha">{fecha(p.actualizadoEn)}</td>
                      <td className="num">{p.nodos}</td>
                      <td className="num">{p.tareasAbiertas}<span className="muted"> de {p.tareas}</span></td>
                      <td>
                        <div className="pact" role="group" aria-label={`Acciones de ${p.nombre}`}>
                          <button className="btn sm primary" aria-label={`Abrir Â«${p.nombre}Â»`} onClick={() => irA(hrefCanvas(p.id))}><IconEntrar /> Abrir</button>
                          <IconAct cls="act-sec" tip="Renombrar" label={`Renombrar Â«${p.nombre}Â»`} onClick={() => setForm(p)}><IconPencil /></IconAct>
                          <IconAct cls="act-sec" tip="Duplicar" label={`Duplicar Â«${p.nombre}Â»`} onClick={() => pedirDuplicarProyecto(p.id)}><IconCopy /></IconAct>
                          <IconAct cls="act-sec" tip="Exportar JSON" label={`Exportar Â«${p.nombre}Â» como JSON`} onClick={() => exportarProyecto(p.id)}><IconDownload /></IconAct>
                          <IconAct cls="act-sec danger" tip="Eliminar" label={`Eliminar Â«${p.nombre}Â»`} onClick={() => pedirEliminarProyecto(p.id)}><IconTrash /></IconAct>
                          <IconAct
                            cls="act-more" tip="MÃ¡s acciones" label={`MÃ¡s acciones de Â«${p.nombre}Â»`} haspopup
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              useCanvasStore.getState().openMenu({
                                x: Math.max(8, r.right - 210), y: r.bottom + 6,
                                items: [
                                  { label: "Renombrar", run: () => setForm(p) },
                                  { label: "Duplicarâ€¦", run: () => pedirDuplicarProyecto(p.id) },
                                  { label: "Exportar JSON", run: () => exportarProyecto(p.id) },
                                  { label: "Eliminarâ€¦", run: () => pedirEliminarProyecto(p.id) },
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

// ------------------------------ modo nube ------------------------------

function FormNube({ inicial, onClose }: { inicial: ProyectoNube | null; onClose: () => void }) {
  const uid = useAuth((s) => s.user?.id ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [desc, setDesc] = useState(inicial?.descripcion ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEsc(onClose);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setErr("El proyecto necesita un nombre.");
    setOcupado(true);
    try {
      if (inicial) {
        await actualizarMeta(inicial.id, uid, { nombre, descripcion: desc });
        toast("Proyecto actualizado.");
        onClose();
      } else {
        const p = await crearProyecto(uid, { nombre, descripcion: desc });
        onClose();
        irA(hrefCanvas(p.id));
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="pnf-title" onSubmit={enviar}>
        <h2 id="pnf-title">{inicial ? "Renombrar proyecto" : "Nuevo proyecto"}</h2>
        <label className="lbl">Nombre
          <input className="inp" value={nombre} onChange={(e) => { setNombre(e.target.value); setErr(null); }} maxLength={80} autoFocus placeholder="Por ejemplo: Plataforma de pagos" />
        </label>
        <label className="lbl">DescripciÃ³n (opcional)
          <textarea className="inp" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} placeholder="QuÃ© arquitectura se sigue en este proyecto" />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={ocupado}>{ocupado ? "Guardando..." : inicial ? "Guardar cambios" : "Crear proyecto"}</button>
        </div>
      </form>
    </div>
  );
}

function etiquetaRol(p: ProyectoNube): { texto: string; cls: string } {
  if (p.esMio) return { texto: "Tuyo", cls: "mine" };
  if (p.rol === "editor") return { texto: "Compartido Â· editor", cls: "shared" };
  if (p.rol === "viewer") return { texto: "Compartido Â· lectura", cls: "shared" };
  return { texto: "Publico", cls: "public" };
}

function ProjectsPageNube() {
  const uid = useAuth((s) => s.user?.id ?? "");
  const locales = useColeccion((s) => s.lista);
  const refrescarLocales = useColeccion((s) => s.refrescar);
  const [proyectos, setProyectos] = useState<ProyectoNube[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<"nuevo" | ProyectoNube | null>(null);
  const [dialogo, setDialogo] = useState<ProyectoNube | null>(null);
  const [mig, setMig] = useState(leerMigracion());
  const [subiendo, setSubiendo] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const lista = await listarProyectos(uid);
      setProyectos(lista);
      setError(null);
      for (const p of lista) guardarCache(p.id, { doc: p.data, revision: p.revision, actualizadoEn: p.actualizadoEn, ownerId: p.ownerId, visibilidad: p.visibilidad, rol: p.rol });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los proyectos.");
      setProyectos([]);
    }
  }, [uid]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { useCanvasStore.getState().closeDialog(); }, []);

  const pendientesLocales = locales.filter((p) => !mig.subidos.includes(p.id));

  const subirLocales = async () => {
    setSubiendo(true);
    const subidos = [...mig.subidos];
    try {
      for (const item of pendientesLocales) {
        const doc = leerDoc(item.id);
        if (!doc.ok) continue;
        await crearProyecto(uid, { nombre: doc.doc.nombre, descripcion: doc.doc.descripcion, data: doc.doc });
        subidos.push(item.id);
      }
      const nuevo = { subidos, confirmado: false };
      escribirMigracion(nuevo);
      setMig(nuevo);
      await cargar();
      toast("Proyectos subidos a la nube. Revisalos antes de borrar los locales.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron subir los proyectos.");
    } finally {
      setSubiendo(false);
    }
  };

  const borrarLocales = () => {
    for (const id of mig.subidos) eliminarDoc(id);
    const nuevo = { subidos: mig.subidos, confirmado: true };
    escribirMigracion(nuevo);
    setMig(nuevo);
    refrescarLocales();
    toast("Copias locales eliminadas.");
  };

  const refrescar = () => { void cargar(); };

  const crear = (p: ProyectoNube) => {
    setProyectos((prev) => (prev ? [p, ...prev] : [p]));
  };

  const borrar = async (p: ProyectoNube) => {
    try {
      await eliminarProyecto(p.id);
      setProyectos((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
      toast(`Â«${p.nombre}Â» eliminado.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

  const pedirBorrar = (p: ProyectoNube) => {
    useCanvasStore.getState().openDialog({
      title: `Eliminar Â«${p.nombre}Â»`,
      body: <p>Se eliminarÃ¡ el proyecto de la nube con su contenido, miembros y revisiones. <strong>Esta acciÃ³n no se puede deshacer.</strong> Si quieres conservarlo, expÃ³rtalo antes como JSON.</p>,
      actions: [{ label: "Eliminar proyecto", kind: "danger", run: () => { void borrar(p); } }],
    });
  };

  const duplicar = async (p: ProyectoNube) => {
    try {
      const copia = await duplicarProyecto(p, uid);
      crear(copia);
      toast(`Â«${p.nombre}Â» duplicado.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo duplicar.");
    }
  };

  const visibilidad = async (p: ProyectoNube, v: Visibilidad) => {
    try {
      const up = await actualizarMeta(p.id, uid, { visibilidad: v });
      setProyectos((prev) => (prev ? prev.map((x) => (x.id === p.id ? { ...x, visibilidad: up.visibilidad } : x)) : prev));
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cambiar la visibilidad.");
    }
  };

  const importar = async (file: File) => {
    const res = validarTexto(await file.text(), nodeTypeIds());
    if (!res.ok) {
      useCanvasStore.getState().openDialog({
        title: "No se pudo importar el archivo",
        cancelLabel: "Cerrar",
        body: <div><p>El archivo no cumple el esquema del proyecto.</p><ul className="issue-list">{res.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul></div>,
        actions: [],
      });
      return;
    }
    try {
      const p = await crearProyecto(uid, { nombre: res.doc.nombre, descripcion: res.doc.descripcion, data: res.doc });
      crear(p);
      toast(`Â«${p.nombre}Â» importado a la nube.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo importar.");
    }
  };

  const filtrada = (proyectos ?? [])
    .filter((p) => !q.trim() || `${p.nombre} ${p.descripcion}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
  const propios = (proyectos ?? []).filter((p) => p.esMio).length;
  const compartidos = (proyectos ?? []).filter((p) => !p.esMio && (p.rol === "editor" || p.rol === "viewer")).length;

  return (
    <main className="page">
      <div className="page-in">
        {error && <BannerCerrable key={error} warn role="alert"><p>{error}</p><button className="btn sm" onClick={refrescar}>Reintentar</button></BannerCerrable>}

        {pendientesLocales.length > 0 && (
          <div className="banner" role="status">
            <p>
              <strong>Tienes {pendientesLocales.length} {pendientesLocales.length === 1 ? "proyecto" : "proyectos"} guardados en este navegador.</strong> Puedes subirlos a tu cuenta; los originales no se borran hasta que confirmes.
            </p>
            <button className="btn primary sm" onClick={() => void subirLocales()} disabled={subiendo}>{subiendo ? "Subiendo..." : "Subir a la nube"}</button>
          </div>
        )}
        {mig.subidos.length > 0 && !mig.confirmado && pendientesLocales.length === 0 && (
          <div className="banner" role="status">
            <p>Los {mig.subidos.length} proyectos locales ya estan en la nube. Â¿Borrar las copias de este navegador?</p>
            <div className="row-start">
              <button className="btn sm" onClick={() => { const n = { subidos: mig.subidos, confirmado: true }; escribirMigracion(n); setMig(n); }}>Conservarlas</button>
              <button className="btn primary sm" onClick={borrarLocales}>Borrar locales</button>
            </div>
          </div>
        )}

        <header className="page-head">
          <div>
            <h1>Proyectos</h1>
            <p className="muted">
              {proyectos === null ? "Cargando proyectos..." : `${propios} ${propios === 1 ? "tuyo" : "tuyos"} Â· ${compartidos} compartidos Â· ${Math.max(0, (proyectos?.length ?? 0) - propios - compartidos)} publicos`}
            </p>
          </div>
          {(proyectos?.length ?? 0) > 0 && (
            <div className="row-start">
              <button className="btn" onClick={() => file.current?.click()}><IconUpload /> Importar proyecto</button>
              <button className="btn primary" onClick={() => setForm("nuevo")} data-testid="nuevo-proyecto"><IconPlus /> Nuevo proyecto</button>
            </div>
          )}
        </header>
        <input ref={file} type="file" hidden accept="application/json,.json" data-testid="import-nube"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importar(f); }} />

        {proyectos === null ? (
          <div className="splash small" role="status"><span className="spinner" aria-hidden="true" /><p>Cargando proyectos...</p></div>
        ) : proyectos.length === 0 ? (
          <section className="onboard" aria-labelledby="ob-t">
            <h2 id="ob-t">Tu primer proyecto en la nube</h2>
            <p>Aqui viven tus arquitecturas y las que te comparten. Crea uno nuevo o sube los que ya tengas en este navegador.</p>
            <div className="row-start">
              <button className="btn primary" onClick={() => setForm("nuevo")}><IconPlus /> Crear proyecto</button>
              <button className="btn" onClick={() => file.current?.click()}><IconUpload /> Importar desde JSON</button>
            </div>
          </section>
        ) : (
          <>
            {(proyectos.length > 3) && (
              <div className="tools-row">
                <input className="inp search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o descripciÃ³n" aria-label="Buscar proyectos" />
              </div>
            )}
            {filtrada.length === 0 ? (
              <div className="empty-block">
                <h2>NingÃºn proyecto coincide con Â«{q}Â»</h2>
                <button className="btn" onClick={() => setQ("")}>Limpiar bÃºsqueda</button>
              </div>
            ) : (
              <table className="ptable">
                <thead>
                  <tr><th scope="col">Proyecto</th><th scope="col">Acceso</th><th scope="col" className="col-fecha">Actualizado</th><th scope="col" className="num">Nodos</th><th scope="col" className="num">Tareas abiertas</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {filtrada.map((p) => {
                    const badge = etiquetaRol(p);
                    return (
                      <tr key={p.id} data-project={p.id}>
                        <td>
                          <div className="pname">
                            <a href={hrefCanvas(p.id)}><b>{p.nombre}</b></a>
                            <span className="muted">{p.descripcion || "Sin descripciÃ³n"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="acc-cell">
                            <span className={`status-pill ${badge.cls}`}>{badge.texto}</span>
                            {p.esMio && (
                              <select className="inp sm" value={p.visibilidad} onChange={(e) => void visibilidad(p, e.target.value as Visibilidad)} aria-label={`Visibilidad de ${p.nombre}`}>
                                {(["privado", "enlace", "publico"] as Visibilidad[]).map((v) => <option key={v} value={v}>{ETIQUETA_VISIBILIDAD[v]}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="nowrap col-fecha">{fecha(p.actualizadoEn)}</td>
                        <td className="num">{p.nodos}</td>
                        <td className="num">{p.tareasAbiertas}<span className="muted"> de {p.tareas}</span></td>
                        <td>
                          <div className="pact" role="group" aria-label={`Acciones de ${p.nombre}`}>
                            <button className="btn sm primary" aria-label={`Abrir Â«${p.nombre}Â»`} onClick={() => irA(hrefCanvas(p.id))}><IconEntrar /> Abrir</button>
                            <IconAct cls="act-sec" tip="Revisiones y compartir" label={`Panel de Â«${p.nombre}Â»`} onClick={() => setDialogo(p)}><IconLink /></IconAct>
                            {p.esMio && <IconAct cls="act-sec" tip="Renombrar" label={`Renombrar Â«${p.nombre}Â»`} onClick={() => setForm(p)}><IconPencil /></IconAct>}
                            <IconAct cls="act-sec" tip="Duplicar" label={`Duplicar Â«${p.nombre}Â»`} onClick={() => void duplicar(p)}><IconCopy /></IconAct>
                            <IconAct cls="act-sec" tip="Exportar JSON" label={`Exportar Â«${p.nombre}Â» como JSON`} onClick={() => { descargarJson(p.data); toast(`Â«${p.nombre}Â» exportado como JSON.`); }}><IconDownload /></IconAct>
                            {p.esMio && <IconAct cls="act-sec danger" tip="Eliminar" label={`Eliminar Â«${p.nombre}Â»`} onClick={() => pedirBorrar(p)}><IconTrash /></IconAct>}
                            <IconAct
                              cls="act-more" tip="MÃ¡s acciones" label={`MÃ¡s acciones de Â«${p.nombre}Â»`} haspopup
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                useCanvasStore.getState().openMenu({
                                  x: Math.max(8, r.right - 210), y: r.bottom + 6,
                                  items: [
                                    { label: "Abrir", run: () => irA(hrefCanvas(p.id)) },
                                    { label: "Revisiones y compartir", run: () => setDialogo(p) },
                                    ...(p.esMio ? [{ label: "Renombrar", run: () => setForm(p) }, { label: "Eliminarâ€¦", run: () => pedirBorrar(p) }] : []),
                                    { label: "Duplicar", run: () => { void duplicar(p); } },
                                    { label: "Exportar JSON", run: () => descargarJson(p.data) },
                                  ],
                                });
                              }}
                            ><IconMore /></IconAct>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
      {form && <FormNube inicial={form === "nuevo" ? null : form} onClose={() => setForm(null)} />}
      {dialogo && (
        <ProjectDialog
          proyectoId={dialogo.id}
          nombre={dialogo.nombre}
          esMio={dialogo.esMio}
          puedeEditar={dialogo.rol === "owner" || dialogo.rol === "editor"}
          visibilidad={dialogo.visibilidad}
          revision={dialogo.revision}
          onClose={() => setDialogo(null)}
          onCambio={refrescar}
        />
      )}
    </main>
  );
}

/** Aviso persistente en pagina con cierre (X) a la derecha. */
function BannerCerrable({ children, warn = false, role = "status" }: { children: ReactNode; warn?: boolean; role?: "status" | "alert" }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className={`banner${warn ? " warn" : ""}`} role={role}>
      {children}
      <button type="button" className="icon-btn banner-x" onClick={() => setVisible(false)} aria-label="Cerrar aviso" title="Cerrar aviso"><IconClose /></button>
    </div>
  );
}

export function ProjectsPage() {
  return configurado ? <ProjectsPageNube /> : <ProjectsPageLocal />;
}
