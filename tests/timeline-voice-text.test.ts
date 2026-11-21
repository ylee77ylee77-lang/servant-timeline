import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getCustomReminderText,
  getReminderTextField,
  isReminderTiming,
  isReminderDetailLevel,
  normalizeReminderText,
} from "../lib/voice/reminder-overrides.ts";

const migration = () => fs.readFileSync(
  "supabase/migrations/20261121111809_editable_timeline_voice_text.sql", "utf8",
);
const route = () => fs.readFileSync("app/api/timeline-voice-text/route.ts", "utf8");
const page = () => fs.readFileSync("app/page.tsx", "utf8");

test("all six combinations map to distinct persisted columns", () => {
  const columns = new Set<string>();
  for (const moment of ["pre5", "now"] as const) {
    for (const detail of ["simple", "standard", "detailed"] as const) {
      const column = getReminderTextField(moment, detail);
      assert.match(column, /^voice_(pre5|now)_(simple|standard|detailed)$/);
      columns.add(column);
      assert.ok(migration().includes(`add column if not exists ${column} text`));
    }
  }
  assert.equal(columns.size, 6);
});

test("custom speech overrides only the selected moment and detail level", () => {
  const node: Record<string, unknown> = {
    voice_pre5_simple: " 提醒您，前往服務台。 ",
    voice_pre5_detailed: "提醒您，五分鐘後到服務台，並確認物品是否齊全。",
    voice_now_standard: "請開始集合。",
  };
  assert.equal(getCustomReminderText(node, "pre5", "simple"), "提醒您，前往服務台。");
  assert.equal(getCustomReminderText(node, "pre5", "standard"), null);
  assert.equal(getCustomReminderText(node, "pre5", "detailed"), node.voice_pre5_detailed);
  assert.equal(getCustomReminderText(node, "now", "standard"), "請開始集合。");
  assert.equal(getCustomReminderText(node, "now", "detailed"), null);
  assert.equal(getCustomReminderText({ voice_pre5_simple: " " }, "pre5", "simple"), null);
  assert.equal(getCustomReminderText({ voice_pre5_simple: null }, "pre5", "simple"), null);
});

test("speech inputs are cleaned and variants must be explicitly valid", () => {
  assert.equal(normalizeReminderText(" 提醒您，  到服務台。\n\t下一步。 "), "提醒您， 到服務台。 下一步。");
  assert.equal(normalizeReminderText("歡\u200B迎\uFEFF回家"), "歡迎回家");
  assert.equal(isReminderTiming("pre5"), true);
  assert.equal(isReminderTiming("now"), true);
  assert.equal(isReminderTiming("bad"), false);
  assert.equal(isReminderDetailLevel("simple"), true);
  assert.equal(isReminderDetailLevel("standard"), true);
  assert.equal(isReminderDetailLevel("detailed"), true);
  assert.equal(isReminderDetailLevel("admin"), false);
});

test("only authenticated admins can write a whitelisted voice field, with optimistic conflict protection", () => {
  const api = route();
  assert.match(api, /export async function PATCH\(request: NextRequest\)/);
  assert.match(api, /await requireAdmin\(request\)/);
  assert.match(api, /getReminderTextField\(value\.timing, value\.detailLevel\)/);
  assert.match(api, /expectedText/);
  assert.match(api, /\.eq\("id", nodeId\)/);
  assert.match(api, /\.eq\("is_active", true\)/);
  assert.match(api, /update\(\{ \[field\]: text \}\)/);
  assert.match(api, /status: 409/);
  assert.match(api, /Array\.from\(text\)\.length > 600/);
  assert.doesNotMatch(api, /export async function (POST|PUT|DELETE)/);
  const sql = migration();
  assert.match(sql, /alter table public\.timeline_nodes/);
  assert.doesNotMatch(sql, /drop policy|disable row level security|grant .*authenticated/i);
});

test("live reminders use saved text and the preview can audition unsaved edits before saving", () => {
  const src = page();
  assert.match(src, /const customText = getCustomReminderText\(node, reminderType, detailLevel\);\s*if \(customText\) return customText;/);
  assert.ok(src.includes('speak(buildReminderSpeechText(node, reminderType));'));
  assert.ok(src.includes('const text = normalizeReminderText(timelinePreviewDraftText);'));
  assert.ok(src.includes('value={timelinePreviewDraftText}'));
  assert.ok(src.includes('getReminderTextField(timelinePreviewTiming, timelinePreviewDetail)'));
  assert.ok(src.includes('expectedText: getCustomReminderText(node, timelinePreviewTiming, timelinePreviewDetail)'));
  assert.ok(src.includes('onClick={() => void saveTimelinePreviewText(node)}'));
  assert.ok(src.includes('onConfirm: () => void saveTimelinePreviewText(node, true)'));
  assert.ok(src.includes('setNodes((prev) => prev.map((item) =>'));
  assert.ok(src.includes("已有尚未儲存") === false); // no misleading saved-status claim
  assert.ok(src.includes("尚未儲存的播報文字"));
});
