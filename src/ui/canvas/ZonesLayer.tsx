import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import type { Zona } from "../../domain/schema";
import { ZONA_MIN } from "../../domain/schema";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { coloresTema, mezclar } from "../color";
import { textoSobre } from "../nodeStyle";
import { resolverIcono } from "../../iconos/resolver";
import { report } from "../actions";

type Dir = { l?: boolean; r?: boolean; t?: boolean; b?: boolean };
const HANDLES: { k: string; d: Dir }[] = [
  { k: "n", d: { t: true } }, { k: "s", d: { b: true } }, { k: "w", d: { l: true } }, { k: "e", d: { r: true } },
  { k: "nw", d: { t: true, l: true } }, { k: "ne", d: { t: true, r: true } }, { k: "sw", d: { b: true, l: true } }, { k: "se", d: { b: true, r: true } },
];

function ZonaView({ z, resaltada, seleccionada, bg }: { z: Zona; resaltada: boolean; seleccionada: boolean; bg: string }) {
  const rf = useReactFlow();
  const pv = useCanvasStore((s) => (s.zonaPreview && s.zonaPreview.id === z.id ? s.zonaPreview : null));
  const [editando, setEditando] = useState(false);
  const [txt, setTxt] = useState(z.titulo);
  const gesto = useRef<{ x0: number; y0: number; px: number; py: number; w0: number; h0: number; dir?: Dir; moved: boolean } | null>(null);
  const x = pv?.x ?? z.posicion.x, y = pv?.y ?? z.posicion.y, w = pv?.w ?? z.tamano.ancho, h = pv?.h ?? z.tamano.alto;
  const fondo = pv?.colorFondo ?? z.colorFondo, borde = pv?.colorBorde ?? z.colorBorde, op = pv?.opacidad ?? z.opacidad;
  const efectivo = mezclar(bg, fondo, op);
  const texto = textoSobre(efectivo);
  const ico = resolverIcono(z.icono);
  const setPv = useCanvasStore.getState().setZonaPreview;

  const empieza = (e: RPE, dir?: Dir) => {
    if (e.button !== 0 || editando) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    useCanvasStore.getState().selectZona(z.id);
    gesto.current = { x0: z.posicion.x, y0: z.posicion.y, px: e.clientX, py: e.clientY, w0: z.tamano.ancho, h0: z.tamano.alto, dir, moved: false };
  };
  const mueve = (e: RPE) => {
    const g = gesto.current;
    if (!g) return;
    const k = rf.getZoom();
    const dx = Math.round((e.clientX - g.px) / k), dy = Math.round((e.clientY - g.py) / k);
    if (!g.moved && Math.abs(e.clientX - g.px) + Math.abs(e.clientY - g.py) < 3) return;
    g.moved = true;
    if (!g.dir) return setPv({ id: z.id, x: g.x0 + dx, y: g.y0 + dy, w: g.w0, h: g.h0, dx, dy });
    let nx = g.x0, ny = g.y0, nw = g.w0, nh = g.h0;
    if (g.dir.r) nw = Math.max(ZONA_MIN.ancho, g.w0 + dx);
    if (g.dir.b) nh = Math.max(ZONA_MIN.alto, g.h0 + dy);
    if (g.dir.l) { nw = Math.max(ZONA_MIN.ancho, g.w0 - dx); nx = g.x0 + g.w0 - nw; }
    if (g.dir.t) { nh = Math.max(ZONA_MIN.alto, g.h0 - dy); ny = g.y0 + g.h0 - nh; }
    setPv({ id: z.id, x: nx, y: ny, w: nw, h: nh });
  };
  const termina = () => {
    const g = gesto.current, p = useCanvasStore.getState().zonaPreview;
    gesto.current = null;
    if (g?.moved && p && p.id === z.id) {
      const st = useProjectStore.getState();
      if (g.dir) report(st.redimensionarZona(z.id, { x: p.x!, y: p.y! }, { ancho: p.w!, alto: p.h! }));
      else report(st.moverZona(z.id, { x: p.x!, y: p.y! }));
    }
    setPv(null);
  };
  const guarda = () => {
    setEditando(false);
    if (txt.trim() !== z.titulo) report(useProjectStore.getState().actualizarZona(z.id, { titulo: txt }));
  };
  useEffect(() => { if (!editando) setTxt(z.titulo); }, [z.titulo, editando]);

  return (
    <div
      className={`zona${seleccionada ? " is-selected" : ""}${resaltada ? " is-hl" : ""}`} data-zona={z.id}
      style={{ left: x, top: y, width: w, height: h, ["--zf" as string]: fondo, ["--zb" as string]: borde, ["--zo" as string]: String(op), ["--zt" as string]: texto, ["--zi" as string]: `${pv?.tamanoIcono ?? z.tamanoIcono ?? 18}px` }}
    >
      <div
        className="zona-head nopan nodrag" title="Arrastra para mover la zona; doble clic para renombrar"
        onPointerDown={(e) => empieza(e)} onPointerMove={mueve} onPointerUp={termina} onPointerCancel={termina}
        onDoubleClick={(e) => { e.stopPropagation(); setEditando(true); }}
      >
        {z.imagen
          ? <span className="zona-ico has-img" aria-hidden><img src={z.imagen} alt="" draggable={false} decoding="async" /></span>
          : ico && <span className="zona-ico" aria-hidden><ico.Svg /></span>}
        <span className="zona-txt">
          {editando ? (
            <input
              className="zona-input nopan nodrag" value={txt} autoFocus aria-label="Título de la zona" maxLength={80}
              onFocus={(e) => e.target.select()} onChange={(e) => setTxt(e.target.value)} onBlur={guarda}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") guarda(); if (e.key === "Escape") { setTxt(z.titulo); setEditando(false); } }}
            />
          ) : <span className="zona-title" title={z.titulo}>{z.titulo}</span>}
          {z.subtitulo && <span className="zona-sub" title={z.subtitulo}>{z.subtitulo}</span>}
        </span>
      </div>
      {HANDLES.map(({ k, d }) => (
        <i key={k} className={`zona-h zona-h-${k} nopan nodrag`} aria-hidden onPointerDown={(e) => empieza(e, d)} onPointerMove={mueve} onPointerUp={termina} onPointerCancel={termina} />
      ))}
    </div>
  );
}

/** Zonas del nivel actual, dibujadas por detrás de aristas y nodos (la capa del viewport lleva z-index negativo). */
export function ZonesLayer() {
  const doc = useProjectStore((s) => s.doc)!;
  const levelId = useCanvasStore((s) => s.levelId);
  const selZona = useCanvasStore((s) => s.selectedZonaId);
  const selNodo = useCanvasStore((s) => s.selectedId);
  const theme = useCanvasStore((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bg = useMemo(() => coloresTema().bg, [theme]);
  const zonas = doc.zonas.filter((z) => z.scopeId === levelId);
  const zonaNodo = selNodo ? doc.nodos.find((n) => n.id === selNodo)?.zonaId ?? null : null;
  if (!zonas.length) return null;
  return (
    <ViewportPortal>
      <div className="zonas-layer">
        {zonas.map((z) => <ZonaView key={z.id} z={z} bg={bg} seleccionada={selZona === z.id} resaltada={zonaNodo === z.id} />)}
      </div>
    </ViewportPortal>
  );
}