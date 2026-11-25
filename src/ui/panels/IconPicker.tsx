import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Nodo } from "../../domain/schema";
import { getNodeType } from "../../nodeTypes/registry";
import { useProjectStore } from "../../store/projectStore";
import { CATEGORIAS_ICONO } from "../../iconos/catalogo.generated";
import { buscarIconos, entradaDe } from "../../iconos/buscar";
import { normalizarClave } from "../../iconos/compat";
import { resolverIcono } from "../../iconos/resolver";
import { useIconPreview } from "../../iconos/preview";
import { subirImagen } from "../iconUpload";
import { IconTile, esImagen } from "../nodeIcons";
import { report } from "../actions";

const etiqueta = (clave: string) => entradaDe(clave)?.l ?? resolverIcono(clave)?.label ?? clave;

function Opt({ clave, on, onPick, onPreview }: { clave: string; on: boolean; onPick: (c: string) => void; onPreview: (c: string | null) => void }) {
  const R = resolverIcono(clave);
  if (!R) return null;
  const nombre = etiqueta(clave);
  return (
    <button type="button" className={`icon-opt${on ? " is-on" : ""}`} aria-pressed={on} title={nombre} aria-label={nombre} data-clave={clave}
      onClick={() => onPick(clave)} onMouseEnter={() => onPreview(clave)} onMouseLeave={() => onPreview(null)} onFocus={() => onPreview(clave)} onBlur={() => onPreview(null)}>
      <R.Svg />
    </button>
  );
}

/**
 * Panel de búsqueda de iconos: buscador, categorías, recientes del proyecto, rejilla con teclado y estado vacío.
 * Reutilizable (ficha del nodo y categorías). `onClose` se llama con Esc.
 */
export function IconSearchPanel({ value, recientes, onPick, onPreview, onClose, children }: {
  value?: string; recientes: string[]; onPick: (clave: string) => void; onPreview: (clave: string | null) => void; onClose: () => void; children?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const inp = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const actual = normalizarClave(value);
  useEffect(() => { inp.current?.focus(); }, []);
  const { items, total } = useMemo(() => buscarIconos(q, cat), [q, cat]);
  const recs = recientes.filter((c) => resolverIcono(c));

  const mover = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onPreview(null); onClose(); return; }
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".icon-opt"));
    if (!btns.length) return;
    const act = document.activeElement as HTMLElement;
    const i = btns.indexOf(act as HTMLButtonElement);
    if (i < 0) { if (e.key === "ArrowDown" && act === inp.current) { e.preventDefault(); btns[0].focus(); } return; }
    const cols = Math.max(1, getComputedStyle(grid.current!).gridTemplateColumns.split(" ").length);
    let n = i;
    if (e.key === "ArrowRight") n = i + 1; else if (e.key === "ArrowLeft") n = i - 1;
    else if (e.key === "ArrowDown") n = i + cols; else if (e.key === "ArrowUp") n = i - cols;
    else if (e.key === "Home") n = 0; else n = btns.length - 1;
    e.preventDefault();
    if (n < 0) { inp.current?.focus(); return; }
    btns[Math.min(n, btns.length - 1)].focus();
  };

  return (
    <div className="icon-picker" onKeyDown={mover}>
      <input ref={inp} className="inp" type="search" value={q} placeholder="Buscar icono: base de datos, kafka, nube…" aria-label="Buscar icono" onChange={(e) => setQ(e.target.value)} />
      <div className="icon-cats" role="group" aria-label="Categorías de iconos">
        <button type="button" className="chip" aria-pressed={cat === null} onClick={() => setCat(null)}>Todos</button>
        {CATEGORIAS_ICONO.map((c) => <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.nombre}</button>)}
      </div>
      {recs.length > 0 && !q && (
        <div className="icon-rec"><span className="muted small">Usados en este proyecto</span>
          <div className="icon-grid" role="group" aria-label="Iconos usados en el proyecto">{recs.map((c) => <Opt key={c} clave={c} on={c === actual} onPick={onPick} onPreview={onPreview} />)}</div>
        </div>
      )}
      <div className="icon-scroll">
        {items.length ? (
          <div className="icon-grid" ref={grid} role="group" aria-label="Resultados de iconos">{items.map((e) => <Opt key={e.k} clave={e.k} on={e.k === actual} onPick={onPick} onPreview={onPreview} />)}</div>
        ) : (
          <p className="icon-empty" role="status">Ningún icono coincide con «{q}». Prueba con otra palabra, como «datos», «nube» o el nombre de la herramienta.</p>
        )}
      </div>
      <p className="muted small" aria-live="polite">{items.length < total ? `Mostrando ${items.length} de ${total}. Escribe para afinar.` : `${total} ${total === 1 ? "icono" : "iconos"}`}</p>
      {children}
    </div>
  );
}

/** Selector de icono de la ficha: catálogo con buscador, imagen propia (redimensionada a 128 px) y quitar. */
export function IconField({ nodo }: { nodo: Nodo }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const fallback = getNodeType(nodo.tipo).icon;
  const cat = useProjectStore((s) => s.doc?.categorias.find((c) => c.id === nodo.categoriaId));
  const nodos = useProjectStore((s) => s.doc?.nodos);
  const ico = resolverIcono(nodo.icono);
  const actual = esImagen(nodo.icono) ? "Imagen propia" : ico ? etiqueta(ico.clave) : cat ? `Predeterminado (${cat.nombre})` : "Predeterminado del tipo";

  const recientes = useMemo(() => {
    const n = new Map<string, number>();
    for (const x of nodos ?? []) { const k = normalizarClave(x.icono); if (k && !k.startsWith("data:")) n.set(k, (n.get(k) ?? 0) + 1); }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map((e) => e[0]);
  }, [nodos]);

  const preview = (c: string | null) => useIconPreview.getState().set(c ? nodo.id : null, c);
  useEffect(() => () => useIconPreview.getState().set(null, null), []);
  const cerrar = () => { preview(null); setOpen(false); requestAnimationFrame(() => btn.current?.focus()); };

  const aplicar = (icono: string | undefined) => {
    preview(null);
    if (icono === nodo.icono) return;
    report(useProjectStore.getState().actualizarNodo(nodo.id, { icono }));
  };
  const subir = async (f: File) => {
    setErr(null);
    const r = await subirImagen(f);
    if (!r.ok) return setErr(r.error);
    aplicar(r.dataUrl);
  };

  return (
    <div className="icon-field">
      <button ref={btn} className="icon-current" aria-expanded={open} onClick={() => (open ? cerrar() : setOpen(true))}>
        <IconTile nodo={nodo} fallback={fallback} size="lg" />
        <span>{actual}</span>
        <span className="muted small">{open ? "Cerrar" : "Cambiar"}</span>
      </button>
      {open && (
        <IconSearchPanel value={nodo.icono} recientes={recientes} onPick={(c) => aplicar(c)} onPreview={preview} onClose={cerrar}>
          <div className="row-start">
            <button className="btn sm" onClick={() => file.current?.click()}>Subir imagen…</button>
            <button className="btn sm" onClick={() => aplicar(undefined)} disabled={!nodo.icono}>Quitar icono</button>
            <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" data-testid="icon-input"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subir(f); }} />
          </div>
          <p className="muted small">PNG, JPG, SVG o WebP de hasta 2 MB. Se reduce a 128 × 128 px y se guarda dentro del proyecto. «Quitar icono» vuelve al de la categoría.</p>
          {err && <p className="err" role="alert">{err}</p>}
        </IconSearchPanel>
      )}
    </div>
  );
}
