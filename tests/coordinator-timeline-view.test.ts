import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("coordinator shared timeline endpoint requires a verified coordinator and exposes read-only templates", () => {
  const api = read("app/api/coordinator-timelines/route.ts");
  assert.match(api, /export async function GET\(request: NextRequest\)/);
  assert.match(api, /await requireCoordinator\(request\)/);
  assert.match(api, /\.is\("service_id", null\)/);
  assert.match(api, /\.eq\("is_active", true\)/);
  assert.match(api, /\.in\("service_type", \[\.\.\.SERVICE_TYPES\]\)/);
  assert.match(api, /\.from\("checklist_items"\)/);
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(api, /account_code|phone_number|contact_email/);
});

test("coordinators can preview all three services without changing the locked check-in service", () => {
  const page = read("app/page.tsx");
  assert.match(page, /const isCoordinatorTimelinePreview = isCoordinator && !isAdmin;/);
  assert.match(page, /const \\[viewedTimelineService, setViewedTimelineService\\] = useState\\(" *"\\)/);
  assert.match(page, /coordinatorTimelineNodes\.filter\(\(node\) => node\.service_type === timelineViewService\)/);
  assert.match(page, /\(isAdminUnlocked \|\| \(isCoordinatorTimelinePreview && activeTab === "timeline"\)\)/);
  assert.match(page, /aria-pressed=\{\(isAdminUnlocked \? currentService : timelineViewService\) === srv\}/);
  assert.match(page, /setViewedTimelineService\(srv\)/);
  assert.match(page, /if \(isAdminUnlocked\) \{\s*setCurrentService\(srv\)/);
  assert.match(page, /disabled=\{isCoordinatorTimelinePreview\}/);
  assert.match(page, /setCurrentService\(lockedServiceType\);\s*hasManuallySwitchedRef\.current = true;/);
  assert.match(page, /if \(isCoordinator\) setActiveTab\("timeline"\)/);
});

test("admin editing remains gated by server roles and is not granted with timeline viewing", () => {
  const page = read("app/page.tsx");
  const permissions = read("lib/auth/require-admin.ts");
  assert.match(page, /const canManageTimeline = isAdmin;/);
  assert.match(page, /setIsAdminUnlocked\(canManageTimeline\)/);
  assert.match(page, /if \(!isAdminUnlocked \|\| !isTimelineEditMode\)/);
  assert.match(permissions, /if \(!user\.roles\.includes\("admin"\)\)/);
});
