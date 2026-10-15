import { BRANCH_COLORS } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { createMindMap } from "./mindmap";
import { MAX_NOTE_LENGTH, isLink } from "./nodeNote";

/** 読み込める行数の上限（巨大なファイルで、ノードが大量にできないようにする） */
export const MAX_OUTLINE_LINES = 5000;

/** 中心ノードを決められないときの、中心ノードのテキスト */
const DEFAULT_ROOT_TEXT = "中心テーマ";

/** タブは、スペース何個分のインデントとして数えるか */
const TAB_WIDTH = 4;

/** URL の括弧を、%28・%29 にする（[ラベル](URL) の括弧と、取り違えないように） */
function encodeUrl(url: string): string {
  return url.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * マインドマップを、アウトライン（Markdown の見出しと、インデント付きの箇条書き）にする。
 * 中心ノードが `# 見出し`、枝が `- 項目`（深さごとに、スペース2つのインデント）。
 * リンクは `[ラベル](URL)`、メモは、そのノードの行の直後の、`> ` で始まる行（子と同じインデント）。
 * ラベルの中の改行は、空白にする。折りたたまれたノードの子孫も、含める。
 */
export function toOutline(map: MindMap): string {
  const lines: string[] = [];
  const oneLine = (text: string) => text.replace(/\r?\n/g, " ");
  const walk = (id: NodeId, depth: number) => {
    const { text, link, note, childIds } = map.nodes[id];
    const label = link === undefined ? oneLine(text) : `[${oneLine(text)}](${encodeUrl(link)})`;
    lines.push(depth === 0 ? `# ${label}` : `${"  ".repeat(depth - 1)}- ${label}`);
    // メモは、子と同じインデントの、「> 」の行にする（空行は、「>」だけ）
    const noteIndent = "  ".repeat(depth);
    for (const line of note === undefined ? [] : note.split(/\r?\n/)) {
      lines.push(line === "" ? `${noteIndent}>` : `${noteIndent}> ${line}`);
    }
    childIds.forEach((childId) => walk(childId, depth + 1));
  };
  walk(map.rootId, 0);
  return lines.join("\n") + "\n";
}

/** 読み込んだ、1つのノード分（中心ノードの見出しも含む） */
interface Entry {
  text: string;
  link?: string;
  /** メモの行（「> 」を取り除いたもの） */
  notes: string[];
}

interface Item extends Entry {
  /** インデントの幅 */
  indent: number;
}

/** 行頭の空白の幅（タブは TAB_WIDTH として数える） */
function indentWidth(whitespace: string): number {
  return [...whitespace].reduce((width, char) => width + (char === "\t" ? TAB_WIDTH : 1), 0);
}

/**
 * アウトラインの1行を、インデント・テキスト・箇条書きの印の有無にする。
 * 箇条書きの印（- * + 1. 1)）は、取り除く。
 */
function parseLine(line: string): { indent: number; text: string; bullet: boolean } {
  const bullet = /^(\s*)(?:[-*+]|\d+[.)])(?:\s+(.*))?$/.exec(line);
  if (bullet) return { indent: indentWidth(bullet[1]), text: (bullet[2] ?? "").trim(), bullet: true };
  const plain = /^(\s*)(.*)$/.exec(line) as RegExpExecArray;
  return { indent: indentWidth(plain[1]), text: plain[2].trim(), bullet: false };
}

/**
 * `[ラベル](URL)` の形のテキストを、ラベルとリンクに分ける。URL は、http・https で、%28・%29 は ( ) に戻す。
 * その形でない、または、URL が使えないときは、そのまま（リンクなし）。
 */
function splitLink(text: string): { text: string; link?: string } {
  const match = /^\[(.*)\]\((https?:\/\/[^\s)]+)\)$/i.exec(text);
  if (match) {
    const link = match[2].replace(/%28/g, "(").replace(/%29/g, ")");
    if (isLink(link)) return { text: match[1], link };
  }
  return { text };
}

/** メモの行を、1つの文字列にする（先頭・末尾の空行は、取り除く）。なければ undefined */
function joinNotes(lines: string[]): string | undefined {
  const start = lines.findIndex((line) => line !== "");
  if (start === -1) return undefined;
  let end = lines.length;
  while (lines[end - 1] === "") end--;
  const note = lines.slice(start, end).join("\n");
  if (note.length > MAX_NOTE_LENGTH) throw new Error(`メモが長すぎます（上限 ${MAX_NOTE_LENGTH} 文字）`);
  return note;
}

/**
 * アウトラインから、マインドマップを作る。
 * 先頭の `# 見出し` が中心ノード。見出しがなければ、一番上の行が 1 つだけのとき、それが中心ノードで、
 * 複数なら、中心ノードは「中心テーマ」にして、それらをメインブランチにする。
 * 階層は、インデントで決める（スペース・タブ、何段でもよい。箇条書きの印は、あってもなくてもよい）。
 * `[ラベル](URL)` は、リンク。箇条書きの印のない `> ` の行は、直前のノード（見出しの直後なら、中心ノード）のメモ。
 * 空行は無視する。テキストがなければ、エラーにする。
 */
export function fromOutline(source: string): MindMap {
  const rawLines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (rawLines.length > MAX_OUTLINE_LINES) {
    throw new Error(`アウトラインの行数が多すぎます（上限 ${MAX_OUTLINE_LINES} 行）`);
  }

  let heading: Entry | null = null;
  const items: Item[] = [];
  for (const line of rawLines) {
    if (line.trim() === "") continue;
    const headingMatch: RegExpExecArray | null =
      items.length === 0 && heading === null ? /^#\s+(.+)$/.exec(line.trim()) : null;
    if (headingMatch) {
      heading = { ...splitLink(headingMatch[1].trim()), notes: [] };
      continue;
    }
    const { indent, text, bullet } = parseLine(line);
    // 箇条書きの印のない「> 」の行は、直前のノードのメモ（メモをつける先がなければ、普通の行）
    const note = bullet ? null : /^>(?: ?(.*))?$/.exec(text);
    const target = items.length > 0 ? items[items.length - 1] : heading;
    if (note && target) {
      target.notes.push((note[1] ?? "").trimEnd());
    } else if (text !== "") {
      items.push({ indent, ...splitLink(text), notes: [] });
    }
  }
  if (heading === null && items.length === 0) {
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
  if (heading === null) {
    if (topCount === 1) {
      heading = items.shift() as Item;
      depths.shift();
      offset = 1; // 残りの行は、中心ノードの子（深さ 1 以降）
    } else {
      heading = { text: DEFAULT_ROOT_TEXT, notes: [] };
    }
  }

  // ノードは、直接組み立てる（1行ずつ addChild でマップを作り直すと、行数の2乗の時間がかかる）
  const root = createMindMap(heading.text);
  const nodes: Record<NodeId, MindMapNode> = { ...root.nodes };
  const rootNote = joinNotes(heading.notes);
  if (heading.link !== undefined) nodes[root.rootId].link = heading.link;
  if (rootNote !== undefined) nodes[root.rootId].note = rootNote;
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
    if (item.link !== undefined) node.link = item.link;
    const note = joinNotes(item.notes);
    if (note !== undefined) node.note = note;
    // メインブランチ（中心ノードの子）には、パレットから、順に色を割り当てる
    if (parent.parentId === null) node.branchColor = BRANCH_COLORS[mainCount++ % BRANCH_COLORS.length];
    parent.childIds.push(id);
    nodes[id] = node;
    lastAtDepth[depth] = id;
  });
  return { rootId: root.rootId, nodes };
}
