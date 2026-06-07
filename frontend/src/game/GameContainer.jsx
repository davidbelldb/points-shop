/**
 * GameContainer
 *
 * Top-level phase state machine.
 *
 *   splash → title → character_select → costume_select → level_select → vs_screen → game
 *
 * Asset loading runs in the background during the splash screen.
 * A single AudioManager instance is shared across all phases.
 *   • Menu music plays during: title, character_select, costume_select, level_select
 *   • VS stinger plays when vs_screen opens
 *   • Battle music is managed by GameScreen
 */

import { useEffect, useRef, useState } from 'react';
import { SpriteManager }  from './engine/SpriteManager.js';
import { AudioManager }   from './engine/AudioManager.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

import SplashScreen          from './screens/SplashScreen.jsx';
import TitleScreen           from './screens/TitleScreen.jsx';
import CharacterSelectScreen from './screens/CharacterSelectScreen.jsx';
import CostumeSelectScreen   from './screens/CostumeSelectScreen.jsx';
import LevelSelectScreen     from './screens/LevelSelectScreen.jsx';
import VSScreen              from './screens/VSScreen.jsx';
import GameScreen            from './screens/GameScreen.jsx';

// ─── Asset manifest ───────────────────────────────────────────────────────────
import katieIdleUrl      from '../assets/sprites/katie_idle.png';
import katieWalk01Url    from '../assets/sprites/katie_walk_01.png';
import katieWalk02Url    from '../assets/sprites/katie_walk_02.png';
import katieJumpUrl      from '../assets/sprites/katie_jump.png';
import katiePunch01Url   from '../assets/sprites/katie_punch_01.png';
import katiePunch02Url   from '../assets/sprites/katie_punch_02.png';
import katiePunch03Url   from '../assets/sprites/katie_punch_03.png';
import katieKick01Url    from '../assets/sprites/katie_kick_01.png';
import katieKick02Url    from '../assets/sprites/katie_kick_02.png';
import katiePK01Url      from '../assets/sprites/katie_power_kick_01.png';
import katiePK02Url      from '../assets/sprites/katie_power_kick_02.png';
import katiePK03Url      from '../assets/sprites/katie_power_kick_03.png';
import katiePK04Url      from '../assets/sprites/katie_power_kick_04.png';
import katiePK05Url      from '../assets/sprites/katie_power_kick_05.png';
import combo01Url        from '../assets/sprites/punch_kick_combo_01.png';
import combo02Url        from '../assets/sprites/punch_kick_combo_02.png';
import combo03Url        from '../assets/sprites/punch_kick_combo_03.png';
import combo04Url        from '../assets/sprites/punch_kick_combo_04.png';
import piano01Url        from '../assets/sprites/piano_attack_01.png';
import piano02Url        from '../assets/sprites/piano_attack_02.png';
import piano03Url        from '../assets/sprites/piano_attack_03.png';
import piano04Url        from '../assets/sprites/piano_attack_04.png';
import piano05Url        from '../assets/sprites/piano_attack_05.png';
import piano06Url        from '../assets/sprites/piano_attack_06.png';
import piano07Url        from '../assets/sprites/piano_attack_07.png';
import piano08Url        from '../assets/sprites/piano_attack_08.png';
import piano09Url        from '../assets/sprites/piano_attack_09.png';
import piano10Url        from '../assets/sprites/piano_attack_10.png';
import davidIdleUrl      from '../assets/sprites/david_idle.png';
import davidJumpUrl      from '../assets/sprites/david_jump.png';
import davidWalk01Url    from '../assets/sprites/david_walk_01.png';
import davidWalk02Url    from '../assets/sprites/david_walk_02.png';
import davidBlock01Url   from '../assets/sprites/david_block_01.png';
import davidKo01Url      from '../assets/sprites/david_ko_01.png';
import davidKo02Url      from '../assets/sprites/david_ko_02.png';
import katieBlock01Url   from '../assets/sprites/katie_block_01.png';
import katieKo01Url      from '../assets/sprites/katie_ko_01.png';
import katieKo02Url      from '../assets/sprites/katie_ko_02.png';
import davidPunch01Url   from '../assets/sprites/david_punch_01.png';
import davidPunch02Url   from '../assets/sprites/david_punch_02.png';
import davidPunch03Url   from '../assets/sprites/david_punch_03.png';
import davidKick01Url    from '../assets/sprites/david_kick_01.png';
import davidKick02Url    from '../assets/sprites/david_kick_02.png';
import davidPK01Url      from '../assets/sprites/david_power_kick_01.png';
import davidPK02Url      from '../assets/sprites/david_power_kick_02.png';
import davidPK03Url      from '../assets/sprites/david_power_kick_03.png';
import davidPK04Url      from '../assets/sprites/david_power_kick_04.png';
import davidSp01Url      from '../assets/sprites/david_special_01.png';
import davidSp02Url      from '../assets/sprites/david_special_02.png';
import davidSp03Url      from '../assets/sprites/david_special_03.png';
import davidSp04Url      from '../assets/sprites/david_special_04.png';
import davidSp05Url      from '../assets/sprites/david_special_05.png';
import davidSp06Url      from '../assets/sprites/david_special_06.png';
import davidGt01Url      from '../assets/sprites/david_guitar_01.png';
import davidGt02Url      from '../assets/sprites/david_guitar_02.png';
import davidGt03Url      from '../assets/sprites/david_guitar_03.png';
import davidGt04Url      from '../assets/sprites/david_guitar_04.png';
import background01Url   from '../assets/backgrounds/background_03.png';

const SPRITE_MANIFEST = {
  katie_idle:          katieIdleUrl,
  katie_walk_01:       katieWalk01Url,
  katie_walk_02:       katieWalk02Url,
  katie_jump:          katieJumpUrl,
  katie_punch_01:      katiePunch01Url,
  katie_punch_02:      katiePunch02Url,
  katie_punch_03:      katiePunch03Url,
  katie_kick_01:       katieKick01Url,
  katie_kick_02:       katieKick02Url,
  katie_power_kick_01: katiePK01Url,
  katie_power_kick_02: katiePK02Url,
  katie_power_kick_03: katiePK03Url,
  katie_power_kick_04: katiePK04Url,
  katie_power_kick_05: katiePK05Url,
  punch_kick_combo_01: combo01Url,
  punch_kick_combo_02: combo02Url,
  punch_kick_combo_03: combo03Url,
  punch_kick_combo_04: combo04Url,
  piano_attack_01:     piano01Url,
  piano_attack_02:     piano02Url,
  piano_attack_03:     piano03Url,
  piano_attack_04:     piano04Url,
  piano_attack_05:     piano05Url,
  piano_attack_06:     piano06Url,
  piano_attack_07:     piano07Url,
  piano_attack_08:     piano08Url,
  piano_attack_09:     piano09Url,
  piano_attack_10:     piano10Url,
  david_idle:          davidIdleUrl,
  david_jump:          davidJumpUrl,
  david_walk_01:       davidWalk01Url,
  david_walk_02:       davidWalk02Url,
  david_block_01:      davidBlock01Url,
  david_ko_01:         davidKo01Url,
  david_ko_02:         davidKo02Url,
  katie_block_01:      katieBlock01Url,
  katie_ko_01:         katieKo01Url,
  katie_ko_02:         katieKo02Url,
  david_punch_01:      davidPunch01Url,
  david_punch_02:      davidPunch02Url,
  david_punch_03:      davidPunch03Url,
  david_kick_01:       davidKick01Url,
  david_kick_02:       davidKick02Url,
  david_power_kick_01: davidPK01Url,
  david_power_kick_02: davidPK02Url,
  david_power_kick_03: davidPK03Url,
  david_power_kick_04: davidPK04Url,
  david_special_01:    davidSp01Url,
  david_special_02:    davidSp02Url,
  david_special_03:    davidSp03Url,
  david_special_04:    davidSp04Url,
  david_special_05:    davidSp05Url,
  david_special_06:    davidSp06Url,
  david_guitar_01:     davidGt01Url,
  david_guitar_02:     davidGt02Url,
  david_guitar_03:     davidGt03Url,
  david_guitar_04:     davidGt04Url,
  bg_01:               background01Url,
};

const MENU_PHASES = new Set(['title', 'character_select', 'costume_select', 'level_select']);

// ─── Phase machine ────────────────────────────────────────────────────────────

export default function GameContainer() {
  const [phase,     setPhase]     = useState('splash');
  const [sprites,   setSprites]   = useState(null);
  const [character, setCharacter] = useState(null);
  const [costume,   setCostume]   = useState(null);
  const [level,     setLevel]     = useState(null);
  const [matchKey,  setMatchKey]  = useState(0);
  const [scale,     setScale]     = useState(1);

  const wrapperRef = useRef(null);
  // Single AudioManager instance shared across all phases
  const audioRef   = useRef(null);
  if (!audioRef.current) audioRef.current = new AudioManager();

  // Responsive scaling
  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const { width, height } = wrapperRef.current.getBoundingClientRect();
      setScale(Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Sprite preload
  useEffect(() => {
    const mgr = new SpriteManager();
    mgr.preload(SPRITE_MANIFEST).then(() => setSprites(mgr));
  }, []);

  // Menu music: play on menu phases, stop on vs_screen / game
  useEffect(() => {
    const audio = audioRef.current;
    if (MENU_PHASES.has(phase)) {
      audio.startMenuMusic();
    } else {
      audio.stopMenuMusic();
    }
  }, [phase]);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goTitle         = ()    => setPhase('title');
  const goCharSelect    = ()    => setPhase('character_select');
  const goCostumeSelect = (c)   => { setCharacter(c); setPhase('costume_select'); };
  const goLevelSelect   = (cos) => { setCostume(cos); setPhase('level_select'); };

  // After level select → VS screen (with stinger)
  const goVsScreen = (lvl) => {
    setLevel(lvl);
    audioRef.current.playVsStinger();
    setPhase('vs_screen');
  };

  // After VS screen → game
  const goGame = () => setPhase('game');

  // Quit from in-game → back to title
  const handleQuit = () => {
    setCharacter(null); setCostume(null); setLevel(null);
    setPhase('title');
  };

  // Rematch → fresh run from character select
  const handleRematch = () => {
    setCharacter(null); setCostume(null); setLevel(null);
    setMatchKey(k => k + 1);
    setPhase('character_select');
  };

  const cpuCharId = character === 'katie' ? 'david' : 'katie';

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full bg-black flex items-center justify-center"
      style={{ minHeight: 0 }}
    >
      <div
        className="relative bg-black overflow-hidden"
        style={{
          width:           CANVAS_WIDTH,
          height:          CANVAS_HEIGHT,
          transform:       `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink:      0,
        }}
      >
        {phase === 'splash' && (
          <SplashScreen ready={!!sprites} onContinue={goTitle} />
        )}
        {phase === 'title' && (
          <TitleScreen onStart={goCharSelect} audio={audioRef.current} />
        )}
        {phase === 'character_select' && (
          <CharacterSelectScreen onSelect={goCostumeSelect} onBack={goTitle} audio={audioRef.current} />
        )}
        {phase === 'costume_select' && (
          <CostumeSelectScreen character={character} onSelect={goLevelSelect} onBack={goCharSelect} audio={audioRef.current} />
        )}
        {phase === 'level_select' && (
          <LevelSelectScreen onSelect={goVsScreen} onBack={() => setPhase('costume_select')} audio={audioRef.current} />
        )}
        {phase === 'vs_screen' && (
          <VSScreen
            sprites={sprites}
            playerCharId={character}
            cpuCharId={cpuCharId}
            onComplete={goGame}
          />
        )}
        {phase === 'game' && (
          <GameScreen
            key={matchKey}
            sprites={sprites}
            character={character}
            costume={costume}
            level={level}
            audio={audioRef.current}
            onQuit={handleQuit}
            onRematch={handleRematch}
          />
        )}
      </div>
    </div>
  );
}
