import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { rehearsalVoiceCues, dueRehearsalCues, nearRehearsalCue, selectRehearsalTask, rehearsalSpeechNode } from "../lib/voice/rehearsal-cues.ts";
import type { RehearsalParticipantState } from "../lib/services/rehearsal-participant-contract.ts";

const base = Date.parse("2026-11-27T23:55:00+08:00");
const state: RehearsalParticipantState = {
  rehearsal:{ id:"practice",serviceType:"主一堂",startedAt:new Date(base).toISOString() },
  checkedInAt:new Date(base+1000).toISOString(), formalCheckIn:false,
  nodes:[{ id:"one",dueAt:new Date(base+6*60000).toISOString(),sortOrder:0,
    content:{ title:"就位",assignee:"總招",location:"二樓",details:null,voice_reminder_enabled:true,reminder_pre5_enabled:true,reminder_now_enabled:true,
      voice_pre5_simple:null,voice_pre5_standard:null,voice_pre5_detailed:null,voice_now_simple:null,voice_now_standard:null,voice_now_detailed:null },
    checklist:[] }],
};
const settings={leadSeconds:315,advance:true,onTime:true};
test("rehearsal schedules use absolute timestamps, cross midnight and never replay the next day",()=>{
  const cues=rehearsalVoiceCues(state,settings);
  assert.deepEqual(cues.map(c=>[c.kind,c.at]),[["pre5",base+45000],["now",base+360000]]);
  assert.equal(dueRehearsalCues(cues,base+45000,new Set()).length,1);
  assert.equal(dueRehearsalCues(cues,base+60000,new Set()).length,0);
  assert.equal(dueRehearsalCues(cues,base+45000+86400000,new Set()).length,0);
  assert.equal(dueRehearsalCues(cues,base+45000,new Set([cues[0].key])).length,0);
  assert.equal(nearRehearsalCue(cues,base),true);
});
test("no rehearsal speech before check-in, after formal report, or from disabled cues",()=>{
  assert.equal(rehearsalVoiceCues({...state,checkedInAt:null},settings).length,0);
  assert.equal(rehearsalVoiceCues({...state,formalCheckIn:true},settings).length,0);
  assert.equal(rehearsalVoiceCues({...state,rehearsal:null},settings).length,0);
  assert.deepEqual(rehearsalVoiceCues({...state,checkedInAt:new Date(base+60000).toISOString()},settings).map(c=>c.kind),["now"]);
  assert.deepEqual(rehearsalVoiceCues(state,{leadSeconds:0,advance:true,onTime:true}).map(c=>c.kind),["now"]);
  assert.deepEqual(rehearsalVoiceCues(state,{leadSeconds:0,advance:true,onTime:false}).map(c=>c.kind),["pre5"]);
  assert.equal(rehearsalVoiceCues(state,{leadSeconds:0,advance:false,onTime:false}).length,0);
});
test("first/return cues select the absolute current or next task without changing formal data",()=>{
  assert.equal(selectRehearsalTask(state.nodes,base)?.kind,"next");
  assert.equal(selectRehearsalTask(state.nodes,base+360000)?.kind,"current");
  assert.equal(selectRehearsalTask(state.nodes,base+40*60000),null);
  assert.equal(rehearsalSpeechNode(state.nodes[0]).time,"00:01");
  assert.equal(rehearsalSpeechNode(state.nodes[0]).title,"就位");
});
test("voice route checks rehearsal authorization before cache or synthesis and reuses formal cost controls",()=>{
  const api=fs.readFileSync("app/api/voice/route.ts","utf8");
  const page=fs.readFileSync("app/page.tsx","utf8");
  assert.match(api,/if \(isRehearsal\) \{\s*if \(!await rehearsalAuthorized\(\)\) return rehearsalDenied\(\)/);
  assert.match(api,/get_service_rehearsal_participant_state/);
  assert.match(api,/data\?\.rehearsal\?\.id === rehearsalId/);
  assert.match(api,/data\.formalCheckIn === false/);
  assert.ok(api.indexOf("if (!await rehearsalAuthorized())")<api.indexOf("const cachedAudioBase64 = await getCachedAudioBase64"));
  assert.match(api,/commitMonthlyCharacters\(charCount\)/);
  assert.match(page,/if \(practiceId\) \{[\s\S]*?rehearsalId: practiceId/);
  assert.match(page,/const practiceId = rehearsalVoiceScopeRef\.current/);
  assert.match(page,/practiceId === rehearsalVoiceScopeRef\.current/);
  assert.match(page,/dueRehearsalCues\(cues, now, rehearsalSeenCuesRef\.current\)/);
});
