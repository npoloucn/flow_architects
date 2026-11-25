import { useEffect, useRef, useState, type ReactNode } from "react";
import { Markdown } from "../common/Markdown";
import { IconCode, IconLink, IconList } from "../icons";

/** Input que confirma al salir (blur/Enter). Esc revierte. `onCommit` devuelve un error o null. */
export function TextCommit({ value, onCommit, label, className = "inp", placeholder }: {
  value: string; onCommit: (v: string) => string | null; label: string; className?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft.trim() === value.trim() && draft === value) return;
    const err = onCommit(draft);
    if (err) {
      setError(err);
      setDraft(value);
    } else setError(null);
  };
  return (
    <>
      <input
        className={className} value={draft} aria-label={label} placeholder={placeholder}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { cancelled.current = true; setDraft(value); setError(null); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {error && <span className="err" role="alert">{error}</span>}
    </>
  );
}

/** Eliminar con confirmación en línea (sin modal): primer clic pide confirmar. */
export function InlineDelete({ onConfirm, label = "Eliminar", subject }: { onConfirm: () => void; label?: string; subject: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="link-btn" onClick={() => setAsk(true)} aria-label={`${label} ${subject}`}>{label}</button>;
  return (
    <span className="inline-confirm" role="group" aria-label={`Confirmar: ${label} ${subject}`}>
      <span>¿{label}?</span>
      <button className="link-btn strong" onClick={() => { setAsk(false); onConfirm(); }}>Sí, eliminar</button>
      <button className="link-btn" onClick={() => setAsk(false)} autoFocus>No</button>
    </span>
  );
}

export function ChipsEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="chips-edit">
      <span className="chips">
        {value.length === 0 && <span className="muted">Sin asignar</span>}
        {value.map((r) => (
          <span key={r} className="chip">{r}<button aria-label={`Quitar a ${r}`} onClick={() => onChange(value.filter((x) => x !== r))}>×</button></span>
        ))}
      </span>
      <span className="add-row">
        <input className="inp" value={draft} placeholder="Agregar responsable" aria-label="Agregar responsable"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button className="btn sm" onClick={add} disabled={!draft.trim()}>Agregar</button>
      </span>
    </div>
  );
}

/** Editor Markdown: barra mínima (negrita, lista, código, enlace) + pestañas Escribir / Vista previa. Confirma al salir del campo. */
export function MarkdownEditor({ value, onCommit, rows = 7, label }: { value: string; onCommit: (v: string) => void; rows?: number; label: string }) {
  const [tab, setTab] = useState<"write" | "preview">("preview");
  const [draft, setDraft] = useState(value);
  const ta = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  // Si el editor se desmonta con cambios sin confirmar (cambio de nodo, cierre del panel), se confirman.
  const live = useRef({ draft, value, onCommit });
  live.current = { draft, value, onCommit };
  useEffect(() => () => { if (live.current.draft !== live.current.value && !cancelled.current) live.current.onCommit(live.current.draft); }, []);

  const commit = (v: string) => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (v !== value) onCommit(v);
  };
  const edit = (fn: (sel: string) => { text: string; select?: [number, number] }) => {
    const el = ta.current;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const r = fn(draft.slice(a, b));
    const next = draft.slice(0, a) + r.text + draft.slice(b);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const [s, e] = r.select ?? [a + r.text.length, a + r.text.length];
      el.setSelectionRange(a + s, a + e);
    });
  };
  const bold = () => edit((s) => ({ text: `**${s || "texto"}**`, select: [2, 2 + (s || "texto").length] }));
  const list = () => edit((s) => ({ text: (s || "elemento").split("\n").map((l) => `- ${l}`).join("\n") }));
  const code = () => edit((s) => (s.includes("\n") ? { text: "```\n" + s + "\n```" } : { text: `\`${s || "código"}\``, select: [1, 1 + (s || "código").length] }));
  const link = () => edit((s) => { const t = s || "texto"; return { text: `[${t}](https://)`, select: [t.length + 3, t.length + 11] }; });
  const tb = (fn: () => void, title: string, child: ReactNode) => (
    <button type="button" className="tb" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={fn}>{child}</button>
  );
  return (
    <div className="mde">
      <div className="mde-bar" role="toolbar" aria-label={`Formato de ${label}`}>
        <span className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "write"} className={tab === "write" ? "on" : ""} onClick={() => { setTab("write"); requestAnimationFrame(() => ta.current?.focus()); }}>Escribir</button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={tab === "preview" ? "on" : ""} onClick={() => { commit(draft); setTab("preview"); }}>Vista previa</button>
        </span>
        {tab === "write" && (
          <span className="tools">
            {tb(bold, "Negrita", <b>B</b>)}
            {tb(list, "Lista", <IconList />)}
            {tb(code, "Código", <IconCode />)}
            {tb(link, "Enlace", <IconLink />)}
          </span>
        )}
      </div>
      {tab === "write" ? (
        <textarea
          ref={ta} className="mde-text" rows={rows} value={draft} aria-label={label} spellCheck
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => { if (e.key === "Escape") { cancelled.current = true; setDraft(value); (e.target as HTMLTextAreaElement).blur(); } }}
        />
      ) : draft.trim() ? <Markdown>{draft}</Markdown> : <p className="muted">Sin contenido. Usa «Escribir» para agregarlo.</p>}
    </div>
  );
}
