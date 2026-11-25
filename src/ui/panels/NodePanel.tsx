import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { getNodeType, listNodeTypes, type NodeActions } from "../../nodeTypes/registry";
import { ESTADOS_TAREA, LIMITE_DESCRIPCION_TAREA, type Documento, type Tarea } from "../../domain/schema";
import { ESTADO_TAREA_LABEL, estadoDeNodo, estadosOrdenados, tareasDeNodo } from "../../domain/selectors";
import type { DocInput } from "../../domain/commands";
import { Markdown } from "../common/Markdown";
import { Dot, EstadoPill } from "../common/StatusBadge";
import { DescripcionTarea } from "../common/TaskDescription";
import { IconClose, IconCopy, IconFile, IconLink, IconTrash } from "../icons";
import { pedirCambiarTipo, pedirDuplicar, pedirEliminarNodo, report } from "../actions";
import { ChipsEditor, InlineDelete, MarkdownEditor, TextCommit } from "./editors";
import { IconField } from "./IconPicker";
import { NodeColorField } from "./ColorField";
import { listViews } from "../../nodeViews/registry";
import { IconTile } from "../nodeIcons";

function TaskRow({ t }: { t: Tarea }) {
  const { actualizarTarea, eliminarTarea, ciclarTarea } = useProjectStore.getState();
  return (
    <li className="task">
      <div className="task-top">
        <button className="task-state" onClick={() => report(ciclarTarea(t.id))} title="Siguiente estado" aria-label={`${ESTADO_TAREA_LABEL[t.estado]}. Cambiar estado de ${t.titulo}`}>
          <Dot st={t.estado} />
        </button>
        <TextCommit value={t.titulo} label="Título de la tarea" className="inp bare" onCommit={(v) => { const r = report(actualizarTarea(t.id, { titulo: v })); return r.ok ? null : r.error; }} />
      </div>
      <div className="task-desc-block">
        <DescripcionTarea descripcion={t.descripcion} onCommit={(v) => { const r = report(actualizarTarea(t.id, { descripcion: v })); return r.ok ? null : r.error; }} />
      </div>
      <div className="task-ctl">
        <select className="inp sm" aria-label="Estado de la tarea" value={t.estado} onChange={(e) => report(actualizarTarea(t.id, { estado: e.target.value as Tarea["estado"] }))}>
          {ESTADOS_TAREA.map((e) => <option key={e} value={e}>{ESTADO_TAREA_LABEL[e]}</option>)}
        </select>
        <select className="inp sm" aria-label="Prioridad" value={t.prioridad} onChange={(e) => report(actualizarTarea(t.id, { prioridad: e.target.value as Tarea["prioridad"] }))}>
          <option value="alta">Prioridad alta</option><option value="media">Prioridad media</option><option value="baja">Prioridad baja</option>
        </select>
        <input className="inp sm" type="date" aria-label="Vencimiento" value={t.venceEn ?? ""} onChange={(e) => report(actualizarTarea(t.id, { venceEn: e.target.value || null }))} />
        <InlineDelete subject={`tarea ${t.titulo}`} onConfirm={() => report(eliminarTarea(t.id))} />
      </div>
    </li>
  );
}

function AddTask({ nodoId }: { nodoId: string }) {
  const [v, setV] = useState("");
  const [d, setD] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    const r = useProjectStore.getState().crearTarea(nodoId, v, d);
    if (r.ok) { setV(""); setD(""); setErr(null); } else setErr(r.error);
  };
  return (
    <div className="add-block">
      <span className="add-row">
        <input className="inp" value={v} placeholder="Nueva tarea" aria-label="Título de la nueva tarea" onChange={(e) => { setV(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn sm" onClick={add}>Agregar tarea</button>
      </span>
      <label className="lbl">Descripción (opcional)
        <textarea
          className="inp task-desc-text" rows={2} value={d} maxLength={LIMITE_DESCRIPCION_TAREA}
          aria-label="Descripción de la nueva tarea" placeholder="Contexto, criterios o notas"
          onChange={(e) => { setD(e.target.value); setErr(null); }}
        />
      </label>
      {err && <span className="err" role="alert">{err}</span>}
    </div>
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

export function NodePanel() {
  const doc = useProjectStore((s) => s.doc)!;
  const actualizarNodo = useProjectStore((s) => s.actualizarNodo);
  const selectedId = useCanvasStore((s) => s.panelId);
  const nodo = doc.nodos.find((n) => n.id === selectedId);
  if (!nodo) return null;

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
      <div className="detail-scroll" key={nodo.id}>
        <div className="title-edit">
          <IconTile nodo={nodo} fallback={def.icon} size="lg" />
          <div className="grow"><TextCommit value={nodo.titulo} label="Título del nodo" className="inp title-inp" onCommit={(v) => { const r = actualizarNodo(nodo.id, { titulo: v }); return r.ok ? null : r.error; }} /></div>
        </div>

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

        {visibles.length > 0 && (
          <div className="actions">
            {visibles.map((a) => (<button key={a.id} className="btn primary" onClick={() => a.run(nodo, actions)}>{a.label}</button>))}
          </div>
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

        <section className="block">
          <h3>Tareas del nodo <span className="count">{tareas.length}</span></h3>
          {tareas.length === 0 ? <p className="muted">Este nodo no tiene tareas propias.</p> : <ul className="task-list">{tareas.map((t) => <TaskRow key={t.id} t={t} />)}</ul>}
          <AddTask nodoId={nodo.id} />
        </section>
      </div>
    </aside>
  );
}
