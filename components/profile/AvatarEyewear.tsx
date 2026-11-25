import { getAvatarEyewearShades, type getAvatarEyewearPlan } from "@/lib/profile/avatar-eyewear";
import { AVATAR_CANVAS_SIZE, AVATAR_PORTRAIT_BOUNDS } from "@/lib/profile/avatar-scene";

type EyewearPlan = NonNullable<ReturnType<typeof getAvatarEyewearPlan>>;

/** One independent accessory on the existing portrait artboard. */
export function AvatarEyewear({ plan, id }: { plan: EyewearPlan; id: string }) {
  const { x, y, size } = AVATAR_PORTRAIT_BOUNDS;
  const shades = getAvatarEyewearShades(plan.color);
  const gradientId = `${id}-rim`;
  const occlusionId = `${id}-hair-occlusion`;
  const paths = plan.artwork === "stroke" ? [...plan.geometry.temples, plan.geometry.bridge, ...plan.geometry.rims] : [];
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size / AVATAR_CANVAS_SIZE})`}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="169" x2="0" y2="261">
          <stop offset="0" stopColor={shades.upper} />
          <stop offset=".24" stopColor={shades.mid} />
          <stop offset=".64" stopColor={shades.mid} />
          <stop offset="1" stopColor={shades.lower} />
        </linearGradient>
        {plan.occlusionUri ? (
          <filter id={occlusionId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
            x={0} y={0} width={512} height={512} colorInterpolationFilters="sRGB">
            <feImage href={plan.occlusionUri} x={0} y={0} width={512} height={512} preserveAspectRatio="none" result="coverage" />
            <feColorMatrix in="coverage" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0" result="hair" />
            <feComposite in="SourceGraphic" in2="hair" operator="out" />
          </filter>
        ) : null}
      </defs>
      <g filter={plan.occlusionUri ? `url(#${occlusionId})` : undefined}>
        {plan.artwork === "filled" ? (
          <g fill={`url(#${gradientId})`} stroke={shades.shadow} strokeWidth=".5" strokeLinejoin="round">
            {[...plan.geometry.temples, plan.geometry.bridge].map(d => <path key={d} d={d} />)}
            {plan.geometry.rings.map(ring => <path key={ring.outer} d={`${ring.outer} ${ring.lens}`} fillRule="evenodd" />)}
          </g>
        ) : (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g stroke="#2C1D16" strokeWidth={plan.geometry.width + 1.4} opacity=".19" transform="translate(0 1.5)">
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={shades.shadow} strokeWidth={plan.geometry.width + 0.8}>
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={`url(#${gradientId})`} strokeWidth={plan.geometry.width}>
              {paths.map((d) => <path key={d} d={d} />)}
            </g>
            <g stroke={shades.highlight} strokeWidth="0.9" opacity=".35">
              {plan.geometry.rims.map((d) => <path key={d} d={d} />)}
            </g>
          </g>
        )}
      </g>
    </g>
  );
}
