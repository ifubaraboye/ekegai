import { useEffect, useRef } from "react";
import {
  useWorkflowStore,
  type TerminalNode as TerminalNodeType,
} from "../store/workflowStore";
import { TerminalNode } from "./TerminalNode";

interface TileContainerProps {
  activeTerminalId: string | null;
  activeProjectId: string | null;
  nodes: TerminalNodeType[];
  onTerminalClick?: (terminalId: string, projectId: string) => void;
}

export function TileContainer({
  activeTerminalId,
  activeProjectId,
  nodes,
  onTerminalClick,
}: TileContainerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const projects = useWorkflowStore((state) => state.projects);

  useEffect(() => {
    if (!wrapperRef.current || !activeProjectId) return;

    const activeRow = wrapperRef.current.querySelector<HTMLElement>(
      `[data-project-row="${activeProjectId}"]`,
    );
    activeRow?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeProjectId]);

  useEffect(() => {
    if (!wrapperRef.current || !activeTerminalId) return;

    const activeTerminal = wrapperRef.current.querySelector<HTMLElement>(
      `[data-terminal-id="${activeTerminalId}"]`,
    );
    activeTerminal?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTerminalId]);

  const terminalRows = projects
    .map((project) => ({
      project,
      nodes: nodes.filter((node) => node.data.projectId === project.id),
    }))
    .filter(({ nodes: projectNodes }) => projectNodes.length > 0);

  return (
    <div className="tile-container">
      <div className="tiles-wrapper tiles-projects" ref={wrapperRef}>
        {terminalRows.map(({ project, nodes: projectNodes }) => (
          <section
            key={project.id}
            className={`project-terminal-row ${activeProjectId === project.id ? "project-terminal-row--active" : ""}`}
            data-project-row={project.id}
          >
            <div className="project-terminal-track">
              {projectNodes.map((node) => (
                <div
                  key={node.id}
                  className="tile-slot"
                  data-terminal-id={node.id}
                >
                  <TerminalNode
                    id={node.id}
                    data={node.data}
                    isActive={activeTerminalId === node.id}
                    onClick={() => onTerminalClick?.(node.id, project.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
        {terminalRows.length === 0 && (
          <div className="empty-tiles">
            Select a project and press + to add a terminal
          </div>
        )}
      </div>
    </div>
  );
}
