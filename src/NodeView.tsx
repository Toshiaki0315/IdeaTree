import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { hitAreaSize } from "./domain/hitArea";
import type { MindMap, MindMapNode } from "./domain/mindmap";
import {
  BACKGROUND,
  CENTRAL_RX,
  CENTRAL_RY,
  LABEL_HALO_WIDTH,
  centralLabelY,
  iconPlacement,
  iconTransform,
  imageBox,
  labelPosition,
  nodeLabel,
  nodeTextStyle,
} from "./domain/nodeGeometry";
import { LINE_HEIGHT_RATIO, labelBlock, lineCenters, wrapLabel } from "./domain/wrapLabel";
import type { Editing } from "./editorState";
import NodeIcon from "./NodeIcon";

/** 編集中の入力欄の文字サイズ（App.css の .node-input と同じ） */
const EDITOR_FONT_SIZE = 16;

/** 編集中の入力欄の高さ（行数に合わせる） */
function editorHeight(draft: string): number {
  return Math.max(36, wrapLabel(draft, EDITOR_FONT_SIZE).length * EDITOR_FONT_SIZE * LINE_HEIGHT_RATIO + 16);
}

/** ラベルを中心にした、クリック範囲の長方形 */
function hitRect(centerX: number, centerY: number, label: string, fontSize: number) {
  const { width, height } = hitAreaSize(label, fontSize);
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

interface Props {
  /** レイアウト済みのマップ */
  map: MindMap;
  node: MindMapNode;
  selected: boolean;
  /** ドラッグ中に、離すとつなぎ替えられるノードなら、その方法 */
  dropMode: "child" | "reorder" | null;
  searchMatch: boolean;
  searchCurrent: boolean;
  /** このノードを編集中なら、編集の状態（そうでなければ null） */
  editing: Editing | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSelect: () => void;
  onStartEdit: () => void;
  /** ドラッグの候補になるノードを押した（マウスの位置を渡す） */
  onDragStart: (x: number, y: number) => void;
  onDraftChange: (editing: Editing, draft: string) => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>, editing: Editing) => void;
  onInputBlur: (editing: Editing) => void;
}

/** マインドマップの1つのノード（ラベル・中心の楕円・画像・アイコン・編集中の入力欄）の描画 */
export default function NodeView({
  map,
  node,
  selected,
  dropMode,
  searchMatch,
  searchCurrent,
  editing,
  inputRef,
  onSelect,
  onStartEdit,
  onDragStart,
  onDraftChange,
  onInputKeyDown,
  onInputBlur,
}: Props) {
  const isRoot = node.parentId === null;
  const look = nodeTextStyle(map, node);
  // 中心ノードは、ノードの位置（画像があれば、その下）に、それ以外は、枝の中点にラベルを置く
  const labelX = isRoot ? node.position.x : labelPosition(map, node).x;
  const labelY = isRoot ? centralLabelY(node) : labelPosition(map, node).y;
  const labelLines = labelBlock(nodeLabel(node), look.fontSize).lines;
  const box = node.image ? imageBox(map, node) : null;

  return (
    <g
      role="treeitem"
      aria-label={nodeLabel(node).replace(/\r?\n/g, " ")}
      aria-selected={selected}
      // 子を持つノードだけ、展開・折りたたみの状態を伝える
      aria-expanded={node.childIds.length > 0 ? !node.collapsed : undefined}
      data-node-id={node.id}
      data-selected={selected}
      data-drop-target={dropMode !== null}
      data-drop-mode={dropMode ?? undefined}
      data-search-match={searchMatch ? "true" : undefined}
      data-search-current={searchCurrent ? "true" : undefined}
      onMouseDown={(event) => {
        // 左ボタンで、中心ノード以外を押したときだけ、ドラッグの候補にする（入力欄の操作は除く）
        if (event.button !== 0 || isRoot || event.target instanceof HTMLTextAreaElement) return;
        onDragStart(event.clientX, event.clientY);
      }}
      onClick={onSelect}
      onDoubleClick={onStartEdit}
    >
      {!isRoot && (
        // 文字だけでは小さくて押しにくいので、まわりに透明なクリック範囲を置く
        <rect
          data-role="hit-area"
          {...hitRect(labelX, labelY, nodeLabel(node), look.fontSize)}
          fill="transparent"
        />
      )}
      {isRoot && !node.image && (
        <ellipse
          cx={node.position.x}
          cy={node.position.y}
          rx={CENTRAL_RX}
          ry={CENTRAL_RY}
          fill={BACKGROUND}
          stroke={selected ? "#1A7FD1" : look.color}
          strokeWidth={selected ? 6 : 4}
        />
      )}
      {node.image && box && (
        <>
          <image
            href={node.image}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            preserveAspectRatio="xMidYMid meet"
          />
          {selected && (
            <rect
              x={box.x - 4}
              y={box.y - 4}
              width={box.width + 8}
              height={box.height + 8}
              rx={8}
              fill="none"
              stroke="#1A7FD1"
              strokeWidth={3}
            />
          )}
        </>
      )}
      {editing === null && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={look.fontFamily}
          fontSize={look.fontSize}
          fontWeight={look.fontWeight}
          fontStyle={look.fontStyle}
          fill={look.color}
          {...(isRoot
            ? {}
            : {
                stroke: selected ? "#FFE066" : BACKGROUND,
                strokeWidth: LABEL_HALO_WIDTH + (selected ? 3 : 0),
                paintOrder: "stroke",
                strokeLinejoin: "round" as const,
              })}
        >
          {labelLines.length === 1
            ? labelLines[0]
            : labelLines.map((line, i) => (
                <tspan key={i} x={labelX} y={lineCenters(labelLines.length, look.fontSize, labelY)[i]}>
                  {line}
                </tspan>
              ))}
        </text>
      )}
      {node.icon && (
        // アイコンは、IdeaTree のオリジナルの図形（24×24 の絵を、枠に収める）
        <g data-icon-for={node.id} data-icon={node.icon} transform={iconTransform(iconPlacement(map, node))}>
          <NodeIcon id={node.icon} />
        </g>
      )}
      {editing !== null && (
        <foreignObject
          x={labelX - 80}
          y={labelY - editorHeight(editing.draft) / 2}
          width={160}
          height={editorHeight(editing.draft)}
        >
          <textarea
            ref={inputRef}
            className="node-input"
            aria-label="ノードのテキスト"
            value={editing.draft}
            onChange={(event) => onDraftChange(editing, event.target.value)}
            onKeyDown={(event) => onInputKeyDown(event, editing)}
            onBlur={() => onInputBlur(editing)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        </foreignObject>
      )}
    </g>
  );
}
