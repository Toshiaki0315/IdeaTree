import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import "./App.css";
import { addChild } from "./domain/addChild";
import { addSibling } from "./domain/addSibling";
import { getBranchColor } from "./domain/branchColor";
import { deleteNode } from "./domain/deleteNode";
import { layout } from "./domain/layout";
import { createMindMap } from "./domain/mindmap";
import type { MindMap, NodeId } from "./domain/mindmap";
import { navigate } from "./domain/navigate";
import type { NavigateDirection } from "./domain/navigate";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  CENTRAL_STROKE,
  FONT_FAMILY,
  LABEL_HALO_WIDTH,
  branchPath,
  depthOf,
  strokeWidthAt,
} from "./domain/svgExport";
import { updateText } from "./domain/updateText";

/** 編集中のノードと入力途中のテキスト */
interface Editing {
  nodeId: NodeId;
  draft: string;
  /** Tab/Enter で追加した直後のノードか（取り消し・空確定で破棄する） */
  isNew: boolean;
}

const ARROW_DIRECTIONS: Record<string, NavigateDirection> = {
  ArrowRight: "firstChild",
  ArrowLeft: "parent",
  ArrowDown: "nextSibling",
  ArrowUp: "prevSibling",
};

/** 表示領域の最小の半径。マップが小さい間は拡大しすぎないようにする */
const MIN_HALF_EXTENT = 450;
const VIEW_MARGIN = 160;

function initialMap(): MindMap {
  return createMindMap("中心テーマ");
}

export default function App() {
  const [map, setMap] = useState<MindMap>(initialMap);
  const [selectedId, setSelectedId] = useState<NodeId>(() => map.rootId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const laidOut = useMemo(() => layout(map), [map]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 追加直後のノードを破棄し、親を選択する */
  const discardNode = (nodeId: NodeId) => {
    const parentId = map.nodes[nodeId].parentId as NodeId;
    setMap(deleteNode(map, nodeId));
    setSelectedId(parentId);
  };

  const commitEdit = (editing: Editing) => {
    const text = editing.draft.trim();
    if (text === "") {
      if (editing.isNew) discardNode(editing.nodeId);
    } else {
      setMap(updateText(map, editing.nodeId, text));
    }
    setEditing(null);
  };

  const cancelEdit = (editing: Editing) => {
    if (editing.isNew) discardNode(editing.nodeId);
    setEditing(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editing || event.target instanceof HTMLInputElement) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const node = map.nodes[selectedId];
      const isRoot = node.parentId === null;

      if (event.key === "Tab") {
        event.preventDefault();
        const added = addChild(map, selectedId, "");
        setMap(added.map);
        setSelectedId(added.nodeId);
        setEditing({ nodeId: added.nodeId, draft: "", isNew: true });
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (isRoot) return;
        const added = addSibling(map, selectedId, "");
        setMap(added.map);
        setSelectedId(added.nodeId);
        setEditing({ nodeId: added.nodeId, draft: "", isNew: true });
      } else if (event.key === "F2") {
        event.preventDefault();
        setEditing({ nodeId: selectedId, draft: node.text, isNew: false });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (isRoot) return;
        const parentId = node.parentId as NodeId;
        setMap(deleteNode(map, selectedId));
        setSelectedId(parentId);
      } else if (event.key in ARROW_DIRECTIONS) {
        event.preventDefault();
        setSelectedId(navigate(map, selectedId, ARROW_DIRECTIONS[event.key]));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [map, selectedId, editing]);

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, editing: Editing) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit(editing);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit(editing);
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  };

  const nodes = Object.values(laidOut.nodes);
  const half = Math.max(
    MIN_HALF_EXTENT,
    ...nodes.map((n) => Math.max(Math.abs(n.position.x), Math.abs(n.position.y)) + VIEW_MARGIN),
  );

  return (
    <svg
      className="mindmap"
      role="application"
      aria-label="マインドマップ"
      viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
    >
      <rect x={-half} y={-half} width={half * 2} height={half * 2} fill={BACKGROUND} />
      {nodes.map((node) => {
        if (node.parentId === null) return null;
        return (
          <path
            key={node.id}
            d={branchPath(laidOut.nodes[node.parentId], node)}
            fill="none"
            stroke={getBranchColor(laidOut, node.id) as string}
            strokeWidth={strokeWidthAt(depthOf(laidOut, node))}
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map((node) => {
        const isRoot = node.parentId === null;
        const color = isRoot ? CENTRAL_STROKE : (getBranchColor(laidOut, node.id) as string);
        const parent = isRoot ? node : laidOut.nodes[node.parentId as NodeId];
        const labelX = (parent.position.x + node.position.x) / 2;
        const labelY = (parent.position.y + node.position.y) / 2;
        const isEditing = editing?.nodeId === node.id;
        const selected = node.id === selectedId;

        return (
          <g key={node.id} data-node-id={node.id} data-selected={selected}>
            {isRoot && (
              <ellipse
                cx={node.position.x}
                cy={node.position.y}
                rx={CENTRAL_RX}
                ry={CENTRAL_RY}
                fill={BACKGROUND}
                stroke={selected ? "#1A7FD1" : CENTRAL_STROKE}
                strokeWidth={selected ? 6 : 4}
              />
            )}
            {!isEditing && (
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily={FONT_FAMILY}
                fontSize={isRoot ? 24 : depthOf(laidOut, node) === 1 ? 20 : 16}
                fontWeight="bold"
                fill={color}
                {...(isRoot
                  ? {}
                  : {
                      stroke: selected ? "#FFE066" : BACKGROUND,
                      strokeWidth: LABEL_HALO_WIDTH + (selected ? 3 : 0),
                      paintOrder: "stroke",
                      strokeLinejoin: "round" as const,
                    })}
              >
                {node.text}
              </text>
            )}
            {isEditing && editing && (
              <foreignObject x={labelX - 80} y={labelY - 18} width={160} height={36}>
                <input
                  ref={inputRef}
                  className="node-input"
                  aria-label="ノードのテキスト"
                  value={editing.draft}
                  onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                  onKeyDown={(event) => onInputKeyDown(event, editing)}
                />
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
}
