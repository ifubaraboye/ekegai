import { useCallback, useState, useEffect } from "react";
import { TileContainer } from "./components/TileContainer";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { AgentConfigModal } from "./components/AgentConfigModal";
import { Sidebar } from "./components/Sidebar";
import { useWorkflowStore } from "./store/workflowStore";

export default function App() {
  const [isDark] = useState(true);

  const {
    nodes,
    activeProjectId,
    activeTerminalId,
    setActiveTerminalId,
    setActiveProject,
    setContextMenu,
    contextMenuPosition,
    selectedNodeId,
    deleteNode,
    openAgentConfig,
    closeAgentConfig,
    isAgentConfigModalOpen,
    configModalNodeId,
    sidebarCollapsed,
    setAvailableIDEs,
    addNodesFromSession,
  } = useWorkflowStore();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.electronAPI?.ideDetect().then((ides) => {
      setAvailableIDEs(ides);
    });
    window.electronAPI?.loadSession().then((session) => {
      if (session && session.length > 0) {
        addNodesFromSession(session);
        session.forEach((terminal) => {
          window.electronAPI?.ptyCreate(terminal.ptyId, 80, 24, terminal.cwd);
        });
      }
    });
  }, [setAvailableIDEs, addNodesFromSession]);

  const handleContextMenuAction = useCallback(
    (action: string) => {
      if (!selectedNodeId) return;

      const store = useWorkflowStore.getState();
      switch (action) {
        case "run": {
          const node = store.nodes.find((n) => n.id === selectedNodeId);
          if (node?.data.agentConfig) {
            const downstream = store.getDownstreamNodes(selectedNodeId);
            let inputData = node.data.lastOutput || "";

            for (const downstreamNode of downstream) {
              if (downstreamNode.data.agentConfig) {
                store.runAgent(downstreamNode.id, inputData);
              }
            }

            if (downstream.length === 0) {
              store.runAgent(selectedNodeId, inputData);
            }
          }
          break;
        }
        case "configure":
          openAgentConfig(selectedNodeId);
          break;
        case "delete":
          deleteNode(selectedNodeId);
          break;
        case "terminal":
          break;
      }
      setContextMenu(null);
    },
    [selectedNodeId, deleteNode, openAgentConfig, setContextMenu],
  );

  const activeProjectNodes = activeProjectId
    ? nodes.filter((n) => n.data.projectId === activeProjectId)
    : nodes;

  useEffect(() => {
    if (activeProjectNodes.length === 0) {
      if (activeProjectId && activeTerminalId !== null) {
        setActiveTerminalId(null);
      }
      return;
    }

    const activeTerminalInProject = activeProjectNodes.some(
      (node) => node.id === activeTerminalId,
    );

    if (!activeTerminalId || !activeTerminalInProject) {
      setActiveTerminalId(activeProjectNodes[0].id);
    }
  }, [
    activeProjectId,
    activeProjectNodes,
    activeTerminalId,
    setActiveTerminalId,
  ]);

  return (
    <div className="app-container">
      <Sidebar />
      <div
        className={`tile-container-wrapper ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <TileContainer
          activeTerminalId={activeTerminalId}
          nodes={nodes}
          activeProjectId={activeProjectId}
          onTerminalClick={(terminalId, projectId) => {
            if (projectId && projectId !== activeProjectId) {
              setActiveProject(projectId);
            }
            setActiveTerminalId(terminalId);
          }}
        />
      </div>

      {contextMenuPosition && (
        <NodeContextMenu
          position={contextMenuPosition}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}

      {isAgentConfigModalOpen && configModalNodeId && (
        <AgentConfigModal
          nodeId={configModalNodeId}
          onClose={closeAgentConfig}
        />
      )}
    </div>
  );
}
