/**
 * Best-effort iOS media playback mode. The Audio Session API is document-wide:
 * never keep it in playback mode while a call or microphone capture is active.
 * No autoplay, system volume changes, recording, or timers are introduced here.
 */
type Session = { type: string };
type Release = () => void;

export function createVoiceAudioSessionController(getSession: () => Session | undefined) {
  let playbackCount = 0;
  let captureCount = 0;
  let owned: Session | undefined;

  function restore() {
    const session = owned;
    owned = undefined;
    try {
      // Do not overwrite an audio mode explicitly selected by another feature.
      if (session?.type === "playback") session.type = "auto";
    } catch { /* Keep the browser's default behavior. */ }
  }

  function refresh() {
    if (!playbackCount || captureCount) {
      restore();
      return;
    }
    try {
      const session = getSession();
      if (owned && owned !== session) restore();
      if (owned && owned.type !== "playback") owned = undefined;
      if (session?.type !== "auto") return;
      session.type = "playback";
      if (session.type === "playback") owned = session;
    } catch { /* Unsupported or blocked: do not interrupt playback. */ }
  }

  function once(action: Release): Release {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      action();
    };
  }

  return {
    beginPlayback(): Release {
      playbackCount += 1;
      refresh();
      return once(() => { playbackCount -= 1; refresh(); });
    },
    beginCapture(): Release {
      captureCount += 1;
      refresh();
      return once(() => { captureCount -= 1; refresh(); });
    },
    refresh,
  };
}

const voiceSession = createVoiceAudioSessionController(() => {
  if (typeof navigator === "undefined") return undefined;
  // Feature-detect and restrict this compatibility change to Apple touch devices.
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!appleMobile) return undefined;
  return (navigator as Navigator & { audioSession?: Session }).audioSession;
});

export const beginVoicePlayback = voiceSession.beginPlayback;
export const beginVoiceCapture = voiceSession.beginCapture;
export const refreshVoicePlaybackMode = voiceSession.refresh;

const captureReleases = new WeakMap<MediaStream, Release>();

/** Restore automatic audio routing BEFORE requesting microphone permission. */
export async function acquireVoiceCaptureStream(acquire: () => Promise<MediaStream>) {
  const release = beginVoiceCapture();
  try {
    const stream = await acquire();
    const tracks = stream.getAudioTracks();
    if (!tracks.length || tracks.every(track => track.readyState === "ended")) {
      release();
    } else {
      const finish = () => {
        if (tracks.every(track => track.readyState === "ended")) {
          captureReleases.delete(stream);
          release();
          tracks.forEach(track => track.removeEventListener("ended", finish));
        }
      };
      captureReleases.set(stream, () => {
        tracks.forEach(track => track.removeEventListener("ended", finish));
        release();
      });
      tracks.forEach(track => track.addEventListener("ended", finish));
    }
    return stream;
  } catch (error) {
    release();
    throw error;
  }
}

/** track.stop() does not dispatch ended; release the reservation explicitly. */
export function stopVoiceCaptureStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach(track => track.stop());
  } finally {
    captureReleases.get(stream)?.();
    captureReleases.delete(stream);
  }
}
