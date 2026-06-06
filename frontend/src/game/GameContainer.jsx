/**
 * GameContainer
 *
 * Top-level phase state machine.
 *
 *   splash  →  title  →  character_select  →  game
 *
 * Asset loading runs in the background during the splash screen so
 * there is zero wait once the player reaches the game itself.
 */

import { useEffect, useState } from 'react';
import { SpriteManager } from './engine/SpriteManager.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

import SplashScreen          from './screens/SplashScreen.jsx';
import TitleScreen           from './screens/TitleScreen.jsx';
import CharacterSelectScreen from './screens/CharacterSelectScreen.jsx';
import LevelSelectScreen     from './screens/LevelSelectScreen.jsx';
import GameScreen            from './screens/GameScreen.jsx';

// ─── Asset manifest ───────────────────────────────────────────────────────────
import katieIdleUrl      from '../assets/sprites/katie_idle.png';
import katieWalk01Url    from '../assets/sprites/katie_walk_01.png';
import katieWalk02Url    from '../assets/sprites/katie_walk_02.png';
import katieWalk03Url    from '../assets/sprites/katie_walk_03.png';
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
import background01Url   from '../assets/backgrounds/background_03.png';

const SPRITE_MANIFEST = {
  katie_idle:          katieIdleUrl,
  katie_walk_01:       katieWalk01Url,
  katie_walk_02:       katieWalk02Url,
  katie_walk_03:       katieWalk03Url,
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
  bg_01:               background01Url,
};

// ─── Phase machine ────────────────────────────────────────────────────────────

export default function GameContainer() {
  const [phase,     setPhase]     = useState('splash');
  const [sprites,   setSprites]   = useState(null);
  const [character, setCharacter] = useState(null);
  const [level,     setLevel]     = useState(null);

  useEffect(() => {
    const mgr = new SpriteManager();
    mgr.preload(SPRITE_MANIFEST).then(() => setSprites(mgr));
  }, []);

  const goTitle        = ()      => setPhase('title');
  const goCharSelect   = ()      => setPhase('character_select');
  const goLevelSelect  = (char)  => { setCharacter(char); setPhase('level_select'); };
  const goGame         = (lvl)   => { setLevel(lvl);      setPhase('game'); };

  return (
    <div
      className="relative bg-black overflow-hidden"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      {phase === 'splash' && (
        <SplashScreen ready={!!sprites} onContinue={goTitle} />
      )}
      {phase === 'title' && (
        <TitleScreen onStart={goCharSelect} />
      )}
      {phase === 'character_select' && (
        <CharacterSelectScreen onSelect={goLevelSelect} />
      )}
      {phase === 'level_select' && (
        <LevelSelectScreen onSelect={goGame} />
      )}
      {phase === 'game' && (
        <GameScreen
          sprites={sprites}
          character={character}
          level={level}
          onQuit={() => setPhase('level_select')}
        />
      )}
    </div>
  );
}
