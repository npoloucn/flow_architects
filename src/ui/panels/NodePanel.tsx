import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { getNodeType, listNodeTypes, type NodeActions } from "../../nodeTypes/registry";
import { ESTADOS_TAREA, LIMITE_DESCRIPCION_TAREA, type Documento, type Tarea } from "../../domain/schema";
import { ESTADO_TAREA_LABEL, ESTADO_TAREA_PLURAL, contarPorEstado, estadoDeNodo, estadosOrdenados, tareasDeNodo } from "../../domain/selectors";
import type { DocInput } from "../../domain/commands";
import { Markdown } from "../common/Markdown";
import { Dot, EstadoPill } from "../common/StatusBadge";
import { DescripcionExpandible, DescripcionTarea } from "../common/TaskDescription";
import { IconClose, IconCopy, IconFile, IconLink, IconTrash } from "../icons";
import { pedirCambiarTipo, pedirDuplicar, pedirEliminarNodo, report } from "../actions";
import { ChipsEditor, InlineDelete, MarkdownEditor, TextCommit } from "./editors";
import { IconField } from "./IconPicker";
import { NodeColorField } from "./ColorField";
import { listViews } from "../../nodeViews/registry";
import { IconTile } from "../nodeIcons";

const PRIO_LABEL: Record<Tarea["prioridad"], string> = { alta: "Alta", media: "Media", baja: "Baja" };
const fechaCorta = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

/** Responsables compactos: chips + «Agregar» que despliega el campo. */
function RespInline({ value, onChange, lectura }: { value: string[]; onChange: (v: string[]) => void; lectura: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="tk-resp">
      {value.length === 0 && lectura && <span className="muted small">Sin asignar</span>}
      {value.map((r) => (
        <span key={r} className="chip">{r}{!lectura && <button type="button" aria-label={`Quitar a ${r}`} onClick={() => onChange(value.filter((x) => x !== r))}>×</button>}</span>
      ))}
      {!lectura && !abierto && <button type="button" className="link-btn tk-add" onClick={() => setAbierto(true)}>{value.length ? "+ Agregar" : "+ Asignar responsable"}</button>}
      {!lectura && abierto && (
        <span className="add-row tk-resp-add">
          <input className="inp sm" autoFocus value={draft} placeholder="Nombre" aria-label="Agregar responsable" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { e.stopPropagation(); setDraft(""); setAbierto(false); } }} />
          <button type="button" className="btn sm" onClick={add} disabled={!draft.trim()}>Agregar</button>
          <button type="button" className="link-btn" onClick={() => { setDraft(""); setAbierto(false); }}>Listo</button>
        </span>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: Tarea }) {
  const { actualizarTarea, eliminarTarea, ciclarTarea } = useProjectStore.getState();
  const lectura = useProjectStore((s) => s.modo) === "lectura";
  const upd = (p: Parameters<typeof actualizarTarea>[1]) => report(actualizarTarea(t.id, p));
  return (
    <li className={`tk${t.estado === "hecha" ? " is-done" : ""}`}>
      <div className="tk-head">
        {lectura ? (
          <span className="tk-dot"><Dot st={t.estado} /></span>
        ) : (
          <button type="button" className="task-state" onClick={() => report(ciclarTarea(t.id))} title="Cambiar al siguiente estado" aria-label={`${ESTADO_TAREA_LABEL[t.estado]}. Cambiar estado de ${t.titulo}`}><Dot st={t.estado} /></button>
        )}
        <div className="tk-title">
          {lectura
            ? <b>{t.titulo}</b>
            : <TextCommit value={t.titulo} label="Título de la tarea" className="inp bare tk-title-inp" onCommit={(v) => { const r = report(actualizarTarea(t.id, { titulo: v })); return r.ok ? null : r.error; }} />}
        </div>
        <span className={`prio prio-${t.prioridad}`}>{PRIO_LABEL[t.prioridad]}</span>
        {!lectura && <InlineDelete subject={`tarea ${t.titulo}`} onConfirm={() => report(eliminarTarea(t.id))} />}
      </div>

      <dl className="tk-meta">
        <div><dt>Estado</dt><dd>{lectura ? ESTADO_TAREA_LABEL[t.estado] : (
          <select className="inp sm" aria-label={`Estado de ${t.titulo}`} value={t.estado} onChange={(e) => upd({ estado: e.target.value as Tarea["estado"] })}>
            {ESTADOS_TAREA.map((e) => <option key={e} value={e}>{ESTADO_TAREA_LABEL[e]}</option>)}
          </select>)}</dd></div>
        <div><dt>Prioridad</dt><dd>{lectura ? PRIO_LABEL[t.prioridad] : (
          <select className="inp sm" aria-label={`Prioridad de ${t.titulo}`} value={t.prioridad} onChange={(e) => upd({ prioridad: e.target.value as Tarea["prioridad"] })}>
            <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
          </select>)}</dd></div>
        <div><dt>Vence</dt><dd>{lectura ? (t.venceEn ? fechaCorta(t.venceEn) : <span className="muted">Sin fecha</span>) : (
          <input className="inp sm" type="date" aria-label={`Vencimiento de ${t.titulo}`} value={t.venceEn ?? ""} onChange={(e) => upd({ venceEn: e.target.value || null })} />)}</dd></div>
      </dl>

      <div className="tk-row"><span className="tk-lbl">Responsables</span><RespInline value={t.responsables} lectura={lectura} onChange={(v) => upd({ responsables: v })} /></div>

      <div className="tk-desc">
        {lectura
          ? <DescripcionExpandible texto={t.descripcion} />
          : <DescripcionTarea descripcion={t.descripcion} onCommit={(v) => { const r = report(actualizarTarea(t.id, { descripcion: v })); return r.ok ? null : r.error; }} />}
      </div>
    </li>
  );
}

function NuevaTarea({ nodoId, onClose }: { nodoId: string; onClose: () => void }) {
  const [resp, setResp] = useState<string[]>([]);
  const [v, setV] = useState("");
  const [d, setD] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const crear = () => {
    const st = useProjectStore.getState();
    const r = st.crearTarea(nodoId, v, d);
    if (!r.ok) { setErr(r.error); return; }
    if (resp.length) report(st.actualizarTarea(r.id, { responsables: resp }));
    onClose();
  };
  const teclas = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
  return (
    <form className="tk-new" aria-label="Nueva tarea" onKeyDown={teclas} onSubmit={(e) => { e.preventDefault(); crear(); }}>
      <label className="lbl">Título
        <input className="inp" autoFocus value={v} placeholder="¿Qué hay que hacer?" onChange={(e) => { setV(e.target.value); setErr(null); }} />
      </label>
      <label className="lbl">Descripción (opcional)
        <textarea className="inp task-desc-text" rows={2} value={d} maxLength={LIMITE_DESCRIPCION_TAREA} placeholder="Contexto, criterios o notas" onChange={(e) => { setD(e.target.value); setErr(null); }} />
      </label>
      <div className="lbl">Responsables (opcional)
        <ChipsEditor compact value={resp} onChange={setResp} />
      </div>
      {err && <span className="err" role="alert">{err}</span>}
      <div className="row-end">
        <button type="button" className="btn sm" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn sm primary">Crear tarea</button>
      </div>
    </form>
  );
}

function TareasSection({ nodoId, tareas }: { nodoId: string; tareas: Tarea[] }) {
  const lectura = useProjectStore((s) => s.modo) === "lectura";
  const [nueva, setNueva] = useState(false);
  const c = contarPorEstado(tareas);
  return (
    <section className="block" aria-label="Tareas del nodo">
      <div className="tk-sec-head">
        <h3>Tareas del nodo <span className="count">{tareas.length}</span></h3>
        {!lectura && !nueva && <button type="button" className="btn sm primary" onClick={() => setNueva(true)}>+ Nueva tarea</button>}
      </div>
      {tareas.length > 0 && (
        <ul className="sub-counts wide tk-summary" aria-label="Resumen por estado">
          {ESTADOS_TAREA.map((e) => (<li key={e} className={c[e] === 0 ? "is-zero" : ""}><i className="dot" data-st={e} /><b>{c[e]}</b><span>{c[e] === 1 ? ESTADO_TAREA_LABEL[e].toLowerCase() : ESTADO_TAREA_PLURAL[e]}</span></li>))}
        </ul>
      )}
      {lectura && <p className="muted small">Solo lectura: inicia sesión con permiso de edición para crear o modificar tareas.</p>}
      {nueva && !lectura && <NuevaTarea nodoId={nodoId} onClose={() => setNueva(false)} />}
      {tareas.length === 0 ? (
        !nueva && (
          <div className="tk-empty">
            <p><b>Este nodo aún no tiene tareas</b></p>
            {!lectura && <button type="button" className="btn sm primary" onClick={() => setNueva(true)}>+ Nueva tarea</button>}
          </div>
        )
      ) : (
        <ul className="tk-list">{tareas.map((t) => <TaskRow key={t.id} t={t} />)}</ul>
      )}
    </section>
  );
}
const TIPO_DOC: Record<Documento["tipo"], string> = { url: "URL (repositorio o documento)", nota: "Nota en Markdown", archivo: "Archivo local (referencia)" };

function DocForm({ initial, submitLabel, onSubmit, onCancel }: { initial: DocInput; submitLabel: string; onSubmit: (d: DocInput) => string | null; onCancel: () => void }) {
  const [d, setD] = useState<DocInput>(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<DocInput>) => { setD({ ...d, ...p }); setErr(null); };
  return (
    <form className="doc-form" onSubmit={(e) => { e.preventDefault(); const r = onSubmit(d); if (r) setErr(r); }}>
      <label className="lbl">Tipo
        <select className="inp" value={d.tipo} onChange={(e) => set({ tipo: e.target.value as Documento["tipo"] })}>
          {(Object.keys(TIPO_DOC) as Documento["tipo"][]).map((t) => <option key={t} value={t}>{TIPO_DOC[t]}</option>)}
        </select>
      </label>
      <label className="lbl">Título
        <input className="inp" value={d.titulo} onChange={(e) => set({ titulo: e.target.value })} />
      </label>
      {d.tipo === "url" && <label className="lbl">URL<input className="inp" inputMode="url" placeholder="https://" value={d.url ?? ""} onChange={(e) => set({ url: e.target.value })} /></label>}
      {d.tipo === "archivo" && <label className="lbl">Ruta del archivo<input className="inp" placeholder="docs/diseno.md" value={d.ruta ?? ""} onChange={(e) => set({ ruta: e.target.value })} /></label>}
      {d.tipo === "nota" && (
        <div className="lbl">Contenido
          <MarkdownEditor label="Contenido de la nota" rows={6} value={d.contenido ?? ""} onCommit={(v) => set({ contenido: v })} />
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row-end">
        <button type="button" className="btn sm" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn sm primary">{submitLabel}</button>
      </div>
    </form>
  );
}

function DocRow({ d }: { d: Documento }) {
  const [edit, setEdit] = useState(false);
  const { actualizarDocumento, eliminarDocumento } = useProjectStore.getState();
  if (edit) {
    return (
      <li className="doc-item">
        <DocForm
          initial={{ tipo: d.tipo, titulo: d.titulo, url: d.url ?? "", ruta: d.ruta ?? "", contenido: d.contenido ?? "" }}
          submitLabel="Guardar"
          onCancel={() => setEdit(false)}
          onSubmit={(v) => { const r = actualizarDocumento(d.id, v); if (r.ok) { setEdit(false); return null; } return r.error; }}
        />
      </li>
    );
  }
  return (
    <li className="doc-item">
      {d.tipo === "url" ? (
        <a className="doc-main" href={d.url ?? "#"} target="_blank" rel="noopener noreferrer"><IconLink /><span><b>{d.titulo}</b><small>{d.url}</small></span></a>
      ) : (
        <div className="doc-main"><IconFile /><span><b>{d.titulo}</b><small>{d.tipo === "archivo" ? d.ruta : "Nota"}</small></span></div>
      )}
      {d.tipo === "nota" && d.contenido && <div className="doc-note"><Markdown>{d.contenido}</Markdown></div>}
      <div className="row-end">
        <button className="link-btn" onClick={() => setEdit(true)} aria-label={`Editar ${d.titulo}`}>Editar</button>
        <InlineDelete subject={`documento ${d.titulo}`} onConfirm={() => report(eliminarDocumento(d.id))} />
      </div>
    </li>
  );
}

function AddDoc({ nodoId }: { nodoId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>Agregar documento</button>;
  return (
    <DocForm
      initial={{ tipo: "url", titulo: "", url: "", ruta: "", contenido: "" }}
      submitLabel="Agregar"
      onCancel={() => setOpen(false)}
      onSubmit={(v) => { const r = useProjectStore.getState().crearDocumento(nodoId, v); if (r.ok) { setOpen(false); return null; } return r.error; }}
    />
  );
}

type TabId = "diseno" | "doc";
const TABS: { id: TabId; label: string }[] = [{ id: "diseno", label: "Diseño" }, { id: "doc", label: "Documentación" }];

export function NodePanel() {
  const doc = useProjectStore((s) => s.doc)!;
  const actualizarNodo = useProjectStore((s) => s.actualizarNodo);
  const selectedId = useCanvasStore((s) => s.panelId);
  const [tab, setTab] = useState<TabId>("diseno");
  const nodo = doc.nodos.find((n) => n.id === selectedId);
  if (!nodo) return null;

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[n].id);
    document.getElementById(`tab-${TABS[n].id}`)?.focus();
  };

  const def = getNodeType(nodo.tipo);
  const summary = def.summary(nodo, doc);
  const actions: NodeActions = {
    openLevel: (id) => useCanvasStore.getState().navigate(id),
    select: (id) => useCanvasStore.getState().select(id),
  };
  const docs = doc.documentos.filter((d) => d.nodoId === nodo.id);
  const tareas = tareasDeNodo(doc, nodo.id);
  const estadoActual = estadoDeNodo(doc, nodo);
  const estados = estadosOrdenados(doc);
  const visibles = (def.actions ?? []).filter((a) => a.visible?.(nodo, doc) ?? true);
  const patch2 = (zid: string | null) => report(useProjectStore.getState().asignarZona(nodo.id, zid));
  const patch = (p: Parameters<typeof actualizarNodo>[1]) => report(actualizarNodo(nodo.id, p));

  return (
    <aside className="detail nowheel" aria-label={`Detalle de ${nodo.titulo}`}>
      <header className="detail-head">
        <span className="type-chip"><span className="type-ico" style={{ background: def.color }}>{def.icon}</span>{def.label}</span>
        <span className="head-actions">
          <button className="btn sm" onClick={() => pedirDuplicar(nodo.id)}><IconCopy /> Duplicar</button>
          <button className="btn sm" onClick={() => pedirEliminarNodo(nodo.id)}><IconTrash /> Eliminar</button>
          <button className="icon-btn" onClick={() => actions.select(null)} aria-label="Cerrar panel" title="Cerrar panel"><IconClose /></button>
        </span>
      </header>
      <div className="detail-fixed">
        <div className="title-edit" key={nodo.id}>
          <IconTile nodo={nodo} fallback={def.icon} size="lg" />
          <div className="grow"><TextCommit value={nodo.titulo} label="Título del nodo" className="inp title-inp" onCommit={(v) => { const r = actualizarNodo(nodo.id, { titulo: v }); return r.ok ? null : r.error; }} /></div>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="Secciones del nodo" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}>
              {t.label}{t.id === "doc" && <span className="count">{docs.length + tareas.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="detail-scroll" key={nodo.id} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "diseno" && <>
        <dl className="fields">
          <div className="field"><dt>Tipo</dt><dd>
            <select className="inp" aria-label="Tipo de nodo" value={nodo.tipo} onChange={(e) => pedirCambiarTipo(nodo.id, e.target.value)}>
              {listNodeTypes().map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </dd></div>
          <div className="field top"><dt>Icono</dt><dd><IconField nodo={nodo} /></dd></div>
          <div className="field"><dt>Estado</dt><dd className="with-dot">
            <EstadoPill estado={estadoActual} />
            <select className="inp" aria-label="Estado del nodo" value={nodo.estadoId} onChange={(e) => patch({ estadoId: e.target.value })}>
              {estados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </dd></div>
          <div className="field"><dt>Categoría</dt><dd>
            <select className="inp" aria-label="Categoría" value={nodo.categoriaId} onChange={(e) => patch({ categoriaId: e.target.value })}>
              {doc.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </dd></div>
          <div className="field"><dt>Zona</dt><dd>
            <select className="inp" aria-label="Zona del nodo" value={nodo.zonaId ?? ""} onChange={(e) => patch2(e.target.value || null)}>
              <option value="">Sin zona</option>
              {doc.zonas.filter((z) => z.scopeId === nodo.parentId).map((z) => <option key={z.id} value={z.id}>{z.titulo}</option>)}
            </select>
          </dd></div>
          <div className="field"><dt>Vista</dt><dd>
            <select className="inp" aria-label="Vista del nodo" value={nodo.vista ?? ""} onChange={(e) => patch({ vista: e.target.value || null })}>
              <option value="">Usar la vista del proyecto ({listViews().find((v) => v.id === doc.vistaNodo)?.label ?? "Completa"})</option>
              {listViews().map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </dd></div>
          <div className="field top"><dt>Color de fondo</dt><dd><NodeColorField nodo={nodo} campo="colorFondo" label="Color de fondo del nodo" inicial={doc.categorias.length ? "#F7F7F7" : "#F7F7F7"} /></dd></div>
          <div className="field top"><dt>Color del borde</dt><dd><NodeColorField nodo={nodo} campo="colorBorde" label="Color del borde del nodo" inicial={doc.categorias.find((c) => c.id === nodo.categoriaId)?.color ?? "#6B6866"} /></dd></div>
          <div className="field top"><dt>Responsables</dt><dd><ChipsEditor value={nodo.responsables} onChange={(v) => patch({ responsables: v })} /></dd></div>
          {def.fields.map((f) => (
            <div key={f.id} className="field"><dt>{f.label}</dt><dd>{f.render(nodo, doc)}</dd></div>
          ))}
        </dl>

        {visibles.length > 0 && (
          <div className="actions">
            {visibles.map((a) => (<button key={a.id} className="btn primary" onClick={() => a.run(nodo, actions)}>{a.label}</button>))}
          </div>
        )}
        </>}

        {tab === "doc" && <>
        {summary.bar && (
          <section className="block">
            <h3>Tareas de todo el subflujo</h3>
            <div className="seg-bar big">
              {summary.bar.every((s) => s.value === 0) ? <span className="seg seg-empty" style={{ flex: 1 }} /> :
                summary.bar.map((s) => s.value > 0 && <span key={s.id} className={`seg seg-${s.tone}`} style={{ flex: s.value }} />)}
            </div>
            <ul className="sub-counts wide">
              {summary.bar.map((s) => (<li key={s.id}><i className="dot" data-st={s.tone} /><b>{s.value}</b><span>{s.label}</span></li>))}
            </ul>
            <p className="muted small">Incluye las tareas de este nodo y de todos los nodos de sus niveles internos.</p>
          </section>
        )}

        <section className="block">
          <h3>Descripción</h3>
          <MarkdownEditor label="Descripción" value={nodo.descripcion} onCommit={(v) => patch({ descripcion: v })} />
        </section>

        <section className="block">
          <h3>Documentos <span className="count">{docs.length}</span></h3>
          {docs.length === 0 ? <p className="muted">Sin documentos vinculados.</p> : <ul className="doc-list">{docs.map((d) => <DocRow key={d.id} d={d} />)}</ul>}
          <AddDoc nodoId={nodo.id} />
        </section>

        <TareasSection nodoId={nodo.id} tareas={tareas} />
        </>}
      </div>
    </aside>
  );
}
