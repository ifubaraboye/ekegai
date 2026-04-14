import { useWorkflowStore } from "../store/workflowStore";
import { TerminalNode } from "./TerminalNode";
import { useEffect, useRef } from "react";

export function TileContainer() {
  const { nodes } = useWorkflowStore();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!wrapperRef.current || nodes.length === 0) return;

      const isNext = e.key === "ArrowRight" && (e.ctrlKey || e.metaKey);
      const isPrev = e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey);

      if (isNext || isPrev) {
        e.preventDefault();
        const wrapper = wrapperRef.current;
        const wrapperWidth = wrapper.clientWidth;
        const scrollLeft = wrapper.scrollLeft;

        const currentPaneIndex = Math.round(scrollLeft / 520);
        const targetPaneIndex = isNext
          ? Math.min(currentPaneIndex + 1, nodes.length - 1)
          : Math.max(currentPaneIndex - 1, 0);

        wrapper.scrollTo({
          left: targetPaneIndex * 520,
          behavior: "smooth",
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nodes.length]);

  return (
    <div className="tile-container">
      <div className="tiles-wrapper tiles-horizontal" ref={wrapperRef}>
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
