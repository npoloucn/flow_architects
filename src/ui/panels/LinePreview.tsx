import { useMemo } from "react";
import type { Relacion } from "../../domain/schema";
import { useCanvasStore } from "../../store/canvasStore";
import { coloresTema } from "../color";
import { ANCHO, DASH, LARGO_PUNTA, colorTextoFin, colorTextoInicio, colorEtiqueta, contorno, punta } from "../canvas/edgeVisual";

const corto = (s: string, n = 11) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const ancho = (s: string) => s.length * 5.9 + 10;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s); // la vista previa es una ilustración: abrevia

/** Mini dibujo de la flecha (origen a la izquierda, destino a la derecha) que refleja puntas, estilo, color y textos en vivo. */
export function LinePreview({ rel, origen, destino }: { rel: Relacion; origen: string; destino: string }) {
  const theme = useCanvasStore((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => coloresTema(), [theme]);
  const { halo } = contorno(rel.color, t);
  const x1 = 74, x2 = 286, y = 44, w = ANCHO[rel.estiloLinea];
  const cFin = colorTextoFin(rel);
  const cIni = colorTextoInicio(rel);
  const ix = x1 + 8 + (rel.puntaInicio ? LARGO_PUNTA : 0);
  const fx = x2 - 8 - (rel.puntaFin ? LARGO_PUNTA : 0);
  const caja = (x: number, label: string, rol: string) => (
    <g>
      <rect x={x} y={26} width={72} height={36} rx={6} fill={t.surface} stroke={t.text} strokeOpacity={0.45} />
      <text x={x + 36} y={41} textAnchor="middle" fontSize="9.5" fill={t.text} opacity={0.65}>{rol}</text>
      <text x={x + 36} y={54} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={t.text}>{corto(label)}</text>
    </g>
  );
  return (
    <svg className="line-preview" viewBox="0 0 360 88" role="img" aria-label="Vista previa de la flecha" width="100%">
      {caja(2, origen, "Origen")}
      {caja(286, destino, "Destino")}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={halo} strokeWidth={w + 2} strokeLinecap="round" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={rel.color} strokeWidth={w} strokeDasharray={DASH[rel.estiloLinea]} strokeLinecap="round" />
      {rel.puntaInicio && <path d={punta(x1, y, -1)} fill={rel.color} stroke={halo} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" />}
      {rel.puntaFin && <path d={punta(x2, y, 1)} fill={rel.color} stroke={halo} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" />}
      {rel.textoCentro && (
        <g>
          <rect x={180 - ancho(cut(rel.textoCentro, 24)) / 2} y={y - 9} width={ancho(cut(rel.textoCentro, 24))} height={18} rx={9} fill={t.surface} stroke={rel.color} />
          <text x={180} y={y + 3.5} textAnchor="middle" fontSize="10.5" fill={t.text}>{cut(rel.textoCentro, 24)}</text>
        </g>
      )}
      {rel.textoInicio && (
        <g>
          <rect x={ix - 3} y={y - 23} width={ancho(cut(rel.textoInicio, 16))} height={16} rx={4} fill={t.bg} />
          <text x={ix + 2} y={y - 11} fontSize="10.5" fontWeight="700" fill={colorEtiqueta(cIni, t)}>{cut(rel.textoInicio, 16)}</text>
        </g>
      )}
      {rel.textoFin && (
        <g>
          <rect x={fx + 3 - ancho(cut(rel.textoFin, 16))} y={y + 7} width={ancho(cut(rel.textoFin, 16))} height={16} rx={4} fill={t.bg} />
          <text x={fx - 2} y={y + 19} textAnchor="end" fontSize="10.5" fontWeight="700" fill={colorEtiqueta(cFin, t)}>{cut(rel.textoFin, 16)}</text>
        </g>
      )}
    </svg>
  );
}
