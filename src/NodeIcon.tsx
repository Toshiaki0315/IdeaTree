import { iconShapes } from "./domain/nodeIcon";
import { iconShapeAttributes } from "./domain/nodeIcon";

/** アイコン（24×24 の絵）の図形。`<svg viewBox="0 0 24 24">` や、`<g transform>` の中に置く */
export default function NodeIcon({ id }: { id: string }) {
  return (
    <>
      {iconShapes(id).map((shape, index) => {
        const attributes = iconShapeAttributes(shape);
        return (
          <path
            key={index}
            d={attributes.d}
            fill={attributes.fill}
            stroke={attributes.stroke}
            strokeWidth={attributes.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}
