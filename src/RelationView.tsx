import { RELATION_STYLE, relationGeometry } from "./domain/nodeGeometry";
import type { MindMapNode } from "./domain/mindmap";

interface Props {
  id: string;
  from: MindMapNode;
  to: MindMapNode;
}

/** 関連線（2つのノードを結ぶ、破線の曲線と、矢じり）。ブランチより背面に描く */
export default function RelationView({ id, from, to }: Props) {
  const { line, arrow } = relationGeometry(from, to);
  return (
    <>
      <path
        data-relation-id={id}
        d={line}
        fill="none"
        stroke={RELATION_STYLE.color}
        strokeWidth={RELATION_STYLE.width}
        strokeDasharray={RELATION_STYLE.dash}
        strokeLinecap="round"
      />
      <path
        data-relation-arrow={id}
        d={arrow}
        fill={RELATION_STYLE.color}
        stroke={RELATION_STYLE.color}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </>
  );
}
