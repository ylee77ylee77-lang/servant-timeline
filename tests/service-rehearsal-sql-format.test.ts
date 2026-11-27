import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("rehearsal SQL function bodies retain complete dollar-quote delimiters", () => {
  const source = fs.readFileSync("supabase/migrations/20261126232424_service_rehearsal_foundation.sql", "utf8");
  assert.doesNotMatch(source, / as \$$|^\$;$/m);
  const lines = source.split("\n");
  const opens = lines.filter(line => /as \$\$$/.test(line)).length;
  const closes = lines.filter(line => /^\$\$;$/.test(line)).length;
  assert.ok(opens > 0);
  assert.equal(opens, closes);
  assert.match(source, /create function public\.disable_rehearsal_reminder_device[\s\S]*?as \$\$\nbegin\n perform service_rehearsal_private\.lock_participant/);
  assert.match(source, /create function public\.take_rehearsal_reminder[\s\S]*?as \$\$\ndeclare v_user uuid/);
});
