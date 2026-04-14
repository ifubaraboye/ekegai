import { useWorkflowStore } from "../store/workflowStore";
import { TerminalNode } from "./TerminalNode";

export function TileContainer() {
  const { nodes } = useWorkflowStore();

  return (
    <div className="tile-container">
      <div className="tiles-wrapper tiles-horizontal">
        {nodes.map((node) => (
          <div key={node.id} className="tile-slot">
            <TerminalNode id={node.id} data={node.data} />
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="empty-tiles">Press + to add a terminal</div>
        )}
      </div>
    </div>
  );
}
