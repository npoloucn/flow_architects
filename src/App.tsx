import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectStore } from "./store/projectStore";
import { useCanvasStore } from "./store/canvasStore";
import { useAuth } from "./store/authStore";
import { configurado } from "./lib/supabase";
import { FlowCanvas } from "./ui/canvas/FlowCanvas";
import { Header } from "./ui/Header";
import { Palette } from "./ui/panels/Palette";
import { NodePanel } from "./ui/panels/NodePanel";
import { EdgePanel } from "./ui/panels/EdgePanel";
import { ZonePanel } from "./ui/panels/ZonePanel";
import { Overlays } from "./ui/common/Overlays";
import { ProjectsPage } from "./ui/projects/ProjectsPage";
import { LoginPage } from "./ui/auth/LoginPage";
import { ConflictoDialog } from "./ui/projects/ConflictoDialog";
import { TasksView } from "./ui/tasks/TasksView";
import { toast } from "./ui/actions";
import { useShortcuts } from "./ui/useShortcuts";
import { hrefProyectos, parseHash, useRoute } from "./router";

function CanvasPage() {
  const open = useCanvasStore((s) => s.paletteOpen);
  const hasPanel = useCanvasStore((s) => s.panelId !== null || s.selectedEdgeId !== null || s.selectedZonaId !== null);
  const edgeSel = useCanvasStore((s) => s.selectedEdgeId !== null);
  const zonaSel = useCanvasStore((s) => s.selectedZonaId !== null);
  return (
    <ReactFlowProvider>
      <div className={`body${open ? "" : " pal-closed"}${hasPanel ? " has-detail" : ""}`}>
        <Palette />
        <FlowCanvas />
        {zonaSel ? <ZonePanel /> : edgeSel ? <EdgePanel /> : <NodePanel />}
      </div>
    </ReactFlowProvider>
  );
}

function NoEncontrado({ mensajes }: { mensajes: string[] }) {
  const user = useAuth((s) => s.user);
  return (
    <main className="page">
      <div className="page-in">
        <div className="empty-block">
          <h2>No se pudo abrir el proyecto</h2>
          <ul className="issue-list">{mensajes.map((m) => <li key={m}>{m}</li>)}</ul>
          <div className="row-start center">
            <a className="btn" href={hrefProyectos()}>Volver a proyectos</a>
            {configurado && !user && <a className="btn primary" href={hrefProyectos()}>Iniciar sesion</a>}
          </div>
        </div>
      </div>
    </main>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <main className="page">
      <div className="page-in">
        <div className="splash" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>{texto}</p>
        </div>
      </div>
    </main>
  );
}

/** Avisos persistentes del proyecto abierto: solo lectura, offline. */
function AvisosProyecto() {
  const modo = useProjectStore((s) => s.modo);
  const sinConexion = useProjectStore((s) => s.sinConexion);
  const miRol = useProjectStore((s) => s.miRol);
  const user = useAuth((s) => s.user);
  if (!sinConexion && modo !== "lectura") return null;
  return (
    <div className="proj-banners">
      {sinConexion && (
        <div className="banner warn" role="status">
          <p><strong>Sin conexion.</strong> Estas viendo la ultima copia guardada en este navegador. Los cambios no se guardaran hasta que vuelvas a estar en linea.</p>
        </div>
      )}
      {modo === "lectura" && (
        <div className="banner" role="status">
          <p>
            <strong>Solo lectura.</strong>{" "}
            {user
              ? miRol === "viewer"
                ? "Eres miembro con rol de lectura; pide al duenio que te de permiso de edicion."
                : "Este proyecto es publico. Inicia sesion con permiso de edicion para modificar."
              : "Este proyecto es publico. Puedes explorarlo, pero para editarlo necesitas una cuenta con permiso."}
          </p>
          {!user && <a className="btn primary sm" href={hrefProyectos()}>Iniciar sesion</a>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const doc = useProjectStore((s) => s.doc);
  const projectId = useProjectStore((s) => s.projectId);
  const saveError = useProjectStore((s) => s.saveError);
  const conflicto = useProjectStore((s) => s.conflicto);
  const user = useAuth((s) => s.user);
  const cargando = useAuth((s) => s.cargando);
  const recuperacion = useAuth((s) => s.recuperacion);
  const [fallo, setFallo] = useState<string[] | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const uidRef = useRef<string | null | undefined>(undefined);
  useShortcuts();

  useEffect(() => { void useAuth.getState().iniciar(); }, []);

  // La ruta manda: abrir/cerrar el proyecto del store segun el hash (recarga y boton atras funcionan).
  const rid = route.name === "proyectos" ? null : route.id;
  useLayoutEffect(() => {
    if (cargando) return;
    let cancelado = false;
    const st = useProjectStore.getState();
    if (rid === null) {
      if (st.projectId !== null) st.cerrarProyecto();
      setFallo(null);
      setAbriendo(false);
      uidRef.current = user?.id ?? null;
      return;
    }
    const cambioUsuario = uidRef.current !== (user?.id ?? null);
    uidRef.current = user?.id ?? null;
    if (st.projectId === rid && !cambioUsuario) {
      setAbriendo(false);
      return;
    }
    setAbriendo(true);
    void st.abrirProyecto(rid).then((r) => {
      if (cancelado) return;
      useCanvasStore.getState().resetVista();
      setFallo(r.ok ? null : r.issues);
      setAbriendo(false);
    });
    return () => { cancelado = true; };
  }, [rid, user?.id, cargando]);

  // Un hash vacio o desconocido normaliza a #/proyectos.
  useEffect(() => {
    const h = window.location.hash;
    const n = parseHash(h);
    if (n.name === "proyectos" && h !== hrefProyectos()) window.history.replaceState(null, "", hrefProyectos());
  }, [route]);

  useEffect(() => {
    if (saveError) toast(saveError);
  }, [saveError]);

  if (configurado && cargando) return <div className="app"><Header route={route} /><Cargando texto="Cargando sesion..." /></div>;

  let page;
  if (configurado && recuperacion) page = <LoginPage />;
  else if (route.name === "proyectos") page = configurado && !user ? <LoginPage /> : <ProjectsPage />;
  else if (configurado && !user && !doc && abriendo) page = <Cargando texto="Abriendo proyecto..." />;
  else if (fallo) page = <NoEncontrado mensajes={fallo} />;
  else if (abriendo || !doc || projectId !== rid) page = <Cargando texto="Abriendo proyecto..." />;
  else page = route.name === "canvas" ? <CanvasPage /> : <TasksView />;

  return (
    <div className="app">
      <Header route={route} />
      {route.name !== "proyectos" && !fallo && <AvisosProyecto />}
      {page}
      <Overlays />
      {conflicto && <ConflictoDialog />}
    </div>
  );
}
