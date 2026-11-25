import { useEffect, useRef, useState } from "react";
import { LIMITE_DESCRIPCION_TAREA } from "../../domain/schema";

const pareceLarga = (t: string) => t.includes("\n") || t.trim().length > 90;

/** Descripción de una tarea: dos líneas con «Ver más/Ver menos»; si está vacía no ocupa espacio. */
export function DescripcionExpandible({ texto, className = "" }: { texto: string; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => setAbierta(false), [texto]);
  if (!texto.trim()) return null;
  const larga = pareceLarga(texto);
  return (
    <div className={`task-desc-wrap ${className}`.trim()}>
      <p className={`task-desc${abierta ? " is-open" : ""}`}>{texto}</p>
      {larga && (
        <button type="button" className="link-btn task-desc-toggle" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
          {abierta ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

/** Edición de la descripción en el panel del nodo: texto multilínea con límite y contador. */
export function DescripcionTarea({ descripcion, onCommit }: { descripcion: string; onCommit: (v: string) => string | null }) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(descripcion);
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editando) setDraft(descripcion); }, [descripcion, editando]);
  useEffect(() => { if (editando) ta.current?.focus(); }, [editando]);

  const guardar = () => {
    const err = onCommit(draft);
    if (err) { setErr(err); return; }
    setErr(null);
    setEditando(false);
  };
  const cancelar = () => { setDraft(descripcion); setErr(null); setEditando(false); };

  if (!editando) {
    return (
      <div className="task-desc-view">
        <DescripcionExpandible texto={descripcion} />
        <button type="button" className="link-btn" onClick={() => setEditando(true)}>
          {descripcion.trim() ? "Editar descripción" : "Agregar descripción"}
        </button>
      </div>
    );
  }
  return (
    <div className="task-desc-edit">
      <textarea
        ref={ta} className="inp task-desc-text" rows={3} value={draft} maxLength={LIMITE_DESCRIPCION_TAREA}
        aria-label="Descripción de la tarea" placeholder="Contexto, criterios o notas de la tarea"
        onChange={(e) => { setDraft(e.target.value); setErr(null); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); cancelar(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(); }
        }}
      />
      <div className="row-start task-desc-actions">
        <button type="button" className="btn sm primary" onClick={guardar}>Guardar</button>
        <button type="button" className="btn sm" onClick={cancelar}>Cancelar</button>
        <span className={`counter-static${draft.length >= LIMITE_DESCRIPCION_TAREA ? " is-max" : ""}`}>{draft.length}/{LIMITE_DESCRIPCION_TAREA}</span>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
    </div>
  );
}
