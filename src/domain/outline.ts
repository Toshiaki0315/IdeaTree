import { BRANCH_COLORS } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { createMindMap } from "./mindmap";

/** 読み込める行数の上限（巨大なファイルで、ノードが大量にできないようにする） */
export const MAX_OUTLINE_LINES = 5000;

/** 中心ノードを決められないときの、中心ノードのテキスト */
const DEFAULT_ROOT_TEXT = "中心テーマ";

/** タブは、スペース何個分のインデントとして数えるか */
const TAB_WIDTH = 4;

/**
 * マインドマップを、アウトライン（Markdown の見出しと、インデント付きの箇条書き）にする。
 * 中心ノードが `# 見出し`、枝が `- 項目`（深さごとに、スペース2つのインデント）。
 * ラベルの中の改行は、空白にする。折りたたまれたノードの子孫も、含める。
 */
export function toOutline(map: MindMap): string {
  const lines: string[] = [];
  const oneLine = (text: string) => text.replace(/\r?\n/g, " ");
  const walk = (id: NodeId, depth: number) => {
    const { text, childIds } = map.nodes[id];
    lines.push(depth === 0 ? `# ${oneLine(text)}` : `${"  ".repeat(depth - 1)}- ${oneLine(text)}`);
    childIds.forEach((childId) => walk(childId, depth + 1));
  };
  walk(map.rootId, 0);
  return lines.join("\n") + "\n";
}

interface Item {
  /** インデントの幅 */
  indent: number;
  text: string;
}

/** 行頭の空白の幅（タブは TAB_WIDTH として数える） */
function indentWidth(whitespace: string): number {
  return [...whitespace].reduce((width, char) => width + (char === "\t" ? TAB_WIDTH : 1), 0);
}

/** アウトラインの1行を、インデントとテキストにする。箇条書きの印（- * + 1. 1)）は、取り除く */
function parseLine(line: string): Item {
  const bullet = /^(\s*)(?:[-*+]|\d+[.)])(?:\s+(.*))?$/.exec(line);
  if (bullet) return { indent: indentWidth(bullet[1]), text: (bullet[2] ?? "").trim() };
  const plain = /^(\s*)(.*)$/.exec(line) as RegExpExecArray;
  return { indent: indentWidth(plain[1]), text: plain[2].trim() };
}

/**
 * アウトラインから、マインドマップを作る。
 * 先頭の `# 見出し` が中心ノード。見出しがなければ、一番上の行が1つだけのとき、それが中心ノードで、
 * 複数なら、中心ノードは「中心テーマ」にして、それらをメインブランチにする。
 * 階層は、インデントで決める（スペース・タブ、何段でもよい。箇条書きの印は、あってもなくてもよい）。
 * 空行は無視する。テキストがなければ、エラーにする。
 */
export function fromOutline(source: string): MindMap {
  const rawLines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (rawLines.length > MAX_OUTLINE_LINES) {
    throw new Error(`アウトラインの行数が多すぎます（上限 ${MAX_OUTLINE_LINES} 行）`);
  }

  let rootText: string | null = null;
  const items: Item[] = [];
  for (const line of rawLines) {
    if (line.trim() === "") continue;
    const heading: RegExpExecArray | null =
      items.length === 0 && rootText === null ? /^#\s+(.+)$/.exec(line.trim()) : null;
    if (heading) {
      rootText = heading[1].trim();
      continue;
    }
    const item = parseLine(line);
    if (item.text !== "") items.push(item);
  }
  if (rootText === null && items.length === 0) {
    throw new Error("アウトラインにテキストがありません");
  }

  // インデントから、各行の深さを決める（深くなるときは、何段でも、1段だけ）
  const stack: number[] = [];
  const depths = items.map(({ indent }) => {
    while (stack.length > 0 && stack[stack.length - 1] >= indent) stack.pop();
    stack.push(indent);
    return stack.length - 1;
  });

  // 見出しがなく、一番上の行が1つなら、それを中心ノードにする
  const topCount = depths.filter((depth) => depth === 0).length;
  let offset = 0;
  if (rootText === null) {
    if (topCount === 1) {
      rootText = items[0].text;
      items.shift();
      depths.shift();
      offset = 1; // 残りの行は、中心ノードの子（深さ 1 以降）
    } else {
      rootText = DEFAULT_ROOT_TEXT;
    }
  }

  // ノードは、直接組み立てる（1行ずつ addChild でマップを作り直すと、行数の2乗の時間がかかる）
  const root = createMindMap(rootText);
  const nodes: Record<NodeId, MindMapNode> = { ...root.nodes };
  // 深さ d の直前のノード（親の候補）。0 は、中心ノード
  const lastAtDepth: NodeId[] = [root.rootId];
  let mainCount = 0;
  items.forEach((item, i) => {
    const depth = depths[i] + (offset === 1 ? 0 : 1);
    const parent = nodes[lastAtDepth[depth - 1]];
    const id = crypto.randomUUID();
    const node: MindMapNode = {
      id,
      kind: "branch",
      text: item.text,
      parentId: parent.id,
      childIds: [],
      position: { ...parent.position },
    };
    // メインブランチ（中心ノードの子）には、パレットから、順に色を割り当てる
    if (parent.parentId === null) node.branchColor = BRANCH_COLORS[mainCount++ % BRANCH_COLORS.length];
    parent.childIds.push(id);
    nodes[id] = node;
    lastAtDepth[depth] = id;
  });
  return { rootId: root.rootId, nodes };
}
