import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { api } from './api.js';

// Per-event haptic patterns. All no-ops on the web build.
const native = () => Capacitor.isNativePlatform();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// One-shot bring-up diagnostic: reports to the backend logs whether the Haptics
// plugin is actually registered at runtime and whether an impact call throws.
// Remove once haptics are confirmed working.
let diagDone = false;
function reportHapticDiag(impactResult) {
  if (diagDone) return;
  diagDone = true;
  let available = 'unknown';
  try { available = String(Capacitor.isPluginAvailable('Haptics')); } catch { /* ignore */ }
  try {
    api.apnsDebug(
      'haptic',
      `platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()} pluginAvailable=${available} impact=${impactResult}`,
    );
  } catch { /* ignore */ }
}

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
  let result = 'ok';
  try { await Haptics.impact({ style }); }
  catch (e) { result = 'error:' + (e?.message || e); }
  reportHapticDiag(result);
}

/** Celebration — for wins / point rewards. */
export async function hapticSuccess() {
  if (!native()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ }
}

/** Failure — for losses / invalid actions. */
export async function hapticError() {
  if (!native()) return;
  try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* ignore */ }
}

/** Lightest possible tick — for rapid taps like on-screen keys / gamepad. */
export async function hapticSelect() {
  if (!native()) return;
  try { await Haptics.selectionChanged(); } catch { /* ignore */ }
}

/**
 * Three sharp taps in quick succession — fired per letter as a Wordle/Dirdle
 * tile flips over on a guess. Heavy is the punchiest impact iOS exposes, so a
 * tight burst of three reads as a crisp "clack-clack-clack" on each reveal.
 */
export async function hapticSharpTriple() {
  if (!native()) return;
  try {
    for (let i = 0; i < 3; i++) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      if (i < 2) await wait(45);
    }
  } catch { /* ignore */ }
}

/**
 * Wrong-guess "shudder" — emulates the iOS lockscreen wrong-passcode shake: a
 * rapid back-and-forth rumble of heavy impacts, topped with an error
 * notification so it lands as an unmistakable "nope".
 */
export async function hapticShudder() {
  if (!native()) return;
  try {
    for (let i = 0; i < 6; i++) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await wait(50);
    }
    await Haptics.notification({ type: NotificationType.Error });
  } catch { /* ignore */ }
}

/**
 * Celebration "party" — a Candy-Crush-style flourish for a winning guess: a
 * quick rising drumroll (light → medium → heavy) that crescendos into a
 * success notification, then a couple of triumphant after-pops.
 */
export async function hapticParty() {
  if (!native()) return;
  try {
    const roll = [
      ImpactStyle.Light, ImpactStyle.Light, ImpactStyle.Medium,
      ImpactStyle.Medium, ImpactStyle.Heavy, ImpactStyle.Heavy,
    ];
    for (const style of roll) {
      await Haptics.impact({ style });
      await wait(40);
    }
    await Haptics.notification({ type: NotificationType.Success });
    await wait(120);
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await wait(90);
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch { /* ignore */ }
}
