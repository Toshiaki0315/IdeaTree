import { RELATION_LABEL, RELATION_STYLE, relationGeometry } from "./domain/nodeGeometry";
import type { MindMapNode } from "./domain/mindmap";

interface Props {
  id: string;
  from: MindMapNode;
  to: MindMapNode;
  /** 線の色（なければ、既定のグレー） */
  color?: string;
  /** 線を押した（クリックした） */
  onActivate: () => void;
}

/** 関連線（2つのノードを結ぶ、破線の曲線と、矢じり）。ブランチより背面に描く */
export default function RelationView({ id, from, to, color = RELATION_STYLE.color, onActivate }: Props) {
  const { line, arrow } = relationGeometry(from, to);
  return (
    <>
      {/* 細い破線は押しにくいので、まわりに、透明で太い、押せる範囲を置く */}
      <path
        data-relation-hit={id}
        d={line}
        fill="none"
        stroke="transparent"
        strokeWidth={RELATION_STYLE.hitWidth}
        style={{ cursor: "pointer" }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onActivate();
        }}
      />
      <path
        data-relation-id={id}
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={RELATION_STYLE.width}
        strokeDasharray={RELATION_STYLE.dash}
        strokeLinecap="round"
      />
      <path
        data-relation-arrow={id}
        d={arrow}
        fill={color}
        stroke={color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </>
  );
}

interface LabelProps {
  id: string;
  from: MindMapNode;
  to: MindMapNode;
  label: string;
  color?: string;
  /** 縁取りの色（背景と同じ色） */
  background: string;
}

/** 関連線のラベル。曲線の中ほどに、文字で描く（ノードのラベルと同じく、前面） */
export function RelationLabel({ id, from, to, label, color = RELATION_STYLE.color, background }: LabelProps) {
  const { mid } = relationGeometry(from, to);
  return (
    <text
      data-relation-label={id}
      x={mid.x}
      y={mid.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={RELATION_LABEL.fontSize}
      fill={color}
      stroke={background}
      strokeWidth={RELATION_LABEL.haloWidth}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {label}
    </text>
  );
}
