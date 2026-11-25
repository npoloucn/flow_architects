import { useEffect, useState } from "react";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { nodosConEstado } from "../../domain/commands";
import { estadosOrdenados } from "../../domain/selectors";
import { IconPlus, IconTrash } from "../icons";
import { report, toast } from "../actions";
import { ColorPicker } from "./ColorPicker";
import { TextCommit } from "./editors";

function Swatch({ color }: { color: string }) {
  return <span className="estado-swatch" style={{ background: color }} aria-hidden />;
}

/** Administrador de estados de nodo del proyecto: crear, renombrar, recolorear, reordenar y eliminar (con reasignación). */
export function EstadosDialog() {
  const open = useCanvasStore((s) => s.estadosDialog);
  const close = () => useCanvasStore.getState().setEstadosDialog(false);
  const doc = useProjectStore((s) => s.doc);
  const [sel, setSel] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [destino, setDestino] = useState("");

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);
  if (!open || !doc) return null;

  const estados = estadosOrdenados(doc);
  const cur = estados.find((e) => e.id === sel) ?? estados[0];
  const usados = nodosConEstado(doc, cur.id);
  const otros = estados.filter((e) => e.id !== cur.id);
  const idx = estados.findIndex((e) => e.id === cur.id);
  const act = (patch: Parameters<ReturnType<typeof useProjectStore.getState>["actualizarEstado"]>[1], key?: string) => report(useProjectStore.getState().actualizarEstado(cur.id, patch, key));
  const crear = () => {
    const r = useProjectStore.getState().crearEstado(nuevo);
    if (r.ok) { setNuevo(""); setErr(null); setSel(r.id); setBorrando(false); } else setErr(r.error);
  };
  const destinoId = otros.some((e) => e.id === destino) ? destino : (otros.find((e) => e.id === "idea") ?? otros[0])?.id ?? "";

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="estados-t">
        <h2 id="estados-t">Estados de los nodos</h2>
        <p className="dialog-body">Cada estado tiene un nombre, un color y un orden. Los nodos lo referencian por su identificador; las tareas conservan sus cuatro estados propios.</p>
        <div className="cat-ed">
          <div>
            <ul className="cat-list">
              {estados.map((e) => (
                <li key={e.id}><button className="cat-item" aria-pressed={e.id === cur.id} onClick={() => { setSel(e.id); setBorrando(false); }}><Swatch color={e.color} />{e.nombre}</button></li>
              ))}
            </ul>
            <div className="add-row">
              <input className="inp" value={nuevo} maxLength={40} placeholder="Nuevo estado" aria-label="Nombre del nuevo estado" onChange={(e) => { setNuevo(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && crear()} />
              <button className="btn sm" onClick={crear} aria-label="Crear estado"><IconPlus /></button>
            </div>
            {err && <span className="err" role="alert">{err}</span>}
          </div>
          <div className="cat-form" key={cur.id}>
            <label className="lbl">Nombre
              <TextCommit value={cur.nombre} label="Nombre del estado" onCommit={(v) => { const r = report(useProjectStore.getState().actualizarEstado(cur.id, { nombre: v })); return r.ok ? null : r.error; }} />
            </label>
            <div className="lbl">Color
              <ColorPicker label="Color del estado" value={cur.color} onLive={() => {}} onCommit={(hex) => act({ color: hex }, `estc-${cur.id}`)} />
            </div>
            <div className="lbl">Orden
              <div className="row-start">
                <button className="btn sm" disabled={idx <= 0} onClick={() => report(useProjectStore.getState().moverEstado(cur.id, -1))} aria-label="Subir estado">↑ Subir</button>
                <button className="btn sm" disabled={idx < 0 || idx >= estados.length - 1} onClick={() => report(useProjectStore.getState().moverEstado(cur.id, 1))} aria-label="Bajar estado">↓ Bajar</button>
                <span className="muted small">{idx + 1} de {estados.length}</span>
              </div>
            </div>
            {!borrando ? (
              <div className="row-end"><button className="btn sm" disabled={estados.length <= 1} onClick={() => setBorrando(true)}><IconTrash /> Eliminar estado…</button></div>
            ) : (
              <div className="hint" role="alertdialog" aria-label="Eliminar estado">
                <span>{usados > 0 ? <><strong>{usados} {usados === 1 ? "nodo usa" : "nodos usan"}</strong> «{cur.nombre}». Se reasignarán a:</> : <>Ningún nodo usa «{cur.nombre}». Se eliminará sin reasignar nada.</>}</span>
                {usados > 0 && (
                  <select className="inp" aria-label="Estado al que reasignar" value={destinoId} onChange={(e) => setDestino(e.target.value)}>
                    {otros.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                )}
                <span className="row-start">
                  <button className="btn sm danger" onClick={() => { const r = report(useProjectStore.getState().eliminarEstado(cur.id, destinoId)); if (r.ok) { setBorrando(false); setSel(null); toast(usados ? `Estado eliminado; ${usados} ${usados === 1 ? "nodo reasignado" : "nodos reasignados"}.` : "Estado eliminado.", true); } }}>Eliminar{usados ? " y reasignar" : ""}</button>
                  <button className="btn sm" onClick={() => setBorrando(false)}>Cancelar</button>
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="dialog-actions"><button className="btn primary" onClick={close}>Listo</button></div>
      </div>
    </div>
  );
}
