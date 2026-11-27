import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("rehearsal UI is routed within existing report/timeline tabs without formal write functions", () => {
  const page=fs.readFileSync("app/page.tsx","utf8");
  const views=fs.readFileSync("components/service/RehearsalViews.tsx","utf8");
  const hook=fs.readFileSync("components/service/useServiceRehearsal.ts","utf8");
  assert.match(page,/if \(rehearsalMode\) return <RehearsalCheckInView/);
  assert.match(page,/if \(rehearsalMode\) return <RehearsalTimelineView/);
  assert.match(page,/!rehearsalMode && activeTab !== "checkin"/);
  assert.match(page,/adminTestService: isAdmin && !rehearsalMode/);
  assert.match(views,/action: "check-in", rehearsalId: rehearsal.id/);
  assert.match(views,/action: "set-item", rehearsalId: rehearsal.id, itemId: item.id/);
  assert.match(views,/if \(next\) onTimeline\(\)/);
  assert.match(hook,/fetch\("\/api\/rehearsal"/);
  assert.match(hook,/if \(!id \|\| next\?\.formalCheckIn\)/);
  assert.match(hook,/previous\?\.owner === userId/);
  assert.doesNotMatch(views+hook,/supabaseFetch|\/api\/check-in|\/api\/checklist-state|localStorage/);
});
