import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Background, BackgroundVariant, ConnectionMode, MiniMap, ReactFlow, applyNodeChanges, useReactFlow,
  type Connection, type EdgeTypes, type NodeChange, type NodeTypes, type OnConnectEnd, type OnConnectStart,
} from "@xyflow/react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore, levelKey } from "../../store/canvasStore";
import { esAncestro, hijos, ruta } from "../../domain/selectors";
import { getNodeType, listNodeTypes, type NodeActions } from "../../nodeTypes/registry";
import { crearNodoEn, crearZonaEn, crearRelacionDesde, pedirDuplicar, pedirEliminarNodo, pedirEliminarRelacion, report } from "../actions";
import { FlowNodeView } from "./FlowNode";
import { TypedEdge } from "./TypedEdge";
import { GhostLevel } from "./GhostLevel";
import { Breadcrumb } from "./Breadcrumb";
import { ZonesLayer } from "./ZonesLayer";
import { ZoomControls } from "./ZoomControls";
import { IconEntrar } from "../icons";
import { MINIMAP_RESERVA, MAX_ZOOM, MIN_ZOOM, fitVp, levelBounds, nodeRect, projectEdges, projectNodes, type FlowNode } from "./geometry";

const nodeTypes: NodeTypes = { flow: FlowNodeView };
const edgeTypes: EdgeTypes = { typed: TypedEdge };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function FlowCanvas() {
  const rf = useReactFlow();
  const stageRef = useRef<HTMLDivElement>(null);
  const wheelTarget = useRef<{ x: number; y: number; zoom: number; at: number } | null>(null);

  const doc = useProjectStore((s) => s.doc)!;
  const { moverNodo } = useProjectStore.getState();
  const levelId = useCanvasStore((s) => s.levelId);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const panelId = useCanvasStore((s) => s.panelId);
  const pendingNav = useCanvasStore((s) => s.pendingNav);
  const navigating = useCanvasStore((s) => s.navigating);
  const veil = useCanvasStore((s) => s.veil);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);

  // Estado efímero de React Flow (arrastre, dimensiones medidas). El dominio solo recibe la posición al soltar.
  const [nodes, setNodes] = useState<FlowNode[]>(() => projectNodes(doc, levelId));
  const edges = useMemo(() => projectEdges(doc, levelId, selectedEdgeId), [doc, levelId, selectedEdgeId]);

  useEffect(() => {
    const sel = useCanvasStore.getState().selectedId;
    setNodes((prev) => {
      const m = new Map(prev.map((n) => [n.id, n]));
      return projectNodes(doc, levelId).map((n) => ({ ...n, measured: m.get(n.id)?.measured, selected: n.id === sel }));
    });
  }, [doc, levelId]);

  useEffect(() => {
    setNodes((ns) => ns.map((n) => ((!!n.selected) === (n.id === selectedId) ? n : { ...n, selected: n.id === selectedId })));
  }, [selectedId]);

  // Arrastre de una zona: sus nodos se mueven en vivo con ella (sin tocar el documento hasta soltar).
  const zonaPreview = useCanvasStore((s) => s.zonaPreview);
  const huboDelta = useRef(false);
  useEffect(() => {
    const d = useProjectStore.getState().doc!;
    if (zonaPreview && zonaPreview.dx !== undefined) {
      huboDelta.current = true;
      const miembros = new Map(d.nodos.filter((n) => n.zonaId === zonaPreview.id).map((n) => [n.id, n.posicion]));
      setNodes((ns) => ns.map((n) => { const b = miembros.get(n.id); return b ? { ...n, position: { x: b.x + zonaPreview.dx!, y: b.y + (zonaPreview.dy ?? 0) } } : n; }));
    } else if (huboDelta.current) {
      huboDelta.current = false;
      setNodes((ns) => ns.map((n) => { const b = d.nodos.find((x) => x.id === n.id); return b ? { ...n, position: b.posicion } : n; }));
    }
  }, [zonaPreview]);

  const onNodesChange = useCallback((c: NodeChange<FlowNode>[]) => setNodes((ns) => applyNodeChanges(c, ns)), []);

  const actions: NodeActions = useMemo(
    () => ({ openLevel: (id) => useCanvasStore.getState().navigate(id), select: (id) => useCanvasStore.getState().select(id) }),
    [],
  );

  const size = () => ({ w: stageRef.current!.clientWidth, h: stageRef.current!.clientHeight });

  const fit = useCallback(
    (duration = 300) => {
      const { w, h } = size();
      const lvl = useCanvasStore.getState().levelId;
      rf.setViewport(fitVp(levelBounds(useProjectStore.getState().doc!, lvl), w, h, 0.07, 1.15, MINIMAP_RESERVA), { duration });
    },
    [rf],
  );

  // Encuadre inicial: se restaura la vista guardada del nivel (al volver desde Tareas) o se encuadra todo.
  useEffect(() => {
    const st = useCanvasStore.getState();
    const vp = st.viewports[levelKey(st.levelId)];
    if (vp) rf.setViewport(vp, { duration: 0 });
    else fit(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // Saltar desde la vista de tareas: centrar el nodo (dejando sitio al panel de detalle).
  const focus = useCanvasStore((s) => s.focus);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const d = useProjectStore.getState().doc!;
      if (!d.nodos.some((n) => n.id === focus.id)) return useCanvasStore.getState().clearFocus();
      const { w, h } = size();
      const r = nodeRect(d, focus.id);
      const zoom = 0.9;
      rf.setViewport({ zoom, x: Math.max(120, w - 420) / 2 - (r.x + r.width / 2) * zoom, y: h / 2 - (r.y + r.height / 2) * zoom }, { duration: 350 });
      useCanvasStore.getState().clearFocus();
    }, 80);
    return () => clearTimeout(t);
  }, [focus, rf]);

  // ---- Zoom con rueda: suave y hacia el cursor ----
  useEffect(() => {
    const el = stageRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".nowheel")) return;
      e.preventDefault();
      if (useCanvasStore.getState().navigating) return;
      const now = performance.now();
      let t = wheelTarget.current;
      if (!t || now - t.at > 260) t = { ...rf.getViewport(), at: now };
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const zoom = clamp(t.zoom * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0014)), MIN_ZOOM, MAX_ZOOM);
      const r = zoom / t.zoom;
      const next = { x: cx - (cx - t.x) * r, y: cy - (cy - t.y) * r, zoom, at: now };
      wheelTarget.current = next;
      rf.setViewport({ x: next.x, y: next.y, zoom }, { duration: 150 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [rf]);

  // ---- Navegación jerárquica con transición de zoom ----
  useEffect(() => {
    if (!pendingNav) return;
    const { target } = pendingNav;
    const cs = useCanvasStore.getState();
    cs.setNav({ navigating: true });
    (async () => {
      let { w, h } = size();
      const d = useProjectStore.getState().doc!;
      const cur = cs.levelId;
      const D = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520;
      const curVp = rf.getViewport();
      cs.saveViewport(cur, curVp);
      const set = useCanvasStore.getState().setNav;

      if (esAncestro(d, cur, target)) {
        // Entrar: zoom hacia la tarjeta, fundido, y el hijo aparece alejado y se acerca a su encuadre.
        const ids = ruta(d, target).map((n) => n.id);
        const entry = ids[cur ? ids.indexOf(cur) + 1 : 0];
        if (D) {
          const p = rf.setViewport(fitVp(nodeRect(d, entry), w, h, 0.16, MAX_ZOOM), { duration: D });
          await wait(D * 0.55);
          set({ veil: true });
          await p;
          await wait(120);
        }
        set({ levelId: target, selectedId: null });
        await wait(80);
        ({ w, h } = size()); // el panel de detalle se cierra al cambiar de nivel: re-medir
        const f = fitVp(levelBounds(d, target), w, h, 0.07, 1.15, MINIMAP_RESERVA);
        const b = levelBounds(d, target);
        const z0 = f.zoom * 0.5;
        await rf.setViewport({ zoom: z0, x: w / 2 - (b.x + b.width / 2) * z0, y: h / 2 - (b.y + b.height / 2) * z0 }, { duration: 0 });
        set({ veil: false });
        await wait(30);
        await rf.setViewport(f, { duration: D });
      } else {
        // Salir: el hijo se aleja, el padre aparece centrado en la tarjeta de la que venimos y retrocede a su sitio.
        if (D) {
          const z = curVp.zoom * 0.55;
          const k = z / curVp.zoom;
          const p = rf.setViewport({ zoom: z, x: w / 2 - (w / 2 - curVp.x) * k, y: h / 2 - (h / 2 - curVp.y) * k }, { duration: D * 0.7 });
          await wait(D * 0.4);
          set({ veil: true });
          await p;
          await wait(100);
        }
        set({ levelId: target, selectedId: null });
        await wait(80);
        ({ w, h } = size()); // el panel de detalle se cierra al cambiar de nivel: re-medir
        const ids = ruta(d, cur).map((n) => n.id);
        const exited = ids[target ? ids.indexOf(target) + 1 : 0];
        if (exited) await rf.setViewport(fitVp(nodeRect(d, exited), w, h, 0.16, MAX_ZOOM), { duration: 0 });
        set({ veil: false });
        await wait(30);
        const dest = useCanvasStore.getState().viewports[levelKey(target)] ?? fitVp(levelBounds(d, target), w, h, 0.07, 1.15, MINIMAP_RESERVA);
        await rf.setViewport(dest, { duration: D });
      }
      wheelTarget.current = null;
      useCanvasStore.getState().saveViewport(target, rf.getViewport());
      set({ navigating: false, pendingNav: null });
    })();
  }, [pendingNav, rf]);

  // Al seleccionar, el panel de detalle reduce el canvas: si el nodo queda tapado, se desplaza la vista lo justo.
  useEffect(() => {
    if (!panelId) return;
    const t = setTimeout(() => {
      const st = useCanvasStore.getState();
      const d = useProjectStore.getState().doc!;
      if (st.navigating || !d.nodos.some((n) => n.id === panelId)) return;
      const { w } = size();
      const v = rf.getViewport();
      const r = nodeRect(d, panelId);
      const left = r.x * v.zoom + v.x;
      const right = (r.x + r.width + 14) * v.zoom + v.x;
      let dx = 0;
      if (right > w - 24) dx = w - 24 - right;
      if (left + dx < 24) dx = 24 - left;
      if (dx !== 0) rf.setViewport({ ...v, x: v.x + dx }, { duration: 250 });
    }, 120);
    return () => clearTimeout(t);
  }, [panelId, rf]);

  // Si el nivel activo desaparece (deshacer, importar), se vuelve a la raíz.
  useEffect(() => {
    const st = useCanvasStore.getState();
    if (st.levelId && !doc.nodos.some((n) => n.id === st.levelId)) {
      st.setNav({ levelId: null, selectedId: null });
      setTimeout(() => fit(0), 30);
    }
  }, [doc, fit]);

  useEffect(() => {
    const h = () => fit(350);
    window.addEventListener("fa-fit", h);
    return () => window.removeEventListener("fa-fit", h);
  }, [fit]);

  // Los lados de la flecha se eligen automáticamente entre los dos nodos (el handle de origen no decide el lado).
  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) crearRelacionDesde(c.source, c.target);
  }, []);
  // Soltar sobre el cuerpo de un nodo (no solo sobre su handle) también conecta.
  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid) return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".flowlayer .react-flow__node") as HTMLElement | null;
    const source = state.fromNode?.id;
    if (el?.dataset.id && source && el.dataset.id !== source) crearRelacionDesde(source, el.dataset.id);
  }, []);
  const onConnectStart: OnConnectStart = useCallback(() => useCanvasStore.getState().closeMenu(), []);

  const posicionDesde = (cx: number, cy: number, tipo: string) => {
    const def = getNodeType(tipo);
    const p = rf.screenToFlowPosition({ x: cx, y: cy });
    return { x: Math.round(p.x - def.size.w / 2), y: Math.round(p.y - 40) };
  };

  const onDrop = (e: DragEvent) => {
    if (e.dataTransfer.getData("application/x-flow-zone")) {
      e.preventDefault();
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      crearZonaEn({ x: Math.round(p.x), y: Math.round(p.y) });
      return;
    }
    const tipo = e.dataTransfer.getData("application/x-flow-node");
    if (!tipo) return;
    e.preventDefault();
    crearNodoEn(tipo, posicionDesde(e.clientX, e.clientY, tipo), false);
  };

  const menuPane = (x: number, y: number) =>
    useCanvasStore.getState().openMenu({
      x, y,
      items: [{ label: "Nueva zona", run: () => { const p = rf.screenToFlowPosition({ x, y }); crearZonaEn({ x: Math.round(p.x), y: Math.round(p.y) }); } }, ...listNodeTypes().map((t) => ({ label: `Nuevo ${t.label.toLowerCase()}`, run: () => crearNodoEn(t.id, posicionDesde(x, y, t.id), true) }))],
    });

  const menuNode = (id: string, x: number, y: number) => {
    const nodo = doc.nodos.find((n) => n.id === id);
    if (!nodo) return;
    useCanvasStore.getState().select(id);
    const def = getNodeType(nodo.tipo);
    useCanvasStore.getState().openMenu({
      x, y,
      items: [
        { label: "Renombrar", run: () => useCanvasStore.getState().setRenaming(id) },
        ...(def.actions ?? []).map((a) => ({ label: a.label, run: () => a.run(nodo, actions) })),
        { label: "Duplicar…", run: () => pedirDuplicar(id) },
        { label: "Eliminar…", run: () => pedirEliminarNodo(id) },
      ],
    });
  };

  const parentOfLevel = levelId ? doc.nodos.find((n) => n.id === levelId)?.parentId ?? null : null;
  const empty = hijos(doc, levelId).length === 0;
  const crearAlCentro = (tipo: string) => {
    const r = stageRef.current!.getBoundingClientRect();
    crearNodoEn(tipo, posicionDesde(r.left + r.width / 2, r.top + r.height / 2, tipo), true);
  };

  return (
    <div
      ref={stageRef}
      className={`stage${levelId !== null ? " has-ghost" : ""}${navigating ? " is-nav" : ""}`}
      onDragOver={(e) => (e.dataTransfer.types.includes("application/x-flow-node") || e.dataTransfer.types.includes("application/x-flow-zone")) && e.preventDefault()}
      onDrop={onDrop}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("react-flow__pane") && !navigating) {
          crearNodoEn(listNodeTypes()[0].id, posicionDesde(e.clientX, e.clientY, listNodeTypes()[0].id), true);
        }
      }}
    >
      {levelId !== null && <GhostLevel level={parentOfLevel} />}
      <div className={`flowlayer${veil ? " is-veil" : ""}`}>
        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => useCanvasStore.getState().select(n.id)}
          onEdgeClick={(_, e) => useCanvasStore.getState().selectEdge(e.id)}
          onEdgeDoubleClick={(_, e) => useCanvasStore.getState().selectEdge(e.id)}
          onPaneClick={() => { useCanvasStore.getState().select(null); useCanvasStore.getState().closeMenu(); }}
          onNodeDragStop={(_, n) => { report(moverNodo(n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) })); }}
          onNodeDoubleClick={(_, n) => {
            const nodo = doc.nodos.find((x) => x.id === n.id);
            if (nodo) getNodeType(nodo.tipo).onDoubleClick(nodo, actions);
          }}
          onPaneContextMenu={(e) => { e.preventDefault(); menuPane((e as MouseEvent).clientX, (e as MouseEvent).clientY); }}
          onNodeContextMenu={(e, n) => { e.preventDefault(); menuNode(n.id, e.clientX, e.clientY); }}
          onEdgeContextMenu={(e, edge) => {
            e.preventDefault();
            useCanvasStore.getState().selectEdge(edge.id);
            useCanvasStore.getState().openMenu({ x: e.clientX, y: e.clientY, items: [{ label: "Eliminar flecha…", run: () => pedirEliminarRelacion(edge.id) }] });
          }}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={(c) => c.source !== c.target}
          connectionLineStyle={{ stroke: "var(--text)", strokeWidth: 2, strokeDasharray: "5 4" }}
          onMoveEnd={(_, v) => {
            wheelTarget.current = null;
            const st = useCanvasStore.getState();
            if (!st.navigating) st.saveViewport(st.levelId, v);
          }}
          connectionMode={ConnectionMode.Loose}
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          selectNodesOnDrag={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <ZonesLayer />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.6} color="var(--dot)" />
          <MiniMap
            className="nowheel"
            pannable
            zoomable
            ariaLabel="Mini-mapa"
            nodeColor={(n) => {
              const nodo = useProjectStore.getState().doc?.nodos.find((x) => x.id === n.id);
              return `color-mix(in srgb, ${nodo ? getNodeType(nodo.tipo).color : "var(--type-basico)"} 55%, var(--surface-2))`;
            }}
            nodeStrokeColor="var(--surface-2)"
            nodeStrokeWidth={6}
            nodeBorderRadius={4}
            offsetScale={14}
          />
        </ReactFlow>
      </div>
      <Breadcrumb />
      <ZoomControls onFit={() => fit(350)} />
      <p className="hints nowheel">Arrastra el fondo para mover · rueda para zoom · doble clic en el fondo crea un nodo · Esc sube</p>
      {empty && (
        <div className="empty nowheel">
          <IconEntrar />
          <h3>{levelId === null ? "Este proyecto está vacío" : "Este subflujo está vacío"}</h3>
          <p>{levelId === null ? "Crea el primer nodo para empezar a modelar la arquitectura." : "Crea un nodo para empezar a modelar este nivel."} También puedes arrastrarlo desde la paleta o hacer doble clic en el fondo.</p>
          <div className="row-start center">
            {listNodeTypes().map((t) => <button key={t.id} className={`btn${t.id === listNodeTypes()[0].id ? " primary" : ""}`} onClick={() => crearAlCentro(t.id)}>Crear {t.label.toLowerCase()}</button>)}
          </div>
          {levelId !== null && <button className="link-btn" onClick={() => useCanvasStore.getState().navigate(parentOfLevel)}>Volver al nivel superior</button>}
        </div>
      )}
    </div>
  );
}