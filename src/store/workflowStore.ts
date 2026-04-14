import { create } from "zustand";
import {
  Nodes,
  Edge,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  addEdge as addEdgeFn,
} from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";

export type AgentProvider = "claude" | "openai" | "ollama";

export interface AgentConfig {
  provider: AgentProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
}

export type AgentState = "idle" | "running" | "done" | "error";

export interface TerminalNodeData {
  ptyId: string;
  label: string;
  agentConfig?: AgentConfig;
  agentState: AgentState;
  lastOutput?: string;
}

export type TerminalNode = Nodes<TerminalNodeData, "terminal">;
export type WorkflowEdge = Edge;

interface WorkflowState {
  nodes: TerminalNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  contextMenuPosition: { x: number; y: number } | null;
  isAgentConfigModalOpen: boolean;
  configModalNodeId: string | null;
  onNodesChange: OnNodesChange<TerminalNode>;
  onEdgesChange: OnEdgesChange<WorkflowEdge>;
  onConnect: OnConnect;
  addNode: (position: { x: number; y: number }) => string;
  updateNodeData: (id: string, data: Partial<TerminalNodeData>) => void;
  deleteNode: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setContextMenu: (position: { x: number; y: number } | null) => void;
  openAgentConfig: (nodeId: string) => void;
  closeAgentConfig: () => void;
  runAgent: (nodeId: string, inputData?: string) => Promise<void>;
  getDownstreamNodes: (nodeId: string) => TerminalNode[];
  serialize: () => string;
  load: (json: string) => void;
}

function createInitialNode(position: { x: number; y: number }): TerminalNode {
  const ptyId = uuidv4();
  return {
    id: uuidv4(),
    type: "terminal",
    position,
    data: {
      ptyId,
      label: "Terminal",
      agentState: "idle",
    },
    style: {
      width: 400,
      minWidth: 300,
    },
  };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  contextMenuPosition: null,
  isAgentConfigModalOpen: false,
  configModalNodeId: null,

  onNodesChange: (changes: NodeChange<TerminalNode>[]) => {
    set({
      nodes: applyNodeChanges(
        changes,
        get().nodes as Nodes<TerminalNodeData, "terminal">[],
      ) as TerminalNode[],
    });
  },

  onEdgesChange: (changes: NodeChange<WorkflowEdge>[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges) as WorkflowEdge[],
    });
  },

  onConnect: (connection) => {
    set({
      edges: addEdgeFn(connection, get().edges) as WorkflowEdge[],
    });
  },

  addNode: (position) => {
    const newNode = createInitialNode(position);
    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));
    return newNode.data.ptyId;
  },

  updateNodeData: (id, data) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node,
      ) as TerminalNode[],
    }));
  },

  deleteNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) {
      window.electronAPI?.ptyKill(node.data.ptyId);
    }
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  },

  setSelectedNode: (id) => {
    set({ selectedNodeId: id });
  },

  setContextMenu: (position) => {
    set({ contextMenuPosition: position });
  },

  openAgentConfig: (nodeId) => {
    set({ isAgentConfigModalOpen: true, configModalNodeId: nodeId });
  },

  closeAgentConfig: () => {
    set({ isAgentConfigModalOpen: false, configModalNodeId: null });
  },

  runAgent: async (nodeId, inputData) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node || !node.data.agentConfig) {
      console.warn("No agent config for node", nodeId);
      return;
    }

    state.updateNodeData(nodeId, { agentState: "running" });

    try {
      const { runAgent } = await import("../lib/agentRunner");
      await runAgent(
        node.data.ptyId,
        node.data.agentConfig,
        inputData || node.data.lastOutput || "",
        (output) => {
          window.electronAPI?.ptyInput(node.data.ptyId, output);
        },
      );
      state.updateNodeData(nodeId, {
        agentState: "done",
        lastOutput: inputData,
      });
    } catch (error) {
      console.error("Agent error:", error);
      state.updateNodeData(nodeId, { agentState: "error" });
    }
  },

  getDownstreamNodes: (nodeId) => {
    const state = get();
    const downstreamEdgeIds = state.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);
    return state.nodes.filter((n) =>
      downstreamEdgeIds.includes(n.id),
    ) as TerminalNode[];
  },

  serialize: () => {
    const state = get();
    const cleanNodes = state.nodes.map(({ data, ...node }) => ({
      ...node,
      data: {
        ...data,
        agentState: "idle",
      },
    }));
    return JSON.stringify({ nodes: cleanNodes, edges: state.edges });
  },

  load: (json) => {
    try {
      const { nodes: loadedNodes, edges: loadedEdges } = JSON.parse(json);
      const ptyIdMap = new Map<string, string>();

      for (const node of loadedNodes) {
        const newPtyId = uuidv4();
        ptyIdMap.set(node.data.ptyId, newPtyId);
        node.data.ptyId = newPtyId;
        node.data.agentState = "idle";
      }

      for (const edge of loadedEdges) {
        if (ptyIdMap.has(edge.source)) {
          edge.source =
            Array.from(ptyIdMap.entries()).find(
              ([k]) => k === edge.source,
            )?.[1] || edge.source;
        }
        if (ptyIdMap.has(edge.target)) {
          edge.target =
            Array.from(ptyIdMap.entries()).find(
              ([k]) => k === edge.target,
            )?.[1] || edge.target;
        }
      }

      set({ nodes: loadedNodes, edges: loadedEdges });

      for (const node of loadedNodes) {
        window.electronAPI?.ptyCreate(node.data.ptyId, 80, 24);
      }
    } catch (error) {
      console.error("Failed to load workflow:", error);
    }
  },
}));
