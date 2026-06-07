/**
 * Characters.js
 *
 * Per-character animation definitions and input mappings.
 * Both Player and Enemy consume these — the character chosen at the
 * selection screen determines which definition is used.
 *
 * Adding a new character: add an entry to CHAR_DEFS and CHAR_DEFS.
 * The AnimationController will resolve the right sprite keys automatically.
 */

export const CHAR_DEFS = {

  // ── Katie ──────────────────────────────────────────────────────────────────
  katie: {
    prefix: 'katie',
    color:  '#4ade80',

    // Maps InputManager action → animation name
    inputMap: {
      PUNCH:      'punch',
      KICK:       'kick',
      POWER_KICK: 'power_kick',
      COMBO:      'combo',
      PIANO:      'piano_attack',
    },

    // CPU uses these when playing as Katie
    cpuAttacks: ['punch', 'kick', 'power_kick', 'combo'],

    animations: {
      idle: {
        frames:        ['katie_idle'],
        frameDuration: 0.15,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      block: {
        frames:        ['katie_block_01'],
        frameDuration: 0.15,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      ko: {
        frames:        ['katie_ko_01', 'katie_ko_02'],
        frameDuration: 0.18,
        loop:          false,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      walk: {
        frames:        ['katie_walk_01', 'katie_walk_02'],
        frameDuration: 0.13,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      jump: {
        frames:        ['katie_jump'],
        frameDuration: 0.1,
        loop:          false,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      punch: {
        frames:        ['katie_punch_01', 'katie_punch_02', 'katie_punch_03'],
        frameDuration: 0.08,
        loop:          false,
        isAttack:      true,
        damage:        12,
        hitFrame:      1,
      },
      kick: {
        frames:        ['katie_kick_01', 'katie_kick_02'],
        frameDuration: 0.10,
        loop:          false,
        isAttack:      true,
        damage:        22,
        hitFrame:      1,
      },
      power_kick: {
        frames:        [
          'katie_power_kick_01', 'katie_power_kick_02', 'katie_power_kick_03',
          'katie_power_kick_04', 'katie_power_kick_05',
        ],
        frameDuration: 0.10,
        loop:          false,
        isAttack:      true,
        damage:        44,
        hitFrame:      3,
      },
      combo: {
        frames:        [
          'punch_kick_combo_01', 'punch_kick_combo_02',
          'punch_kick_combo_03', 'punch_kick_combo_04',
        ],
        frameDuration: 0.09,
        loop:          false,
        isAttack:      true,
        damage:        38,
        hitFrame:      3,
      },
      piano_attack: {
        frames:        [
          'piano_attack_01', 'piano_attack_02', 'piano_attack_03', 'piano_attack_04',
          'piano_attack_05', 'piano_attack_06', 'piano_attack_07', 'piano_attack_08',
          'piano_attack_09', 'piano_attack_10',
        ],
        frameDuration: 0.08,
        loop:          false,
        isAttack:      true,
        damage:        62,
        hitFrame:      7,
      },
    },
  },

  // ── David ──────────────────────────────────────────────────────────────────
  david: {
    prefix: 'david',
    color:  '#40c8ff',

    inputMap: {
      PUNCH:      'punch',
      KICK:       'kick',
      POWER_KICK: 'power_kick',
      COMBO:      'special',  // I key → David's special
      PIANO:      'guitar',   // O key → David's guitar attack
    },

    cpuAttacks: ['punch', 'kick', 'power_kick', 'special'],

    animations: {
      idle: {
        frames:        ['david_idle'],
        frameDuration: 0.15,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      block: {
        frames:        ['david_block_01'],
        frameDuration: 0.15,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      ko: {
        frames:        ['david_ko_01', 'david_ko_02'],
        frameDuration: 0.18,
        loop:          false,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      walk: {
        frames:        ['david_walk_01', 'david_walk_02'],
        frameDuration: 0.13,
        loop:          true,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      jump: {
        frames:        ['david_jump'],
        frameDuration: 0.1,
        loop:          false,
        isAttack:      false,
        damage:        0,
        hitFrame:      -1,
      },
      punch: {
        frames:        ['david_punch_01', 'david_punch_02', 'david_punch_03'],
        frameDuration: 0.08,
        loop:          false,
        isAttack:      true,
        damage:        12,
        hitFrame:      1,
      },
      kick: {
        frames:        ['david_kick_01', 'david_kick_02'],
        frameDuration: 0.10,
        loop:          false,
        isAttack:      true,
        damage:        22,
        hitFrame:      1,
      },
      power_kick: {
        frames:        [
          'david_power_kick_01', 'david_power_kick_02',
          'david_power_kick_03', 'david_power_kick_04',
        ],
        frameDuration: 0.10,
        loop:          false,
        isAttack:      true,
        damage:        44,
        hitFrame:      3,
      },
      special: {
        frames:        [
          'david_special_01', 'david_special_02', 'david_special_03',
          'david_special_04', 'david_special_05', 'david_special_06',
        ],
        frameDuration: 0.09,
        loop:          false,
        isAttack:      true,
        damage:        42,
        hitFrame:      4,
      },
      guitar: {
        frames:        ['david_guitar_01', 'david_guitar_02', 'david_guitar_03', 'david_guitar_04'],
        frameDuration: 0.09,
        loop:          false,
        isAttack:      true,
        damage:        52,
        hitFrame:      2,
      },
    },
  },
};
