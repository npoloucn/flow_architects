import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { nodosConCategoria } from "../../domain/commands";
import { presetDe } from "../nodeIcons";
import { IconSearchPanel } from "./IconPicker";
import { IconPlus, IconTrash } from "../icons";
import { report, toast } from "../actions";
import { ColorPicker } from "./ColorPicker";
import { TextCommit } from "./editors";

function CatIco({ icono, color }: { icono: string; color: string }) {
  const P = presetDe(icono);
  return <span className="cat-ico" style={{ borderColor: color }}>{P ? <P.Svg /> : null}</span>;
}

/** Administrador de categorías del proyecto: crear, renombrar, recolorear, cambiar icono y eliminar (con reasignación). */
export function CategoriesDialog() {
  const open = useCanvasStore((s) => s.catDialog);
  const close = () => useCanvasStore.getState().setCatDialog(false);
  const doc = useProjectStore((s) => s.doc);
  const [sel, setSel] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [destino, setDestino] = useState("");
  const [icoOpen, setIcoOpen] = useState(false);
  const icoRef = useRef(false);
  icoRef.current = icoOpen;
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !icoRef.current) { e.stopPropagation(); e.preventDefault(); close(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [open]);
  if (!open || !doc) return null;
  const cats = doc.categorias;
  const cur = cats.find((c) => c.id === sel) ?? cats[0];
  const usados = nodosConCategoria(doc, cur.id);
  const otros = cats.filter((c) => c.id !== cur.id);
  const act = (patch: Parameters<ReturnType<typeof useProjectStore.getState>["actualizarCategoria"]>[1], key?: string) => report(useProjectStore.getState().actualizarCategoria(cur.id, patch, key));
  const crear = () => {
    const r = useProjectStore.getState().crearCategoria(nueva);
    if (r.ok) { setNueva(""); setErr(null); setSel(r.id); setBorrando(false); } else setErr(r.error);
  };
  const destinoId = otros.some((c) => c.id === destino) ? destino : (otros.find((c) => c.id === "general") ?? otros[0])?.id ?? "";
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="cats-t">
        <h2 id="cats-t">Categorías del proyecto</h2>
        <p className="dialog-body">Cada categoría tiene un nombre, un color y un icono por defecto para sus nodos.</p>
        <div className="cat-ed">
          <div>
            <ul className="cat-list">
              {cats.map((c) => (
                <li key={c.id}><button className="cat-item" aria-pressed={c.id === cur.id} onClick={() => { setSel(c.id); setBorrando(false); }}><CatIco icono={c.icono} color={c.color} />{c.nombre}</button></li>
              ))}
            </ul>
            <div className="add-row">
              <input className="inp" value={nueva} maxLength={40} placeholder="Nueva categoría" aria-label="Nombre de la nueva categoría" onChange={(e) => { setNueva(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && crear()} />
              <button className="btn sm" onClick={crear} aria-label="Crear categoría"><IconPlus /></button>
            </div>
            {err && <span className="err" role="alert">{err}</span>}
          </div>
          <div className="cat-form" key={cur.id}>
            <label className="lbl">Nombre
              <TextCommit value={cur.nombre} label="Nombre de la categoría" onCommit={(v) => { const r = report(useProjectStore.getState().actualizarCategoria(cur.id, { nombre: v })); return r.ok ? null : r.error; }} />
            </label>
            <div className="lbl">Color
              <ColorPicker label="Color de la categoría" value={cur.color} onLive={() => {}} onCommit={(hex) => act({ color: hex }, `catc-${cur.id}`)} />
            </div>
            <div className="lbl">Icono por defecto
              <button className="icon-current" aria-expanded={icoOpen} onClick={() => setIcoOpen(!icoOpen)}><CatIco icono={cur.icono} color={cur.color} /><span>{presetDe(cur.icono)?.label ?? "Sin icono"}</span><span className="muted small">{icoOpen ? "Cerrar" : "Cambiar"}</span></button>
              {icoOpen && <IconSearchPanel value={cur.icono} recientes={[]} onPick={(c) => act({ icono: c })} onPreview={() => {}} onClose={() => setIcoOpen(false)} />}
            </div>
            {!borrando ? (
              <div className="row-end"><button className="btn sm" disabled={cats.length <= 1} onClick={() => setBorrando(true)}><IconTrash /> Eliminar categoría…</button></div>
            ) : (
              <div className="hint" role="alertdialog" aria-label="Eliminar categoría">
                <span>{usados > 0 ? <><strong>{usados} {usados === 1 ? "nodo usa" : "nodos usan"}</strong> «{cur.nombre}». Se reasignarán a:</> : <>Ningún nodo usa «{cur.nombre}». Se eliminará sin reasignar nada.</>}</span>
                {usados > 0 && (
                  <select className="inp" aria-label="Categoría a la que reasignar" value={destinoId} onChange={(e) => setDestino(e.target.value)}>
                    {otros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                <span className="row-start">
                  <button className="btn sm danger" onClick={() => { const r = report(useProjectStore.getState().eliminarCategoria(cur.id, destinoId)); if (r.ok) { setBorrando(false); setSel(null); toast(usados ? `Categoría eliminada; ${usados} ${usados === 1 ? "nodo reasignado" : "nodos reasignados"}.` : "Categoría eliminada.", true); } }}>Eliminar{usados ? " y reasignar" : ""}</button>
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
