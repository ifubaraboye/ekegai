import { useState, useCallback } from "react";
import { useWorkflowStore } from "../store/workflowStore";
import {
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Code2,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { IDEContextMenu } from "./IDEContextMenu";

const PROJECT_ACCENTS = [
  "#bd93f9",
  "#ff79c6",
  "#50fa7b",
  "#8be9fd",
  "#ffb86c",
  "#f1fa8c",
  "#ff5555",
  "#6272a4",
];

function projectAccent(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PROJECT_ACCENTS[Math.abs(hash) % PROJECT_ACCENTS.length];
}

function timeAgo(ts?: number): string {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type BadgeVariant = "working" | "completed" | "error" | null;

function agentBadge(state: string): BadgeVariant {
  if (state === "running") return "working";
  if (state === "done") return "completed";
  if (state === "error") return "error";
  return null;
}

const BADGE_LABELS: Record<NonNullable<BadgeVariant>, string> = {
  working: "Working",
  completed: "Completed",
  error: "Error",
};

export function Sidebar() {
  const {
    nodes,
    projects,
    activeProjectId,
    activeTerminalId,
    addProject,
    removeProject,
    setActiveProject,
    setActiveTerminalId,
    deleteNode,
    addNode,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useWorkflowStore();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [ideMenuPosition, setIdeMenuPosition] = useState<{
    x: number;
    y: number;
    projectPath: string;
  } | null>(null);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI?.openFolder();
    if (result && !result.canceled && result.path) {
      addProject(result.path);
      const newId = projects.length > 0 ? projects[projects.length - 1].id : "";
      setExpandedProjects((prev) => new Set(prev).add(newId || ""));
    }
  }, [addProject, projects]);

  const handleAddTerminal = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      addNode({ x: 0, y: 0 }, projectId);
    },
    [addNode],
  );

  const handleTerminalClick = useCallback(
    (nodeId: string, projectId: string) => {
      setActiveProject(projectId);
      setActiveTerminalId(nodeId);
    },
    [setActiveProject, setActiveTerminalId],
  );

  const handleDeleteTerminal = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      deleteNode(nodeId);
      if (activeTerminalId === nodeId) setActiveTerminalId(null);
    },
    [deleteNode, activeTerminalId, setActiveTerminalId],
  );

  const getNodesByProject = useCallback(
    (projectId: string) => nodes.filter((n) => n.data.projectId === projectId),
    [nodes],
  );

  const handleProjectRowKeyDown = useCallback(
    (e: React.KeyboardEvent, projectId: string) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      setActiveProject(projectId);
      toggleExpanded(projectId);
    },
    [setActiveProject, toggleExpanded],
  );

  const handleTerminalRowKeyDown = useCallback(
    (e: React.KeyboardEvent, nodeId: string, projectId: string) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      handleTerminalClick(nodeId, projectId);
    },
    [handleTerminalClick],
  );

  return (
    <aside
      className={`ekegai-sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <div className="sidebar-wordmark">
        {!sidebarCollapsed && <span className="wordmark-text">ekegai</span>}
        <div className="sidebar-header-actions">
          <button
            className="sidebar-new-btn"
            onClick={handleOpenProject}
            title="Open project"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft size={13} strokeWidth={2} />
            ) : (
              <PanelLeftClose size={13} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {!sidebarCollapsed && (
        <div className="sidebar-scroll">
          {projects.length === 0 ? (
            <button className="sidebar-empty-cta" onClick={handleOpenProject}>
              <FolderOpen size={15} />
              <span>Open a project</span>
            </button>
          ) : (
            projects.map((project) => {
              const projectNodes = getNodesByProject(project.id);
              const isExpanded = expandedProjects.has(project.id);
              const isActive = activeProjectId === project.id;
              const accent = projectAccent(project.id);
              const initial = project.name.charAt(0).toUpperCase();

              return (
                <div key={project.id} className="project-group">
                  <div
                    className={`project-row ${isActive ? "project-row--active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveProject(project.id);
                      toggleExpanded(project.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setIdeMenuPosition({
                        x: e.clientX,
                        y: e.clientY,
                        projectPath: project.path,
                      });
                    }}
                    onKeyDown={(e) => handleProjectRowKeyDown(e, project.id)}
                  >
                    <span className="chevron">
                      {isExpanded ? (
                        <ChevronDown size={11} strokeWidth={2.5} />
                      ) : (
                        <ChevronRight size={11} strokeWidth={2.5} />
                      )}
                    </span>

                    <span
                      className="project-avatar"
                      style={{
                        background: accent + "22",
                        color: accent,
                        borderColor: accent + "44",
                      }}
                    >
                      {initial}
                    </span>

                    <span className="project-name">{project.name}</span>

                    <button
                      type="button"
                      className="row-action"
                      onClick={(e) => handleAddTerminal(e, project.id)}
                      title="New terminal"
                    >
                      <Plus size={11} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="row-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIdeMenuPosition({
                          x: e.clientX,
                          y: e.clientY,
                          projectPath: project.path,
                        });
                      }}
                      title="Open in IDE"
                    >
                      <Code2 size={11} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="row-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProject(project.id);
                      }}
                      title="Close project"
                    >
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="terminal-group">
                      {projectNodes.length === 0 ? (
                        <button
                          type="button"
                          className="terminal-empty"
                          onClick={(e) => handleAddTerminal(e, project.id)}
                        >
                          <Plus size={11} /> <span>New terminal</span>
                        </button>
                      ) : (
                        projectNodes.map((node) => {
                          const isActiveNode = activeTerminalId === node.id;
                          const label = node.data.label || "terminal";
                          const badge = agentBadge(node.data.agentState);
                          const ts = timeAgo(node.data.createdAt);

                          return (
                            <div
                              key={node.id}
                              className={`terminal-row ${isActiveNode ? "terminal-row--active" : ""}`}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                handleTerminalClick(node.id, project.id)
                              }
                              onKeyDown={(e) =>
                                handleTerminalRowKeyDown(e, node.id, project.id)
                              }
                            >
                              {badge && (
                                <span className={`status-badge status-badge--${badge}`}>
                                  {BADGE_LABELS[badge]}
                                </span>
                              )}

                              <span className="terminal-label">{label}</span>

                              {ts && (
                                <span className="terminal-ts">{ts}</span>
                              )}

                              <button
                                type="button"
                                className="row-action terminal-kill"
                                onClick={(e) =>
                                  handleDeleteTerminal(e, node.id)
                                }
                                title="Kill terminal"
                              >
                                <X size={11} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {ideMenuPosition && (
        <IDEContextMenu
          projectPath={ideMenuPosition.projectPath}
          x={ideMenuPosition.x}
          y={ideMenuPosition.y}
          onClose={() => setIdeMenuPosition(null)}
        />
      )}
    </aside>
  );
}