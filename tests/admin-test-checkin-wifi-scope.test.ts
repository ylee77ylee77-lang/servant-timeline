import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("admin TEST check-in is authenticated server-side, validates service, and does not write real check-ins", () => {
  const route = read("app/api/check-in/test/route.ts");
  assert.ok(route.includes('await requireAdmin(request)'), "deny unauthorized clients");
  assert.ok(route.includes('const status = error instanceof Error && "status" in error'));
  assert.ok(route.includes("status === 401 || status === 403"));
  assert.ok(route.includes("isServiceType(body.serviceType)"), "reject unknown services");
  assert.ok(!route.includes("isChurchNetworkRequest"), "admin test does not need church Wi-Fi");
  assert.ok(route.includes("return NextResponse.json({ serviceType: body.serviceType })"));
  for (const write of [
    ".insert(", ".upsert(", ".update(", ".delete(", "supabase.rpc(",
    "correct_lead_check_in", "service_check_ins",
  ]) assert.ok(!route.includes(write), "test API must not alter live data: " + write);
});

test("the normal check-in API keeps server-side church network protection", () => {
  const route = read("app/api/check-in/route.ts");
  assert.ok(route.includes("const user = await requireActiveUser(request)"));
  const afterAuth = route.slice(route.indexOf("export async function POST"));
  assert.ok(afterAuth.includes("if (!isChurchNetworkRequest(request))"));
  assert.ok(afterAuth.includes('const action = String(body.action ?? "")'));
  assert.ok(afterAuth.includes('action === "check_in"'));
  assert.ok(afterAuth.includes('.from("service_check_ins")'));
});

test("only admin test UI bypasses Wi-Fi eligibility; formal check-in retains it", () => {
  const page = read("app/page.tsx");
  const handler = page.slice(
    page.indexOf("  const handleAdminTestCheckIn = async () => {"),
    page.indexOf("  const handleLocalCheckin = async", page.indexOf("  const handleAdminTestCheckIn = async () => {"))
  );
  assert.ok(handler.includes("if (!isAdminTestCheckIn || !isServiceType(testCheckInService) || testCheckInPending) return"));
  assert.ok(!handler.includes("wifiVerified"), "testing cannot be blocked by the church network check");
  assert.ok(handler.includes('fetch("/api/check-in/test"'));
  assert.ok(handler.includes("Authorization: `Bearer ${session.access_token}`"));
  assert.ok(!handler.includes('fetch("/api/check-in",'));

  const formal = page.slice(
    page.indexOf("  const handleLocalCheckin = async"),
    page.indexOf("  const confirmLeadCheckInChange", page.indexOf("  const handleLocalCheckin = async"))
  );
  assert.ok(formal.includes("if (!wifiVerified) {"), "formal check-in retains Wi-Fi");
  assert.ok(formal.includes('fetch("/api/check-in"'));

  const ui = page.slice(page.indexOf("  const renderCheckinView = () => {"), page.indexOf("  const renderCheckinView = () => {") + 14000);
  assert.ok(ui.includes("const canSubmitCheckIn = (isAdminTestCheckIn || wifiVerified)"));
  assert.ok(ui.includes("{showOnsiteCheckIn && (isAdminTestCheckIn || wifiVerified) && onsiteService && ("));
  assert.ok(ui.includes("!isAdminTestCheckIn && <p"));
  assert.ok(ui.includes("管理員測試報到：無須連接教會 Wi-Fi"));
  assert.ok(ui.includes("!isAdminTestCheckIn && ("), "Wi-Fi recheck only in real mode");
});
