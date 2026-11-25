import { Fragment } from "react";
import type { getAvatarMaterialPlan } from "@/lib/profile/avatar-materials";

type Plan = NonNullable<ReturnType<typeof getAvatarMaterialPlan>>;

/** One source image, one alpha-preserving filter. No stacked portrait overlays. */
export function AvatarMaterialFilter({ id, plan, x, y, size }: {
  id: string;
  plan: Plan;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      x={x} y={y} width={size} height={size} colorInterpolationFilters="sRGB">
      <feImage href={plan.coverageUri} x={x} y={y} width={size} height={size}
        preserveAspectRatio="none" result="coverage" />
      <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="shading" />
      {plan.frameGuard !== false && plan.channels.some(({ part }) => part === "frame") && (
        <feColorMatrix in="SourceGraphic" type="matrix" result="frame-guard"
          values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -0.708667 -2.384 -0.240667 0 1.833333" />
      )}
      {plan.channels.map(({ part }, index) => {
        const weights = part === "hair" ? "1 0 0" : part === "skin" ? "0 1 0" : "0 0 1";
        const guardFrame = part === "frame" && plan.frameGuard !== false;
        return (
          <Fragment key={part}>
            <feColorMatrix in="coverage" type="matrix" result={guardFrame ? "frame-path" : `mask-${part}`}
              values={`0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${weights} 0 0`} />
            {guardFrame && <feComposite in="frame-path" in2="frame-guard" operator="in" result="mask-frame" />}
            <feComposite in={`mask-${part}`} in2={index === 0 ? `mask-${part}` : `selected-${index - 1}`}
              operator="arithmetic" k1={0} k2={1} k3={index === 0 ? 0 : 1} k4={0} result={`selected-${index}`} />
          </Fragment>
        );
      })}
      <feComposite in="SourceGraphic" in2={`selected-${plan.channels.length - 1}`} operator="out" result="unselected" />
      {plan.channels.map(({ part, tables }, index) => (
          <Fragment key={part}>
            <feComponentTransfer in={part === "skin" ? "SourceGraphic" : "shading"} result={`tint-${part}`}>
              <feFuncR type="table" tableValues={tables[0]} />
              <feFuncG type="table" tableValues={tables[1]} />
              <feFuncB type="table" tableValues={tables[2]} />
              <feFuncA type="identity" />
            </feComponentTransfer>
            <feComposite in={`tint-${part}`} in2={`mask-${part}`} operator="in" result={`inside-${part}`} />
            <feComposite in={`inside-${part}`} in2={index === 0 ? "unselected" : `material-${index - 1}`} operator="arithmetic"
              k1={0} k2={1} k3={1} k4={0} result={`material-${index}`} />
          </Fragment>
      ))}
    </filter>
  );
}
