import { useMemo, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { ESTADOS_TAREA, type EstadoTarea, type Nodo, type Tarea } from "../../domain/schema";
import { ESTADO_TAREA_LABEL, ESTADO_TAREA_PLURAL, contarPorEstado, estadoDeNodo, estadosOrdenados, ruta } from "../../domain/selectors";
import { getNodeType } from "../../nodeTypes/registry";
import { IconTile } from "../nodeIcons";
import { Dot, EstadoDot, EstadoPill } from "../common/StatusBadge";
import { DescripcionExpandible } from "../common/TaskDescription";
import { irANodo, report } from "../actions";
import { hrefCanvas, irA } from "../../router";

type Prio = Tarea["prioridad"];
const PRIOS: Prio[] = ["alta", "media", "baja"];
const PRIO_ORD: Record<Prio, number> = { alta: 0, media: 1, baja: 2 };
const ORDEN_ESTADO: EstadoTarea[] = ["bloqueada", "en-curso", "pendiente", "hecha"];

interface Filtros { estados: EstadoTarea[]; estadosNodo: string[]; prios: Prio[]; resp: string; vencidas: boolean; q: string }
const SIN: Filtros = { estados: [], estadosNodo: [], prios: [], resp: "", vencidas: false, q: "" };

interface Fila { t: Tarea; nodo: Nodo; camino: Nodo[]; vencida: boolean; dias: number }

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const fechaCorta = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

function cumple(f: Fila, fl: Filtros, omitir?: keyof Filtros): boolean {
  if (omitir !== "estados" && fl.estados.length && !fl.estados.includes(f.t.estado)) return false;
  if (omitir !== "estadosNodo" && fl.estadosNodo.length && !fl.estadosNodo.includes(f.nodo.estadoId)) return false;
  if (omitir !== "prios" && fl.prios.length && !fl.prios.includes(f.t.prioridad)) return false;
  if (omitir !== "resp" && fl.resp && !f.t.responsables.includes(fl.resp)) return false;
  if (omitir !== "vencidas" && fl.vencidas && !f.vencida) return false;
  if (omitir !== "q" && fl.q.trim()) {
    const q = fl.q.trim().toLowerCase();
    const hay = `${f.t.titulo} ${f.nodo.titulo} ${f.camino.map((n) => n.titulo).join(" ")} ${f.t.responsables.join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function Camino({ camino, onIr }: { camino: Nodo[]; onIr: () => void }) {
  return (
    <button className="path-link" onClick={onIr} title="Ir al nodo en el canvas" aria-label={`Ir al nodo ${camino[camino.length - 1].titulo} en el canvas`}>
      {camino.map((n, i) => (
        <span key={n.id}>{i > 0 && <span className="sep" aria-hidden> › </span>}{i === camino.length - 1 ? <b>{n.titulo}</b> : n.titulo}</span>
      ))}
    </button>
  );
}

function FilaTarea({ f, porNodo }: { f: Fila; porNodo: boolean }) {
  const ciclar = useProjectStore.getState().ciclarTarea;
  const { t } = f;
  return (
    <div role="row" className={`trow${porNodo ? " by-node" : ""}${f.vencida ? " is-overdue" : ""}${t.estado === "hecha" ? " is-done" : ""}`} data-task={t.id}>
      <div role="cell">
        <button className="task-state" onClick={() => report(ciclar(t.id))} title="Cambiar al siguiente estado" aria-label={`${ESTADO_TAREA_LABEL[t.estado]}. Cambiar estado de ${t.titulo}`}><Dot st={t.estado} /></button>
      </div>
      <div role="cell" className="tcell-title">
        <button className="title-link" onClick={() => irANodo(t.nodoId)} title="Ir al nodo en el canvas">{t.titulo}</button>
        <span className="muted small">{ESTADO_TAREA_LABEL[t.estado]}</span>
        <DescripcionExpandible texto={t.descripcion} />
      </div>
      {!porNodo && <div role="cell" className="tcell-path"><Camino camino={f.camino} onIr={() => irANodo(t.nodoId)} /></div>}
      <div role="cell"><span className={`prio prio-${t.prioridad}`}>{t.prioridad[0].toUpperCase() + t.prioridad.slice(1)}</span></div>
      <div role="cell" className="tcell-resp" title={t.responsables.join(", ")}>{t.responsables.join(", ") || <span className="muted">Sin asignar</span>}</div>
      <div role="cell" className="tcell-due">
        {t.venceEn ? (
          <>
            <span>{fechaCorta(t.venceEn)}</span>
            {f.vencida && <span className="badge overdue"><Dot st="bloqueada" />Vencida hace {f.dias} {f.dias === 1 ? "día" : "días"}</span>}
          </>
        ) : <span className="muted">Sin fecha</span>}
      </div>
    </div>
  );
}

function Cabecera({ porNodo }: { porNodo: boolean }) {
  return (
    <div role="row" className={`trow thead${porNodo ? " by-node" : ""}`}>
      <div role="columnheader"><span className="sr-only">Estado</span></div>
      <div role="columnheader">Tarea</div>
      {!porNodo && <div role="columnheader">Nodo</div>}
      <div role="columnheader">Prioridad</div>
      <div role="columnheader">Responsables</div>
      <div role="columnheader">Vencimiento</div>
    </div>
  );
}

export function TasksView() {
  const doc = useProjectStore((s) => s.doc)!;
  const [fl, setFl] = useState<Filtros>(SIN);
  const [grupo, setGrupo] = useState<"nodo" | "estado">("nodo");
  const hoy = hoyISO();

  const filas: Fila[] = useMemo(() => {
    const byId = new Map(doc.nodos.map((n) => [n.id, n]));
    return doc.tareas.flatMap((t) => {
      const nodo = byId.get(t.nodoId);
      if (!nodo) return [];
      const vencida = !!t.venceEn && t.estado !== "hecha" && t.venceEn < hoy;
      return [{ t, nodo, camino: ruta(doc, nodo.id), vencida, dias: t.venceEn ? diasEntre(t.venceEn, hoy) : 0 }];
    });
  }, [doc, hoy]);

  const visibles = filas.filter((f) => cumple(f, fl));
  const activo = fl.estados.length > 0 || fl.estadosNodo.length > 0 || fl.prios.length > 0 || !!fl.resp || fl.vencidas || !!fl.q.trim();
  const responsables = [...new Set(filas.flatMap((f) => f.t.responsables))].sort();
  const cuenta = (omitir: keyof Filtros, pred: (f: Fila) => boolean) => filas.filter((f) => cumple(f, fl, omitir) && pred(f)).length;
  const toggle = <K extends "estados" | "estadosNodo" | "prios">(k: K, v: string) =>
    setFl((p) => ({ ...p, [k]: (p[k] as string[]).includes(v) ? (p[k] as string[]).filter((x) => x !== v) : [...(p[k] as string[]), v] }) as Filtros);

  const orden = (a: Fila, b: Fila) =>
    (a.t.venceEn ?? "9999").localeCompare(b.t.venceEn ?? "9999") || PRIO_ORD[a.t.prioridad] - PRIO_ORD[b.t.prioridad] || a.t.titulo.localeCompare(b.t.titulo);

  const grupos = useMemo(() => {
    if (grupo === "estado") {
      return ORDEN_ESTADO.map((e) => ({ key: e, nodo: null as Nodo | null, estado: e as EstadoTarea | null, filas: visibles.filter((f) => f.t.estado === e).sort(orden) })).filter((g) => g.filas.length);
    }
    const m = new Map<string, Fila[]>();
    for (const f of visibles) m.set(f.nodo.id, [...(m.get(f.nodo.id) ?? []), f]);
    return [...m.entries()]
      .map(([id, fs]) => ({ key: id, nodo: fs[0].nodo, estado: null as EstadoTarea | null, filas: fs.sort(orden), camino: fs[0].camino.map((n) => n.titulo).join(" › ") }))
      .sort((a, b) => (a.camino ?? "").localeCompare(b.camino ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, grupo]);

  const porNodo = grupo === "nodo";
  const nVencidas = filas.filter((f) => f.vencida).length;

  return (
    <main className="page tasks">
      <div className="page-in wide">
        <header className="page-head">
          <div>
            <h1>Tareas</h1>
            <p className="muted">{filas.length === 0 ? "Sin tareas todavía." : `${visibles.length} de ${filas.length} tareas de «${doc.nombre}», incluidas las de todos los subflujos.`}{nVencidas > 0 && <> · <b className="overdue-note">{nVencidas} vencidas</b></>}</p>
          </div>
          <div className="seg-switch" role="group" aria-label="Agrupar tareas">
            <button aria-pressed={porNodo} onClick={() => setGrupo("nodo")}>Por nodo</button>
            <button aria-pressed={!porNodo} onClick={() => setGrupo("estado")}>Por estado</button>
          </div>
        </header>

        {filas.length === 0 ? (
          <div className="empty-block">
            <h2>Este proyecto aún no tiene tareas</h2>
            <p className="muted">Las tareas se agregan desde el panel de cada nodo, en el canvas. Aquí aparecerán todas, de cualquier nivel.</p>
            <button className="btn primary" onClick={() => irA(hrefCanvas(doc.id))}>Ir al canvas</button>
          </div>
        ) : (
          <>
            <section className="filters" aria-label="Filtros de tareas">
              <div className="filter-row">
                <input className="inp search" type="search" value={fl.q} onChange={(e) => setFl({ ...fl, q: e.target.value })} placeholder="Buscar en título, nodo o responsable" aria-label="Buscar tareas" />
                <label className="sel-resp">
                  <span className="muted small">Responsable</span>
                  <select className="inp" value={fl.resp} onChange={(e) => setFl({ ...fl, resp: e.target.value })} aria-label="Filtrar por responsable">
                    <option value="">Todos ({cuenta("resp", () => true)})</option>
                    {responsables.map((r) => <option key={r} value={r}>{r} ({cuenta("resp", (f) => f.t.responsables.includes(r))})</option>)}
                  </select>
                </label>
                {activo && <button className="link-btn" onClick={() => setFl(SIN)}>Limpiar filtros</button>}
              </div>
              <div className="filter-row chips-row">
                <span className="muted small">Estado</span>
                {ESTADOS_TAREA.map((e) => (
                  <button key={e} className="fchip" aria-pressed={fl.estados.includes(e)} onClick={() => toggle("estados", e)}>
                    <Dot st={e} />{ESTADO_TAREA_LABEL[e]} <b>{cuenta("estados", (f) => f.t.estado === e)}</b>
                  </button>
                ))}
                <span className="muted small sp">Estado del nodo</span>
                {estadosOrdenados(doc).map((e) => (
                  <button key={e.id} className="fchip" aria-pressed={fl.estadosNodo.includes(e.id)} onClick={() => toggle("estadosNodo", e.id)}>
                    <EstadoDot color={e.color} />{e.nombre} <b>{cuenta("estadosNodo", (f) => f.nodo.estadoId === e.id)}</b>
                  </button>
                ))}
                <span className="muted small sp">Prioridad</span>
                {PRIOS.map((p) => (
                  <button key={p} className="fchip" aria-pressed={fl.prios.includes(p)} onClick={() => toggle("prios", p)}>
                    {p[0].toUpperCase() + p.slice(1)} <b>{cuenta("prios", (f) => f.t.prioridad === p)}</b>
                  </button>
                ))}
                <span className="sp" />
                <button className="fchip" aria-pressed={fl.vencidas} onClick={() => setFl({ ...fl, vencidas: !fl.vencidas })}>
                  <Dot st="bloqueada" />Vencidas <b>{cuenta("vencidas", (f) => f.vencida)}</b>
                </button>
              </div>
            </section>

            {visibles.length === 0 ? (
              <div className="empty-block">
                <h2>Ninguna tarea coincide con los filtros</h2>
                <p className="muted">Hay {filas.length} tareas en el proyecto. Prueba con otros filtros o quítalos todos.</p>
                <button className="btn" onClick={() => setFl(SIN)}>Limpiar filtros</button>
              </div>
            ) : (
              <div role="table" className="ttable" aria-label="Tareas del proyecto">
                <Cabecera porNodo={porNodo} />
                {grupos.map((g) => {
                  const nodo = g.nodo;
                  const propias = nodo ? contarPorEstado(doc.tareas.filter((t) => t.nodoId === nodo.id)) : null;
                  const totalPropias = propias ? propias.pendiente + propias["en-curso"] + propias.hecha + propias.bloqueada : 0;
                  return (
                    <section key={g.key} className="tgroup" aria-label={nodo ? nodo.titulo : ESTADO_TAREA_PLURAL[g.estado!]} data-group={g.key}>
                      <div className="tgroup-head">
                        {nodo ? (
                          <>
                            <IconTile size="md" nodo={nodo} fallback={getNodeType(nodo.tipo).icon} />
                            <div className="grp-name">
                              <Camino camino={ruta(doc, nodo.id)} onIr={() => irANodo(nodo.id)} />
                              <span className="muted small">{g.filas.length === totalPropias ? `${totalPropias} ${totalPropias === 1 ? "tarea" : "tareas"}` : `${g.filas.length} de ${totalPropias} tareas visibles`}</span>
                            </div>
                            <EstadoPill estado={estadoDeNodo(doc, nodo)} />
                            <ul className="sub-counts inline" aria-label="Resumen de tareas del nodo">
                              {ESTADOS_TAREA.map((e) => (<li key={e} className={propias![e] === 0 ? "is-zero" : ""}><i className="dot" data-st={e} /><b>{propias![e]}</b><span>{ESTADO_TAREA_PLURAL[e]}</span></li>))}
                            </ul>
                          </>
                        ) : (
                          <>
                            <Dot st={g.estado!} />
                            <h2 className="grp-title">{cap(ESTADO_TAREA_PLURAL[g.estado!])}</h2>
                            <span className="count">{g.filas.length}</span>
                          </>
                        )}
                      </div>
                      {g.filas.map((f) => <FilaTarea key={f.t.id} f={f} porNodo={porNodo} />)}
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
