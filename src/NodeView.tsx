import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { hitAreaSize } from "./domain/hitArea";
import type { MindMap, MindMapNode } from "./domain/mindmap";
import {
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
import type { Palette } from "./domain/theme";
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
  /** テーマの配色 */
  palette: Palette;
  node: MindMapNode;
  selected: boolean;
  /** 複数選択に入っている（今のノードは、selected のほう） */
  multiSelected: boolean;
  /** ドラッグ中に、離すとつなぎ替えられるノードなら、その方法 */
  dropMode: "child" | "reorder" | null;
  searchMatch: boolean;
  searchCurrent: boolean;
  /** このノードを編集中なら、編集の状態（そうでなければ null） */
  editing: Editing | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** ノードを選んだ（additive: Shift を押していて、複数選択に加える・外す） */
  onSelect: (additive: boolean) => void;
  onStartEdit: () => void;
  /** ドラッグの候補になるノードを押した（マウスの位置を渡す） */
  onDragStart: (x: number, y: number) => void;
  onDraftChange: (editing: Editing, draft: string) => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>, editing: Editing) => void;
  onInputBlur: (editing: Editing) => void;
  /** メモの印を押した */
  onOpenNote: () => void;
  /** リンクの印を押した（リンクを開く） */
  onOpenLink: (url: string) => void;
}

/** メモの印の、ツールチップ（印の名前）に使う、メモの先頭の長さ */
const NOTE_PREVIEW_LENGTH = 50;
/** ラベルと印の間、印どうしの間隔 */
const MARKER_GAP = 14;
const MARKER_SPACING = 18;

/** メモ・リンクの印（ラベルの右に並べる、押せる小さな絵）。押しても、ノードの選択やドラッグにならない */
function Marker({
  kind,
  x,
  y,
  label,
  onActivate,
}: {
  kind: "note" | "link";
  x: number;
  y: number;
  label: string;
  onActivate: () => void;
}) {
  return (
    <g
      data-marker={kind}
      role="button"
      aria-label={label}
      transform={`translate(${x} ${y})`}
      style={{ cursor: "pointer" }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <title>{label}</title>
      {kind === "note" ? (
        <>
          <rect
            x={-6}
            y={-7}
            width={12}
            height={14}
            rx={2}
            fill="#FFF8C5"
            stroke="#C9A227"
            strokeWidth={1.2}
          />
          <path d="M-3 -3H3M-3 0H3M-3 3H1" stroke="#C9A227" strokeWidth={1.2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle r={7} fill="#DDF4FF" stroke="#1A7FD1" strokeWidth={1.2} />
          <path
            d="M-3 3L3 -3M-1 -3H3V1"
            fill="none"
            stroke="#1A7FD1"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

/** マインドマップの1つのノード（ラベル・中心の楕円・画像・アイコン・編集中の入力欄）の描画 */
export default function NodeView({
  map,
  palette,
  node,
  selected,
  multiSelected,
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
  onOpenNote,
  onOpenLink,
}: Props) {
  const isRoot = node.parentId === null;
  /** 選択の見た目にするか（今のノードも、複数選択に入っているノードも） */
  const highlighted = selected || multiSelected;
  const look = nodeTextStyle(map, node, palette.centralText);
  // 中心ノードは、ノードの位置（画像があれば、その下）に、それ以外は、枝の中点にラベルを置く
  const labelX = isRoot ? node.position.x : labelPosition(map, node).x;
  const labelY = isRoot ? centralLabelY(node) : labelPosition(map, node).y;
  const block = labelBlock(nodeLabel(node), look.fontSize);
  const labelLines = block.lines;
  // メモ・リンクの印は、ラベルの右に、並べる
  const markerX = labelX + block.width / 2 + MARKER_GAP;
  const box = node.image ? imageBox(map, node) : null;

  return (
    <g
      role="treeitem"
      aria-label={nodeLabel(node).replace(/\r?\n/g, " ")}
      aria-selected={highlighted}
      // 子を持つノードだけ、展開・折りたたみの状態を伝える
      aria-expanded={node.childIds.length > 0 ? !node.collapsed : undefined}
      data-node-id={node.id}
      data-selected={selected}
      data-multi-selected={multiSelected ? "true" : undefined}
      data-drop-target={dropMode !== null}
      data-drop-mode={dropMode ?? undefined}
      data-search-match={searchMatch ? "true" : undefined}
      data-search-current={searchCurrent ? "true" : undefined}
      onMouseDown={(event) => {
        // 左ボタンで、中心ノード以外を押したときだけ、ドラッグの候補にする（入力欄の操作は除く）
        if (event.button !== 0 || isRoot || event.target instanceof HTMLTextAreaElement) return;
        onDragStart(event.clientX, event.clientY);
      }}
      onClick={(event) => onSelect(event.shiftKey)}
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
          fill={palette.background}
          stroke={highlighted ? "#1A7FD1" : look.color}
          strokeWidth={highlighted ? 6 : 4}
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
          {highlighted && (
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
                stroke: highlighted ? "#FFE066" : palette.background,
                strokeWidth: LABEL_HALO_WIDTH + (highlighted ? 3 : 0),
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
      {node.note !== undefined && (
        <Marker
          kind="note"
          x={markerX}
          y={labelY}
          label={`メモ: ${node.note.length > NOTE_PREVIEW_LENGTH ? `${node.note.slice(0, NOTE_PREVIEW_LENGTH)}…` : node.note}`}
          onActivate={onOpenNote}
        />
      )}
      {node.link !== undefined && (
        <Marker
          kind="link"
          x={markerX + (node.note !== undefined ? MARKER_SPACING : 0)}
          y={labelY}
          label={`リンクを開く: ${node.link}`}
          onActivate={() => onOpenLink(node.link as string)}
        />
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
