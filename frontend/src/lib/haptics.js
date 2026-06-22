import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Per-event haptic patterns. All no-ops on the web build.
const native = () => Capacitor.isNativePlatform();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Nudge — a deliberately attention-grabbing "jiggle": a rapid burst of heavy
 * taps so it reads as someone poking you, not a routine tap.
 */
export async function hapticNudge() {
  if (!native()) return;
  try {
    for (let i = 0; i < 5; i++) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await wait(55);
    }
  } catch { /* ignore */ }
}

/**
 * Generic gentle "tug-tug-tug" — the default feedback for ordinary events
 * (game ticks, confirmations) so they feel tactile without shouting.
 */
export async function hapticTug() {
  if (!native()) return;
  try {
    for (let i = 0; i < 3; i++) {
      await Haptics.impact({ style: ImpactStyle.Light });
      await wait(70);
    }
  } catch { /* ignore */ }
}

/** Single light tap — for momentary feedback (button press, send). */
export async function hapticTap(style = ImpactStyle.Light) {
  if (!native()) return;
  try { await Haptics.impact({ style }); } catch { /* ignore */ }
}

/** Celebration — for wins / point rewards. */
export async function hapticSuccess() {
  if (!native()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ }
}
