import { memo, useEffect, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { Relacion } from "../../domain/schema";
import { useCanvasStore } from "../../store/canvasStore";
import { coloresTema } from "../color";
import { AIRE_SALIDA, AIRE_VERTICAL, ANCHO, DASH, LARGO_PUNTA, SALIENTE_VERTICAL, ancla, colorTextoFin, colorEtiqueta, colorTextoInicio, contorno, disponerTextos, disponerVertical, GROSOR_CONTORNO, horizontal, puntaEn, rutaVertical, type Lado } from "./edgeVisual";

/**
 * Flecha configurable: línea con contorno, hasta dos puntas independientes y tres textos. Sale y entra por el lado
 * (izquierda, derecha, arriba, abajo) guardado en la relación; el desplazamiento paralelo de flechas múltiples se
 * aplica perpendicular al lado de cada extremo.
 * Texto de inicio = color de la flecha (regla fija); texto de fin = color de la flecha salvo override.
 */
function TypedEdgeImpl(p: EdgeProps) {
  const base = (p.data as { rel: Relacion }).rel;
  // color en vivo de la rueda: solo esta flecha se vuelve a dibujar mientras se arrastra
  const pv = useCanvasStore((s) => (s.previewColor && s.previewColor.id === p.id ? s.previewColor : null));
  const rel = useMemo(() => (pv ? { ...base, [pv.field]: pv.hex } : base), [base, pv]);
  const theme = useCanvasStore((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => coloresTema(), [theme]);
  const off = (p.data as { off?: number }).off ?? 0;
  const lane = (p.data as { lane?: number }).lane ?? 0;
  const extraS = (p.data as { extraS?: number }).extraS ?? 0, extraT = (p.data as { extraT?: number }).extraT ?? 0;
  const ladoS = p.sourcePosition as Lado, ladoT = p.targetPosition as Lado;
  // Los puertos sobresalen del borde: la recta se recorta hasta la tarjeta y se acorta el aire pedido
  // (en los subflujos el handle está a −20 px, no a −11).
  const salienteS = (p.data as { salienteS?: number }).salienteS ?? SALIENTE_VERTICAL;
  const salienteT = (p.data as { salienteT?: number }).salienteT ?? SALIENTE_VERTICAL;
  const saliente = (lado: Lado, s: number) => (lado === "top" ? s : lado === "bottom" ? -s : 0);
  const bordeS = p.sourceY + saliente(ladoS, salienteS), bordeT = p.targetY + saliente(ladoT, salienteT);
  const aire = (lado: Lado, a: number) => (lado === "top" ? -a : lado === "bottom" ? a : 0);
  const syV = bordeS + aire(ladoS, AIRE_SALIDA), tyV = bordeT + aire(ladoT, AIRE_VERTICAL);
  const vgap = Math.abs(tyV - syV);
  // Flecha apilada: sale por abajo y entra por arriba (o al revés). Se dibuja como una sola recta centrada en las tarjetas.
  const apilada = !horizontal(ladoS) && !horizontal(ladoT) &&
    ((ladoS === "bottom" && ladoT === "top" && p.targetY >= p.sourceY) || (ladoS === "top" && ladoT === "bottom" && p.targetY <= p.sourceY));
  const vert = apilada && vgap >= 2 ? rutaVertical(p.sourceX + lane, syV, p.targetX + lane, tyV) : null;
  const sx = p.sourceX + (!horizontal(ladoS) && !vert ? off : 0), sy = p.sourceY + (horizontal(ladoS) ? off : 0);
  const tx = p.targetX + (!horizontal(ladoT) && !vert ? off : 0), ty = p.targetY + (horizontal(ladoT) ? off : 0);
  const bezier = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: p.sourcePosition, targetX: tx, targetY: ty, targetPosition: p.targetPosition, curvature: 0.3 });
  const path = vert ? vert.d : bezier[0];
  const lx = vert ? vert.centro.x : bezier[1], ly = vert ? vert.centro.y : bezier[2];
  // en flechas paralelas las etiquetas de extremo van hacia fuera del grupo; en la central, inicio y fin en lados opuestos
  const ladoI: 1 | -1 = off > 0 ? 1 : -1;
  const ladoF: 1 | -1 = off < 0 ? -1 : 1;
  const ancho = ANCHO[rel.estiloLinea];
  const { halo, bajo } = contorno(rel.color, t);
  const selecciona = () => useCanvasStore.getState().selectEdge(p.id);
  const hS = rel.puntaInicio ? LARGO_PUNTA : 0, hE = rel.puntaFin ? LARGO_PUNTA : 0;
  const cFin = colorTextoFin(rel);
  const cIni = colorTextoInicio(rel);
  const disp = useMemo(
    () => {
      if (vert) {
        return disponerVertical(rel, { sx: p.sourceX + lane, sy: syV, tx: p.targetX + lane, ty: tyV, bordeS, bordeT, ladoS, ladoT, extraS, extraT, puntaInicio: rel.puntaInicio, puntaFin: rel.puntaFin });
      }
      return { ...disponerTextos(rel, { sx, sy, tx, ty, lx, ly, ladoS, ladoT, ladoI, ladoF, extraS, extraT }), aI: null, aF: null, aC: null };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rel.puntaInicio, rel.puntaFin, rel.textoCentro, rel.textoInicio, rel.textoFin, sx, sy, tx, ty, syV, tyV, bordeS, bordeT, lane, lx, ly, ladoS, ladoT, ladoI, ladoF, extraS, extraT, !!vert, vgap],
  );
  const claveOcultos = disp.ocultos.join("|");
  useEffect(() => { useCanvasStore.getState().setEdgeOcultos(p.id, disp.ocultos); }, [p.id, claveOcultos]); // eslint-disable-line react-hooks/exhaustive-deps
  const aI = vert ? disp.aI : ancla(sx, sy, ladoS, hS + extraS, ladoI);
  const aF = vert ? disp.aF : ancla(tx, ty, ladoT, hE + extraT, ladoF);
  const pos = (a: NonNullable<typeof aI>) => `translate(${a.tx * 100}%, ${a.ty * 100}%) translate(${a.ax}px,${a.ay}px)`;
  const cabeza = (x: number, y: number, lado: Lado) => {
    const d = puntaEn(x, y, lado);
    return (
      <>
        {bajo && <path d={d} fill={halo} stroke={halo} strokeWidth={2.5} strokeLinejoin="round" />}
        <path d={d} fill={rel.color} stroke={rel.color} strokeWidth={1} strokeLinejoin="round" />
      </>
    );
  };

  return (
    <>
      {p.selected && <path d={path} className="edge-halo" fill="none" />}
      {bajo && <path d={path} fill="none" stroke={halo} strokeWidth={ancho + GROSOR_CONTORNO} strokeLinecap="round" strokeDasharray={DASH[rel.estiloLinea]} className="edge-under" />}
      <BaseEdge id={p.id} path={path} interactionWidth={18} style={{ stroke: rel.color, strokeWidth: ancho, strokeDasharray: DASH[rel.estiloLinea], strokeLinecap: "round" }} />
      {rel.puntaInicio && cabeza(vert ? p.sourceX + lane : sx, vert ? syV : sy, ladoS)}
      {rel.puntaFin && cabeza(vert ? p.targetX + lane : tx, vert ? tyV : ty, ladoT)}
      <EdgeLabelRenderer>
        {disp.centro && (
          <div
            data-edge={p.id}
            className={`edge-label nodrag nopan${p.selected ? " is-selected" : ""}`}
            style={{ transform: vert && disp.aC ? pos(disp.aC) : `translate(-50%,-50%) translate(${lx}px,${ly}px)`, borderColor: rel.color }}
            onClick={selecciona}
          >
            <span>{rel.textoCentro}</span>
          </div>
        )}
        {disp.inicio && aI && (
          <div
            className="edge-tag nodrag nopan" data-kind="inicio" data-edge={p.id}
            style={{ transform: pos(aI), color: colorEtiqueta(cIni, t), background: t.bg }}
            title={disp.inicio !== rel.textoInicio ? rel.textoInicio : undefined}
            onClick={selecciona}
          >
            {disp.inicio}
          </div>
        )}
        {disp.fin && aF && (
          <div
            className="edge-tag nodrag nopan" data-kind="fin" data-edge={p.id}
            style={{ transform: pos(aF), color: colorEtiqueta(cFin, t), background: t.bg }}
            title={disp.fin !== rel.textoFin ? rel.textoFin : undefined}
            onClick={selecciona}
          >
            {disp.fin}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const TypedEdge = memo(TypedEdgeImpl);