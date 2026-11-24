import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createVoiceAudioSessionController } from "../lib/voice/ios-audio-session.ts";

test("select playback only while a voice operation is active and restore auto afterwards", () => {
  const session = { type: "auto" };
  const controller = createVoiceAudioSessionController(() => session);
  assert.equal(session.type, "auto");
  const first = controller.beginPlayback();
  assert.equal(session.type, "playback");
  const second = controller.beginPlayback();
  first();
  first();
  assert.equal(session.type, "playback");
  second();
  assert.equal(session.type, "auto");
});

test("microphone reservations take priority, including overlapping capture operations", () => {
  const session = { type: "auto" };
  const controller = createVoiceAudioSessionController(() => session);
  const playback = controller.beginPlayback();
  const call = controller.beginCapture();
  assert.equal(session.type, "auto");
  const recorder = controller.beginCapture();
  const otherVoice = controller.beginPlayback();
  controller.refresh();
  assert.equal(session.type, "auto");
  call();
  assert.equal(session.type, "auto");
  recorder();
  assert.equal(session.type, "playback");
  playback();
  otherVoice();
  assert.equal(session.type, "auto");
});

test("capture first prevents voice playback overriding automatic microphone routing", () => {
  const session = { type: "auto" };
  const controller = createVoiceAudioSessionController(() => session);
  const capture = controller.beginCapture();
  const playback = controller.beginPlayback();
  assert.equal(session.type, "auto");
  playback();
  capture();
  assert.equal(session.type, "auto");
});

test("do not override another feature's explicit session or restore a session not owned here", () => {
  for (const type of ["play-and-record", "playback", "transient", "ambient"]) {
    const session = { type };
    const controller = createVoiceAudioSessionController(() => session);
    const release = controller.beginPlayback();
    assert.equal(session.type, type);
    release();
    assert.equal(session.type, type);
  }
  const session = { type: "auto" };
  const controller = createVoiceAudioSessionController(() => session);
  const release = controller.beginPlayback();
  session.type = "play-and-record";
  controller.refresh();
  release();
  assert.equal(session.type, "play-and-record");
});

test("unsupported and throwing implementations never block existing audio", () => {
  for (const getter of [
    () => undefined,
    () => { throw new Error("unsupported"); },
    () => ({ get type() { return "auto"; }, set type(_value: string) { throw new Error("blocked"); } }),
  ]) {
    const controller = createVoiceAudioSessionController(getter);
    assert.doesNotThrow(() => {
      const playback = controller.beginPlayback();
      const capture = controller.beginCapture();
      controller.refresh();
      capture();
      playback();
    });
  }
});

test("existing assistant, startup, task previews and scheduled admin test use bounded playback leases", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const admin = fs.readFileSync("components/voice/AdminVoiceTestCard.tsx", "utf8");
  for (const name of [
    "processVoiceQueue", "playVoiceStartupConfirmation",
    "playTimelinePreviewAudio", "testPreviewDeviceTone", "previewVoiceDraft",
  ]) {
    const start = page.indexOf("const " + name + " =");
    assert.ok(start >= 0);
    const next = page.indexOf("\n  const ", start + 1);
    const body = page.slice(start, next < 0 ? undefined : next);
    assert.ok(body.includes("beginVoicePlayback()"), name);
    assert.ok(body.includes("releasePlayback()"), name);
  }
  assert.match(page, /voiceStartupSessionReleaseRef\.current\?\.\(\)/);
  assert.match(page, /timelinePreviewSessionReleaseRef\.current\?\.\(\)/);
  assert.match(page, /recognitionCaptureReleaseRef\.current\?\.\(\)/);
  assert.match(admin, /releasePreparation\(\)/);
  assert.match(admin, /playbackReleaseRef\.current\?\.\(\)/);
  assert.match(admin, /releasePlayback\(\)/);
  const recovery = page.indexOf("const resumeOnForeground =");
  assert.ok(page.indexOf("refreshVoicePlaybackMode()", recovery) > recovery);
  const unlock = page.slice(page.indexOf("const unlockVoiceHtmlAudio ="), page.indexOf("const playVoiceBlob ="));
  assert.doesNotMatch(unlock, /beginVoicePlayback/);
});

test("microphone paths retain browser automatic mode and explicitly release stopped streams", () => {
  for (const path of ["components/communications/CommunicationHub.tsx", "components/communications/MessageVoiceRecorder.tsx"]) {
    const content = fs.readFileSync(path, "utf8");
    assert.match(content, /acquireVoiceCaptureStream\(\(\) => navigator\.mediaDevices\.getUserMedia/);
    assert.match(content, /stopVoiceCaptureStream\(/);
    assert.doesNotMatch(content, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  }
});
