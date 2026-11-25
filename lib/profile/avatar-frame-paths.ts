/**
 * Source-registered frame geometry for the existing v2 glasses portraits.
 * Coordinates are in the original 512 × 512 artboard, before portrait placement.
 * These paths do not define interchangeable eyewear or fit a different portrait.
 *
 * Draw EACH ring as `${outer} ${lens}` with fill-rule="evenodd". Draw bridge and
 * temples as separate filled paths, so overlapping pieces form a union rather
 * than cancelling each other under the even-odd rule. For skin exclusions, use
 * that same frame union. `lens` paths are holes in frame coverage; they are not
 * whole-lens skin exclusions (skin remains visible through a clear lens).
 * Geometry follows the source frame; source-luminance coverage must refine the
 * anti-aliased boundary before recoloring, keeping adjacent skin and highlights.
 */
export type AvatarFramePoint = Readonly<{ x: number; y: number }>;
export type AvatarFrameGeometry = Readonly<{
  source: string;
  sha256: string;
  rings: readonly Readonly<{ outer: string; lens: string }>[];
  bridge: string;
  temples: readonly string[];
  /** Points well inside the lens; never recolor these with the frame channel. */
  protectedLensPoints: readonly AvatarFramePoint[];
  /** Visible source frame pixels used by geometry/coverage QA. */
  framePoints: readonly AvatarFramePoint[];
}>;

export const AVATAR_FRAME_PATHS = {
  male: {
    source: "/avatar/scenes/v2/male-glasses.webp",
    sha256: "ff9d0e8c53fc5f1168d9e9cc40ebb0f040dc2154225a06a5c99e1364a9ba3cc5",
    rings: [
      {
        outer: "M202 175 C221 175 238 180 245 188 C251 197 248 217 240 230 C233 241 220 244 204 244 C185 245 174 240 167 230 C160 218 158 202 155 192 C155 182 177 175 202 175 Z",
        lens: "M202 181 C219 181 234 185 240 193 C244 200 241 216 235 227 C229 236 218 239 203 239 C188 239 178 235 173 227 C167 217 165 203 163 194 C163 186 181 181 202 181 Z",
      },
      {
        outer: "M317 175 C335 175 351 178 358 186 C364 194 361 211 354 225 C348 237 335 243 317 244 C300 245 287 238 280 227 C273 216 269 202 271 192 C274 181 294 175 317 175 Z",
        lens: "M317 181 C334 181 347 184 353 191 C358 199 354 214 349 224 C343 234 332 239 316 239 C302 239 290 233 284 224 C279 214 275 202 277 194 C281 185 298 181 317 181 Z",
      },
    ],
    bridge: "M244 188 Q258 185.5 274 188 L273 196 Q259 191 247 197 Z",
    temples: [
      "M145 188 L158 184 L162 193 L146 197 Z",
      "M356 182 L370 185 L371 194 L359 196 Z",
    ],
    protectedLensPoints: [
      { x: 204, y: 206 }, { x: 188, y: 222 }, { x: 224, y: 220 },
      { x: 311, y: 204 }, { x: 294, y: 218 }, { x: 334, y: 221 },
    ],
    framePoints: [
      { x: 200, y: 178 }, { x: 246, y: 201 }, { x: 201, y: 242 },
      { x: 310, y: 177 }, { x: 275, y: 210 }, { x: 315, y: 242 },
      { x: 258, y: 190 }, { x: 148, y: 192 }, { x: 368, y: 190 },
    ],
  },
  female: {
    source: "/avatar/scenes/v2/female-glasses.webp",
    sha256: "a14b3ce493f0d161cd6257d8f334531bc921bc341cf45a46481695ffee80bfb0",
    rings: [
      {
        outer: "M207 191 C226 191 243 198 250 208 C256 218 254 239 246 249 C238 260 224 263 208 263 C190 263 178 256 173 246 C166 234 163 218 163 208 C164 198 183 191 207 191 Z",
        lens: "M207 197 C225 197 239 203 246 212 C250 221 248 238 241 247 C234 256 222 258 208 258 C193 258 182 252 177 243 C172 233 168 218 169 210 C172 201 188 197 207 197 Z",
      },
      {
        outer: "M329 182 C347 182 361 187 367 198 C372 209 367 229 360 240 C352 251 338 255 321 255 C304 255 291 245 284 232 C278 220 276 207 281 197 C288 186 309 182 329 182 Z",
        lens: "M329 188 C344 188 356 193 361 202 C365 212 361 228 354 238 C347 247 335 251 321 250 C307 250 296 242 290 231 C284 220 281 207 286 200 C292 192 311 188 329 188 Z",
      },
    ],
    bridge: "M249 205 Q266 199 283 203 L281 212 Q267 205 254 212 Z",
    temples: [
      "M154 205 L168 201 L172 210 L154 215 Z",
      "M362 189 L378 191 L378 200 L367 201 Z",
    ],
    protectedLensPoints: [
      { x: 214, y: 218 }, { x: 189, y: 239 }, { x: 230, y: 239 },
      { x: 315, y: 212 }, { x: 303, y: 232 }, { x: 345, y: 225 },
    ],
    framePoints: [
      { x: 211, y: 194 }, { x: 252, y: 221 }, { x: 210, y: 261 },
      { x: 327, y: 184 }, { x: 281, y: 220 }, { x: 320, y: 253 },
      { x: 266, y: 205 }, { x: 158, y: 211 }, { x: 375, y: 195 },
    ],
  },
} as const satisfies Readonly<Record<"male" | "female", AvatarFrameGeometry>>;
