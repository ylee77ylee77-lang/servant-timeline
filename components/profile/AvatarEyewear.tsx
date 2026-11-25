import { getAvatarEyewearShades, type getAvatarEyewearPlan } from "@/lib/profile/avatar-eyewear";
import { AVATAR_CANVAS_SIZE, AVATAR_PORTRAIT_BOUNDS } from "@/lib/profile/avatar-scene";

type EyewearPlan = NonNullable<ReturnType<typeof getAvatarEyewearPlan>>;

/** One independent accessory on the existing portrait artboard. */
export function AvatarEyewear({ plan, id }: { plan: EyewearPlan; id: string }) {
  const { geometry, color } = plan;
  const { x, y, size } = AVATAR_PORTRAIT_BOUNDS;
  const shades = getAvatarEyewearShades(color);
  const gradientId = `${id}-rim`;
  const paths = [...geometry.temples, geometry.bridge, ...geometry.rims];
  return (
    <g aria-hidden="true" transform={`translate(${x} ${y}) scale(${size / AVATAR_CANVAS_SIZE})`}>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="169" x2="0" y2="261">
          <stop offset="0" stopColor={shades.upper} />
          <stop offset=".24" stopColor={shades.mid} />
          <stop offset=".64" stopColor={shades.mid} />
          <stop offset="1" stopColor={shades.lower} />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#2C1D16" strokeWidth={geometry.width + 1.4} opacity=".19" transform="translate(0 1.5)">
          {paths.map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke={shades.shadow} strokeWidth={geometry.width + 0.8}>
          {paths.map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke={`url(#${gradientId})`} strokeWidth={geometry.width}>
          {paths.map((d) => <path key={d} d={d} />)}
        </g>
        <g stroke={shades.highlight} strokeWidth="0.9" opacity=".35">
          {geometry.rims.map((d) => <path key={d} d={d} />)}
        </g>
      </g>
    </g>
  );
}
