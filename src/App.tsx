import { useEffect, useLayoutEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useProjectStore } from "./store/projectStore";
import { useCanvasStore } from "./store/canvasStore";
import { FlowCanvas } from "./ui/canvas/FlowCanvas";
import { Header } from "./ui/Header";
import { Palette } from "./ui/panels/Palette";
import { NodePanel } from "./ui/panels/NodePanel";
import { EdgePanel } from "./ui/panels/EdgePanel";
import { ZonePanel } from "./ui/panels/ZonePanel";
import { Overlays } from "./ui/common/Overlays";
import { ProjectsPage } from "./ui/projects/ProjectsPage";
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
  return (
    <main className="page">
      <div className="page-in">
        <div className="empty-block">
          <h2>No se pudo abrir el proyecto</h2>
          <ul className="issue-list">{mensajes.map((m) => <li key={m}>{m}</li>)}</ul>
          <a className="btn" href={hrefProyectos()}>Volver a proyectos</a>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const route = useRoute();
  const doc = useProjectStore((s) => s.doc);
  const projectId = useProjectStore((s) => s.projectId);
  const saveError = useProjectStore((s) => s.saveError);
  const [fallo, setFallo] = useState<string[] | null>(null);
  useShortcuts();

  // La ruta manda: abrir/cerrar el proyecto del store según el hash (recarga y botón atrás funcionan).
  const rid = route.name === "proyectos" ? null : route.id;
  useLayoutEffect(() => {
    const st = useProjectStore.getState();
    if (rid === null) {
      if (st.projectId !== null) st.cerrarProyecto();
      setFallo(null);
      return;
    }
    if (st.projectId !== rid) {
      const r = st.abrirProyecto(rid);
      useCanvasStore.getState().resetVista();
      setFallo(r.ok ? null : r.issues);
    }
  }, [rid]);

  // Un hash vacío o desconocido normaliza a #/proyectos.
  useEffect(() => {
    const h = window.location.hash;
    const n = parseHash(h);
    if (n.name === "proyectos" && h !== hrefProyectos()) window.history.replaceState(null, "", hrefProyectos());
  }, [route]);

  useEffect(() => {
    if (saveError) toast(saveError);
  }, [saveError]);

  let page;
  if (route.name === "proyectos") page = <ProjectsPage />;
  else if (fallo) page = <NoEncontrado mensajes={fallo} />;
  else if (!doc || projectId !== rid) page = null;
  else page = route.name === "canvas" ? <CanvasPage /> : <TasksView />;

  return (
    <div className="app">
      <Header route={route} />
      {page}
      <Overlays />
    </div>
  );
}
