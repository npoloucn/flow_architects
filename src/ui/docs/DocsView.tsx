import { useMemo, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import type { Documento, Nodo } from "../../domain/schema";
import { estadoDeNodo, ruta } from "../../domain/selectors";
import { getNodeType } from "../../nodeTypes/registry";
import { IconTile } from "../nodeIcons";
import { EstadoPill } from "../common/StatusBadge";
import { Markdown } from "../common/Markdown";
import { IconFile, IconLink } from "../icons";
import { irANodo } from "../actions";
import { hrefCanvas, irA } from "../../router";

const TIPO_LABEL: Record<Documento["tipo"], string> = { url: "URL", archivo: "Archivo", nota: "Nota" };

interface Grupo { nodo: Nodo; camino: Nodo[]; docs: Documento[]; texto: string }

const primeraLinea = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";

function Camino({ camino }: { camino: Nodo[] }) {
  return (
    <span className="docs-path">
      {camino.map((n, i) => (
        <span key={n.id}>{i > 0 && <span className="sep" aria-hidden> › </span>}{i === camino.length - 1 ? <b>{n.titulo}</b> : n.titulo}</span>
      ))}
    </span>
  );
}

function NotaResumible({ contenido, titulo }: { contenido: string; titulo: string }) {
  const [abierta, setAbierta] = useState(false);
  if (!contenido.trim()) return <p className="muted small">Nota vacía.</p>;
  const larga = contenido.includes("\n") || contenido.length > 160;
  return (
    <div className="doc-note docs-note">
      <div className={`docs-note-body${abierta || !larga ? " is-open" : ""}`}><Markdown>{contenido}</Markdown></div>
      {larga && (
        <button type="button" className="link-btn" aria-expanded={abierta} aria-label={`${abierta ? "Ver menos" : "Ver más"}: ${titulo}`} onClick={() => setAbierta(!abierta)}>
          {abierta ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

function DocItem({ d }: { d: Documento }) {
  return (
    <li className="doc-item docs-item">
      <div className="docs-item-head">
        <span className="badge">{TIPO_LABEL[d.tipo]}</span>
        {d.tipo === "url" ? (
          <a className="doc-main" href={d.url ?? "#"} target="_blank" rel="noopener noreferrer" aria-label={`${d.titulo} (abre en una pestaña nueva)`}>
            <IconLink /><span><b>{d.titulo}</b><small>{d.url}</small></span>
          </a>
        ) : (
          <div className="doc-main"><IconFile /><span><b>{d.titulo}</b>{d.tipo === "archivo" && <small>{d.ruta}</small>}</span></div>
        )}
      </div>
      {d.tipo === "nota" && <NotaResumible contenido={d.contenido ?? ""} titulo={d.titulo} />}
    </li>
  );
}

export function DocsView() {
  const doc = useProjectStore((s) => s.doc)!;
  const [q, setQ] = useState("");

  const grupos: Grupo[] = useMemo(() => {
    return doc.nodos
      .map((nodo) => {
        const camino = ruta(doc, nodo.id);
        const docs = doc.documentos.filter((d) => d.nodoId === nodo.id);
        return { nodo, camino, docs, texto: camino.map((n) => n.titulo).join(" ").toLowerCase() };
      })
      .filter((g) => g.docs.length > 0)
      .sort((a, b) => a.camino.map((n) => n.titulo).join(" › ").localeCompare(b.camino.map((n) => n.titulo).join(" › ")));
  }, [doc]);

  const total = doc.documentos.length;
  const term = q.trim().toLowerCase();
  const visibles = useMemo(() => {
    if (!term) return grupos;
    return grupos.flatMap((g) => {
      if (g.texto.includes(term)) return [g];
      const docs = g.docs.filter((d) => `${d.titulo} ${d.url ?? ""} ${d.ruta ?? ""} ${d.contenido ?? ""}`.toLowerCase().includes(term));
      return docs.length ? [{ ...g, docs }] : [];
    });
  }, [grupos, term]);
  const nVisibles = visibles.reduce((n, g) => n + g.docs.length, 0);
  const conDocs = grupos.length;

  return (
    <main className="page docs">
      <div className="page-in wide">
        <header className="page-head">
          <div>
            <h1>Documentación</h1>
            <p className="muted">{total === 0 ? "Sin documentación todavía." : `${total} ${total === 1 ? "documento" : "documentos"} en ${conDocs} ${conDocs === 1 ? "nodo" : "nodos"} de «${doc.nombre}», incluidos todos los subflujos.`}</p>
          </div>
        </header>

        {total === 0 ? (
          <div className="empty-block">
            <h2>Este proyecto aún no tiene documentación</h2>
            <p className="muted">Los enlaces, archivos y notas se agregan desde el panel de cada nodo, en el canvas. Aquí aparecerán todos, de cualquier nivel.</p>
            <button className="btn primary" onClick={() => irA(hrefCanvas(doc.id))}>Ir al canvas</button>
          </div>
        ) : (
          <>
            <section className="filters" aria-label="Buscar documentación">
              <div className="filter-row">
                <input className="inp search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nodo, título, URL, ruta o contenido" aria-label="Buscar documentación" />
                {term && <button className="link-btn" onClick={() => setQ("")}>Limpiar búsqueda</button>}
                <span className="muted small" role="status">{term ? `${nVisibles} ${nVisibles === 1 ? "documento" : "documentos"} · ${visibles.length} ${visibles.length === 1 ? "nodo" : "nodos"}` : ""}</span>
              </div>
            </section>

            {visibles.length === 0 ? (
              <div className="empty-block">
                <h2>Nada coincide con la búsqueda</h2>
                <p className="muted">Prueba con otro término o limpia la búsqueda.</p>
                <button className="btn" onClick={() => setQ("")}>Limpiar búsqueda</button>
              </div>
            ) : (
              <div className="docs-list">
                {visibles.map(({ nodo, camino, docs }) => {
                  const resumen = primeraLinea(nodo.descripcion ?? "");
                  return (
                    <section key={nodo.id} className="tgroup docs-group" aria-label={nodo.titulo} data-node={nodo.id}>
                      <div className="tgroup-head">
                        <IconTile size="md" nodo={nodo} fallback={getNodeType(nodo.tipo).icon} />
                        <div className="grp-name">
                          <Camino camino={camino} />
                          {resumen && <span className="muted small docs-desc">{resumen}</span>}
                        </div>
                        <EstadoPill estado={estadoDeNodo(doc, nodo)} />
                        <button className="btn sm" onClick={() => irANodo(nodo.id)} aria-label={`Ir al nodo ${nodo.titulo}`}>Ir al nodo</button>
                      </div>
                      <ul className="docs-items" aria-label={`Documentos de ${nodo.titulo}`}>
                        {docs.map((d) => <DocItem key={d.id} d={d} />)}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}