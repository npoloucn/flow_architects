import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { hexToHsv, hsvToHex, normalizarHex, type Hsv } from "../color";
import { IconPipette } from "../icons";

const R = 76; // radio de la rueda (px)
const KEY = "flowarq.colores";
const leerRecientes = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => /^#[0-9A-F]{6}$/.test(x)).slice(0, 5) : [];
  } catch {
    return [];
  }
};
const guardarRecientes = (l: string[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* preferencia opcional */ }
};

interface Props {
  value: string;
  label: string;
  /** Cambio en vivo (una vez por fotograma) mientras se arrastra: no debe tocar el documento. */
  onLive: (hex: string) => void;
  /** Cambio confirmado (suelta el puntero, tecla, hex, cuentagotas). */
  onCommit: (hex: string) => void;
}

/** Rueda de color (matiz + saturación) con control de brillo, hex editable y cuentagotas si el navegador lo ofrece. */
export function ColorPicker({ value, label, onLive, onCommit }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value, 0));
  const [hex, setHex] = useState(value);
  const [err, setErr] = useState(false);
  const [recientes, setRecientes] = useState<string[]>(leerRecientes);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const wheel = useRef<HTMLDivElement>(null);
  const pend = useRef<string | null>(null);
  const raf = useRef(0);
  const focoHex = useRef(false);

  // Cambios externos (deshacer, aviso de contraste, reciente): se resincroniza conservando el matiz si hace falta.
  useEffect(() => {
    setHsv((prev) => (hsvToHex(prev.h, prev.s, prev.v) === value.toUpperCase() ? prev : hexToHsv(value, prev.h)));
    if (!focoHex.current) { setHex(value); setErr(false); }
  }, [value]);

  const recordar = (c: string) => {
    const l = [c, ...recientes.filter((x) => x !== c)].slice(0, 5);
    setRecientes(l);
    guardarRecientes(l);
  };

  const vivo = (n: Hsv) => {
    setHsv(n);
    hsvRef.current = n;
    const c = hsvToHex(n.h, n.s, n.v);
    pend.current = c;
    if (!focoHex.current) setHex(c);
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; if (pend.current) onLive(pend.current); });
  };
  const fin = () => {
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    const c = pend.current;
    pend.current = null;
    if (c) { onCommit(c); recordar(c); }
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const mover = (e: PointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    vivo({ h, s: rad, v: hsvRef.current.v });
  };

  const tecla = (e: KeyboardEvent) => {
    const paso = e.shiftKey ? 10 : 2;
    const { h, s, v } = hsvRef.current;
    let n: Hsv | null = null;
    if (e.key === "ArrowRight") n = { h: (h + paso + 360) % 360, s, v };
    else if (e.key === "ArrowLeft") n = { h: (h - paso + 360) % 360, s, v };
    else if (e.key === "ArrowUp") n = { h, s: Math.min(1, s + paso / 100), v };
    else if (e.key === "ArrowDown") n = { h, s: Math.max(0, s - paso / 100), v };
    if (!n) return;
    e.preventDefault();
    setHsv(n);
    hsvRef.current = n;
    onCommit(hsvToHex(n.h, n.s, n.v)); // el padre agrupa teclas seguidas en un solo paso de deshacer
  };

  const actual = hsvToHex(hsv.h, hsv.s, hsv.v);
  const rad = (hsv.h * Math.PI) / 180;
  const tx = R + hsv.s * R * Math.sin(rad), ty = R - hsv.s * R * Math.cos(rad);
  const hayCuentagotas = typeof window !== "undefined" && "EyeDropper" in window;
  const cuentagotas = async () => {
    try {
      const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open();
      const n = normalizarHex(r.sRGBHex);
      if (n) { onCommit(n); recordar(n); }
    } catch { /* cancelado por el usuario */ }
  };

  return (
    <div className="colorpick" role="group" aria-label={label}>
      <div className="cw">
        <div
          ref={wheel} className="cw-wheel" tabIndex={0} role="slider"
          aria-label={`${label}: matiz y saturación`} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
          aria-valuetext={`Matiz ${Math.round(hsv.h)} grados, saturación ${Math.round(hsv.s * 100)} por ciento`}
          title="Arrastra, o usa las flechas: izquierda/derecha cambia el matiz y arriba/abajo la saturación (Mayús = pasos grandes)"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); mover(e); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) mover(e); }}
          onPointerUp={fin} onPointerCancel={fin} onKeyDown={tecla}
          style={{ ["--dim" as string]: String(1 - hsv.v) }}
        >
          <i className="cw-thumb" style={{ left: tx, top: ty, background: actual }} />
        </div>
        <div className="cw-side">
          <div className="cw-row">
            <i className="cw-dot" style={{ background: actual }} aria-hidden />
            <input
              className={`inp hex${err ? " is-err" : ""}`} value={hex} maxLength={7} spellCheck={false} placeholder="#RRGGBB"
              aria-label={`${label}: código hexadecimal`}
              onFocus={() => { focoHex.current = true; }}
              onChange={(e) => {
                const v = e.target.value;
                setHex(v);
                const completo = /^#?[0-9a-fA-F]{6}$/.test(v.trim());
                setErr(!completo && v.trim().replace("#", "").length >= 6);
                const n = completo ? normalizarHex(v) : null;
                if (n && n !== value.toUpperCase()) onCommit(n);
              }}
              onBlur={() => {
                focoHex.current = false;
                const n = normalizarHex(hex);
                if (n && n !== value.toUpperCase()) onCommit(n);
                if (n) recordar(n);
                setHex(n ?? value);
                setErr(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            {hayCuentagotas && (
              <button type="button" className="icon-btn" onClick={cuentagotas} aria-label="Cuentagotas: tomar un color de la pantalla" title="Cuentagotas"><IconPipette /></button>
            )}
          </div>
          {err && <span className="err" role="alert">Usa un hexadecimal como #FFDD00.</span>}
          <label className="cw-bright">
            <span>Brillo</span>
            <input
              type="range" min={0} max={100} step={1} value={Math.round(hsv.v * 100)} aria-label={`${label}: brillo`}
              style={{ background: `linear-gradient(90deg, #000, ${hsvToHex(hsv.h, hsv.s, 1)})` }}
              onChange={(e) => vivo({ ...hsvRef.current, v: Number(e.target.value) / 100 })}
              onPointerUp={fin} onKeyUp={fin} onBlur={fin}
            />
            <b>{Math.round(hsv.v * 100)}%</b>
          </label>
          {recientes.length > 0 && (
            <div className="cw-recent" aria-label="Colores recientes">
              <span className="muted small">Recientes</span>
              {recientes.map((c) => (
                <button key={c} type="button" className="recent-dot" style={{ background: c }} aria-label={`Color reciente ${c}`} title={c} onClick={() => onCommit(c)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
