import { useEffect, useState } from "react";
import { useAuth } from "../../store/authStore";
import { listarProyectos, type ProyectoNube } from "../../persistence/nube";
import { hrefCanvas } from "../../router";
import { ETIQUETA_VISIBILIDAD } from "../../lib/supabase";
import { IconClose, IconEntrar, IconLink, IconPlus } from "../icons";

type Modo = "entrar" | "registro" | "enlace" | "recuperar";

const fecha = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

/** Proyectos publicos visibles sin cuenta (RLS deja leer `publico` y `enlace`). */
function Publicos() {
  const [lista, setLista] = useState<ProyectoNube[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void listarProyectos(null)
      .then((p) => vivo && setLista(p))
      .catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, []);
  if (!lista || lista.length === 0) return null;
  return (
    <section className="auth-publicos" aria-labelledby="pub-t">
      <h2 id="pub-t">Explorar sin cuenta</h2>
      <p className="muted">Proyectos compartidos con enlace o publicos. Se abren en modo solo lectura.</p>
      <ul className="pub-list">
        {lista.map((p) => (
          <li key={p.id}>
            <a className="pub-item" href={hrefCanvas(p.id)}>
              <span className="pub-name">{p.nombre}</span>
              <span className="muted small">{p.descripcion || "Sin descripcion"}</span>
              <span className="pub-meta">
                <span className="badge">{ETIQUETA_VISIBILIDAD[p.visibilidad]}</span>
                <span className="muted small">{p.nodos} nodos · {p.tareas} tareas · {fecha(p.actualizadoEn)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LoginPage() {
  const { ocupado, error, recuperacion, entrar, registrar, enlaceMagico, recuperar, nuevaPassword, limpiarError } = useAuth();
  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [ok, setOk] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const cambiar = (m: Modo) => { limpiarError(); setOk(null); setLocalErr(null); setModo(m); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk(null);
    setLocalErr(null);
    if (modo === "entrar") {
      if (await entrar(email, password)) setOk("Sesion iniciada.");
      return;
    }
    if (modo === "registro") {
      if (password.length < 6) return setLocalErr("La contrasena debe tener al menos 6 caracteres.");
      if (password !== password2) return setLocalErr("Las contrasenas no coinciden.");
      if (await registrar(email, password)) setOk("Cuenta creada. Ya puedes entrar.");
      return;
    }
    if (modo === "enlace") {
      if (await enlaceMagico(email)) setOk("Te enviamos un enlace de acceso al correo. Revisa tambien el spam.");
      return;
    }
    if (await recuperar(email)) setOk("Te enviamos un correo para restablecer la contrasena.");
  };

  const nueva = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    if (password.length < 6) return setLocalErr("La contrasena debe tener al menos 6 caracteres.");
    if (password !== password2) return setLocalErr("Las contrasenas no coinciden.");
    if (await nuevaPassword(password)) setOk("Contrasena actualizada.");
  };

  if (recuperacion) {
    return (
      <main className="page auth-page">
        <div className="auth-card">
          <h1>Nueva contrasena</h1>
          <p className="muted">Escribe una contrasena nueva para tu cuenta.</p>
          <form onSubmit={nueva}>
            <label className="lbl">Contrasena
              <input className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            </label>
            <label className="lbl">Repetir contrasena
              <input className="inp" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            </label>
            {(localErr || error) && <p className="err" role="alert">{localErr || error}</p>}
            {ok && <p className="ok-note" role="status"><span>{ok}</span><button type="button" className="icon-btn banner-x" onClick={() => setOk(null)} aria-label="Cerrar aviso" title="Cerrar aviso"><IconClose /></button></p>}
            <div className="dialog-actions">
              <button type="submit" className="btn primary" disabled={ocupado}>{ocupado ? "Guardando..." : "Guardar contrasena"}</button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <div className="auth-grid">
        <div className="auth-card">
          <h1>{modo === "registro" ? "Crear cuenta" : modo === "enlace" ? "Entrar con enlace magico" : modo === "recuperar" ? "Recuperar contrasena" : "Iniciar sesion"}</h1>
          <p className="muted">
            {modo === "registro" ? "Guarda tus arquitecturas en la nube y compartelas." : modo === "enlace" ? "Te enviamos un enlace al correo; al abrirlo quedas dentro." : modo === "recuperar" ? "Te enviaremos un correo con un enlace para crear una nueva." : "Accede para editar y compartir tus proyectos."}
          </p>
          <form onSubmit={enviar}>
            <label className="lbl">Correo
              <input className="inp" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoFocus required />
            </label>
            {(modo === "entrar" || modo === "registro") && (
              <label className="lbl">Contrasena
                <input className="inp" type="password" autoComplete={modo === "registro" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
            )}
            {modo === "registro" && (
              <label className="lbl">Repetir contrasena
                <input className="inp" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
              </label>
            )}
            {(localErr || error) && <p className="err" role="alert">{localErr || error}</p>}
            {ok && <p className="ok-note" role="status"><span>{ok}</span><button type="button" className="icon-btn banner-x" onClick={() => setOk(null)} aria-label="Cerrar aviso" title="Cerrar aviso"><IconClose /></button></p>}
            <div className="dialog-actions">
              {modo !== "entrar" && <button type="button" className="btn" onClick={() => cambiar("entrar")}>Volver</button>}
              <button type="submit" className="btn primary" disabled={ocupado}>
                {ocupado ? "Enviando..." : modo === "entrar" ? "Entrar" : modo === "registro" ? "Crear cuenta" : "Enviar enlace"}
              </button>
            </div>
          </form>
          <div className="auth-links">
            {modo === "entrar" ? (
              <>
                <button type="button" className="link-btn" onClick={() => cambiar("enlace")}><IconLink /> Entrar con enlace magico</button>
                <button type="button" className="link-btn" onClick={() => cambiar("recuperar")}>Olvide mi contrasena</button>
                <button type="button" className="link-btn" onClick={() => cambiar("registro")}><IconPlus /> Crear una cuenta</button>
              </>
            ) : (
              <button type="button" className="link-btn" onClick={() => cambiar("entrar")}><IconEntrar /> Ya tengo cuenta</button>
            )}
          </div>
        </div>
        <Publicos />
      </div>
    </main>
  );
}
