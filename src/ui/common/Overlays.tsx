import { useEffect, useRef } from "react";
import { useCanvasStore } from "../../store/canvasStore";
import { useProjectStore } from "../../store/projectStore";
import { IconClose } from "../icons";

/** Esc cierra el overlay sin llegar al atajo global (captura en window). */
function useEscClose(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [active, close]);
}

function Dialog() {
  const dialog = useCanvasStore((s) => s.dialog);
  const close = useCanvasStore((s) => s.closeDialog);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEscClose(!!dialog, close);
  useEffect(() => {
    if (dialog) cancelRef.current?.focus();
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h2 id="dlg-title">{dialog.title}</h2>
        <div className="dialog-body">{dialog.body}</div>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" onClick={close}>{dialog.cancelLabel ?? "Cancelar"}</button>
          {dialog.actions.map((a) => (
            <button key={a.label} className={`btn ${a.kind === "danger" ? "danger" : a.kind === "primary" ? "primary" : ""}`} onClick={() => { close(); a.run(); }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContextMenu() {
  const menu = useCanvasStore((s) => s.menu);
  const close = useCanvasStore((s) => s.closeMenu);
  useEscClose(!!menu, close);
  useEffect(() => {
    if (!menu) return;
    const h = () => close();
    window.addEventListener("mousedown", h);
    window.addEventListener("blur", h);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("blur", h);
    };
  }, [menu, close]);
  if (!menu) return null;
  const x = Math.min(menu.x, window.innerWidth - 230);
  const y = Math.min(menu.y, window.innerHeight - 40 * menu.items.length - 16);
  return (
    <ul className="ctx" role="menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      {menu.items.map((it) => (
        <li key={it.label} role="none">
          <button role="menuitem" onClick={() => { close(); it.run(); }}>{it.label}</button>
        </li>
      ))}
    </ul>
  );
}

function Toast() {
  const toast = useCanvasStore((s) => s.toast);
  const hide = useCanvasStore((s) => s.hideToast);
  const undo = useProjectStore((s) => s.undo);
  return (
    <div className="toast-zone" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && <button className="link-btn" onClick={() => { undo(); hide(); }}>Deshacer</button>}
          <button className="icon-btn toast-x" onClick={hide} aria-label="Cerrar aviso" title="Cerrar aviso"><IconClose /></button>
        </div>
      )}
    </div>
  );
}

export function Overlays() {
  return (
    <>
      <Dialog />
      <ContextMenu />
      <Toast />
    </>
  );
}
