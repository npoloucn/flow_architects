import { useMemo } from "react";
import { ReactFlow, ReactFlowProvider, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import { useProjectStore } from "../../store/projectStore";
import { projectEdges, projectNodes } from "./geometry";
import { FlowNodeView } from "./FlowNode";
import { TypedEdge } from "./TypedEdge";

const nodeTypes: NodeTypes = { flow: FlowNodeView };
const edgeTypes: EdgeTypes = { typed: TypedEdge };

/** Nivel padre, solo lectura, desenfocado: contexto detrás del nivel hijo. */
export function GhostLevel({ level }: { level: string | null }) {
  const doc = useProjectStore((s) => s.doc)!;
  const nodes = useMemo(() => projectNodes(doc, level, true), [doc, level]);
  const edges = useMemo(() => projectEdges(doc, level), [doc, level]);
  return (
    <div className="ghost" aria-hidden>
      <ReactFlowProvider>
        <ReactFlow
          key={level ?? "root"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  );
}

