// src/features/ai-canvas/ai-canvas-store.js
// V143（AI 无限画布 MVP-1）：画布状态 / 项目持久化 / 撤销重做。
// 隔离存储键 jingyin-ai-canvases-v1，与休眠的 jingyin-infinite-canvases-v1 完全独立。
// 复用 src/lib/storage/json-storage.js（与现有设置存储同款）。
import { useEffect, useMemo, useReducer, useRef } from "react";
import { readJsonStorage, writeJsonStorage } from "../../lib/storage/json-storage.js";

const PROJECTS_KEY = "jingyin-ai-canvases-v1";
const HISTORY_LIMIT = 60;
const DEFAULT_ZOOM = 1;

let seq = 0;
function uid(prefix) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeNode(type, x, y, data = {}) {
  const base = { id: uid("n"), type, x, y, data };
  if (type === "prompt") {
    base.w = 240;
    base.h = 130;
  } else if (type === "image" || type === "result") {
    base.w = 240;
    base.h = 220;
  } else if (type === "generation") {
    base.w = 280;
    base.h = 224;
  } else {
    base.w = 220;
    base.h = 120;
  }
  return base;
}

function snapshot(editable) {
  return JSON.parse(JSON.stringify(editable));
}

// 在 reducer 内对「当前打开项目」的可编辑部分（nodes/edges/viewport）做变更，
// 并把变更前状态压入 past（撤销栈），清空 future。viewport 单独走 SET_VIEWPORT（不入历史）。
function commit(state, mutate) {
  if (!state.currentId) return state;
  const idx = state.projects.findIndex((p) => p.id === state.currentId);
  if (idx < 0) return state;
  const project = state.projects[idx];
  const prev = { nodes: project.nodes, edges: project.edges, viewport: project.viewport };
  const next = mutate({ nodes: project.nodes, edges: project.edges, viewport: project.viewport });
  if (!next || next === prev) return state;
  const newProject = { ...project, nodes: next.nodes, edges: next.edges, updatedAt: Date.now() };
  const projects = state.projects.slice();
  projects[idx] = newProject;
  const past = [...state.past, snapshot(prev)].slice(-HISTORY_LIMIT);
  return { ...state, projects, past, future: [] };
}

// 生成节点状态/结果是「异步外部结果 + 持久化」，不入撤销栈（避免撤销把已生成结果回退）。
function patchNodeDataNoHistory(state, id, patch, extraNodes) {
  const idx = state.projects.findIndex((p) => p.id === state.currentId);
  if (idx < 0) return state;
  const project = state.projects[idx];
  const nodes = project.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  const projects = state.projects.slice();
  projects[idx] = {
    ...project,
    nodes: extraNodes ? [...nodes, ...extraNodes] : nodes,
    updatedAt: Date.now()
  };
  return { ...state, projects };
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, projects: Array.isArray(action.projects) ? action.projects : [] };

    case "CREATE_PROJECT": {
      const id = uid("p");
      const project = {
        id,
        name: action.name || `画布 ${state.projects.length + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: DEFAULT_ZOOM }
      };
      return { ...state, projects: [...state.projects, project], currentId: id, selectedNodeId: null, past: [], future: [] };
    }

    case "OPEN_PROJECT": {
      if (!state.projects.some((p) => p.id === action.id)) return state;
      return { ...state, currentId: action.id, selectedNodeId: null, past: [], future: [] };
    }

    case "DELETE_PROJECT": {
      const projects = state.projects.filter((p) => p.id !== action.id);
      const currentId = state.currentId === action.id ? null : state.currentId;
      return { ...state, projects, currentId, past: [], future: [] };
    }

    case "RENAME_PROJECT": {
      const idx = state.projects.findIndex((p) => p.id === state.currentId);
      if (idx < 0) return state;
      const projects = state.projects.slice();
      projects[idx] = { ...projects[idx], name: action.name, updatedAt: Date.now() };
      return { ...state, projects };
    }

    case "ADD_NODE":
      return commit(state, (e) => ({ ...e, nodes: [...e.nodes, action.node] }));

    case "MOVE_NODE":
      return commit(state, (e) => ({
        ...e,
        nodes: e.nodes.map((n) => (n.id === action.id ? { ...n, x: action.x, y: action.y } : n))
      }));

    case "UPDATE_NODE_DATA":
      return commit(state, (e) => ({
        ...e,
        nodes: e.nodes.map((n) => (n.id === action.id ? { ...n, data: { ...n.data, ...action.data } } : n))
      }));

    case "DELETE_NODE":
      return commit(state, (e) => ({
        ...e,
        nodes: e.nodes.filter((n) => n.id !== action.id),
        edges: e.edges.filter((ed) => ed.from !== action.id && ed.to !== action.id)
      }));

    case "ADD_EDGE": {
      const { from, to } = action.edge;
      if (from === to) return state;
      return commit(state, (e) => {
        if (e.edges.some((ed) => ed.from === from && ed.to === to)) return e;
        return { ...e, edges: [...e.edges, { id: uid("e"), from, to }] };
      });
    }

    case "DELETE_EDGE":
      return commit(state, (e) => ({ ...e, edges: e.edges.filter((ed) => ed.id !== action.id) }));

    case "SET_VIEWPORT": {
      if (!state.currentId) return state;
      const idx = state.projects.findIndex((p) => p.id === state.currentId);
      if (idx < 0) return state;
      const projects = state.projects.slice();
      projects[idx] = { ...projects[idx], viewport: action.viewport, updatedAt: Date.now() };
      return { ...state, projects };
    }

    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.id };

    // —— 生成节点：异步结果不走撤销栈 ——
    case "GENERATION_STARTED":
      return patchNodeDataNoHistory(state, action.id, { status: "running", error: null, resultUrl: null });

    case "GENERATION_SUCCESS": {
      const idx = state.projects.findIndex((p) => p.id === state.currentId);
      if (idx < 0) return state;
      const genNode = state.projects[idx].nodes.find((n) => n.id === action.id);
      if (!genNode) return state;
      const extraNodes = [];
      if (action.createResultNode) {
        const resultNode = makeNode(
          "result",
          genNode.x + genNode.w + 64,
          genNode.y,
          { src: action.resultUrl, name: "生成结果", fromGeneration: action.id }
        );
        extraNodes.push(resultNode);
        // 生成节点成功时一并连一条到结果节点的边（与 GENERATION_SUCCESS 同批写入）。
        const edge = { id: uid("e"), from: action.id, to: resultNode.id };
        const project = state.projects[idx];
        const edges = [...project.edges, edge];
        const patched = patchNodeDataNoHistory(
          { ...state, projects: state.projects.map((p, i) => (i === idx ? { ...p, edges } : p)) },
          action.id,
          { status: "success", resultUrl: action.resultUrl, usedModel: action.usedModel, error: null },
          extraNodes
        );
        return patched;
      }
      return patchNodeDataNoHistory(state, action.id, {
        status: "success",
        resultUrl: action.resultUrl,
        usedModel: action.usedModel,
        error: null
      });
    }

    case "GENERATION_FAILED":
      return patchNodeDataNoHistory(state, action.id, { status: "failed", error: action.error });

    case "UNDO": {
      if (!state.past.length || !state.currentId) return state;
      const past = state.past.slice();
      const prev = past.pop();
      const idx = state.projects.findIndex((p) => p.id === state.currentId);
      if (idx < 0) return state;
      const project = state.projects[idx];
      const curr = { nodes: project.nodes, edges: project.edges, viewport: project.viewport };
      const projects = state.projects.slice();
      projects[idx] = { ...project, ...prev, updatedAt: Date.now() };
      const future = [snapshot(curr), ...state.future].slice(0, HISTORY_LIMIT);
      return { ...state, projects, past, future, selectedNodeId: null };
    }

    case "REDO": {
      if (!state.future.length || !state.currentId) return state;
      const future = state.future.slice();
      const next = future.shift();
      const idx = state.projects.findIndex((p) => p.id === state.currentId);
      if (idx < 0) return state;
      const project = state.projects[idx];
      const curr = { nodes: project.nodes, edges: project.edges, viewport: project.viewport };
      const projects = state.projects.slice();
      projects[idx] = { ...project, ...next, updatedAt: Date.now() };
      const past = [...state.past, snapshot(curr)].slice(-HISTORY_LIMIT);
      return { ...state, projects, past, future, selectedNodeId: null };
    }

    default:
      return state;
  }
}

const INITIAL = { projects: [], currentId: null, selectedNodeId: null, past: [], future: [] };

export function useAiCanvasStore() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const saveTimer = useRef(null);

  useEffect(() => {
    const data = readJsonStorage(PROJECTS_KEY, { projects: [] });
    dispatch({ type: "HYDRATE", projects: data?.projects || [] });
  }, []);

  // 防抖持久化（与设置存储同口径：300ms 写回）。
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeJsonStorage(PROJECTS_KEY, { projects: state.projects });
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [state.projects]);

  const current = useMemo(
    () => state.projects.find((p) => p.id === state.currentId) || null,
    [state.projects, state.currentId]
  );

  const actions = useMemo(
    () => ({
      createProject: (name) => dispatch({ type: "CREATE_PROJECT", name }),
      openProject: (id) => dispatch({ type: "OPEN_PROJECT", id }),
      deleteProject: (id) => dispatch({ type: "DELETE_PROJECT", id }),
      renameProject: (name) => dispatch({ type: "RENAME_PROJECT", name }),
      addNode: (node) => dispatch({ type: "ADD_NODE", node }),
      moveNode: (id, x, y) => dispatch({ type: "MOVE_NODE", id, x, y }),
      updateNodeData: (id, data) => dispatch({ type: "UPDATE_NODE_DATA", id, data }),
      deleteNode: (id) => dispatch({ type: "DELETE_NODE", id }),
      addEdge: (edge) => dispatch({ type: "ADD_EDGE", edge }),
      deleteEdge: (id) => dispatch({ type: "DELETE_EDGE", id }),
      setViewport: (viewport) => dispatch({ type: "SET_VIEWPORT", viewport }),
      selectNode: (id) => dispatch({ type: "SELECT_NODE", id }),
      startGeneration: (id) => dispatch({ type: "GENERATION_STARTED", id }),
      completeGeneration: (id, payload) => dispatch({ type: "GENERATION_SUCCESS", id, ...payload }),
      failGeneration: (id, error) => dispatch({ type: "GENERATION_FAILED", id, error }),
      undo: () => dispatch({ type: "UNDO" }),
      redo: () => dispatch({ type: "REDO" })
    }),
    []
  );

  return {
    state,
    current,
    actions,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0
  };
}
