/**
 * GameContainer
 *
 * Top-level phase state machine.
 *
 *   splash → title → difficulty_select → character_select → costume_select → level_select → vs_screen → game
 *
 * Asset loading runs in the background during the splash screen.
 * A single AudioManager instance is shared across all phases.
 *   • Menu music plays during: title, difficulty_select, character_select, costume_select, level_select
 *   • VS stinger plays when vs_screen opens
 *   • Battle music is managed by GameScreen
 */

import { useEffect, useRef, useState } from 'react';
import './pixelFont.css';
import { SpriteManager }  from './engine/SpriteManager.js';
import { AudioManager }   from './engine/AudioManager.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

import SplashScreen            from './screens/SplashScreen.jsx';
import TitleScreen             from './screens/TitleScreen.jsx';
import DifficultySelectScreen  from './screens/DifficultySelectScreen.jsx';
import CharacterSelectScreen   from './screens/CharacterSelectScreen.jsx';
import CostumeSelectScreen     from './screens/CostumeSelectScreen.jsx';
import LevelSelectScreen       from './screens/LevelSelectScreen.jsx';
import VSScreen                from './screens/VSScreen.jsx';
import GameScreen              from './screens/GameScreen.jsx';
import OnlineLobbyScreen       from './screens/OnlineLobbyScreen.jsx';

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

const MENU_PHASES = new Set(['title', 'difficulty_select', 'character_select', 'costume_select', 'level_select']);

// ─── Fullscreen helpers ───────────────────────────────────────────────────────

function FullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20"/>
      <polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  );
}

// Detect iOS — fullscreen API is blocked; only orientation lock + PWA workaround available
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ─── Phase machine ────────────────────────────────────────────────────────────

export default function GameContainer() {
  const [phase,        setPhase]        = useState('splash');
  const [sprites,      setSprites]      = useState(null);
  const [difficulty,   setDifficulty]   = useState('easy');
  const [character,    setCharacter]    = useState(null);
  const [costume,      setCostume]      = useState(null);
  const [level,        setLevel]        = useState(null);
  const [matchKey,     setMatchKey]     = useState(0);
  const [scale,        setScale]        = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iosHint,      setIosHint]      = useState(false);
  const [twoPlayer,    setTwoPlayer]    = useState(false);
  const [netRole,      setNetRole]      = useState(null);  // null | 'host' | 'guest'
  const [p2Char,       setP2Char]       = useState(null);  // P2 slot character (online)
  const [gamepadCount, setGamepadCount] = useState(
    () => [...(navigator.getGamepads?.() ?? [])].filter(Boolean).length,
  );

  // Online netplay connection — owned here so it survives GameScreen remounts
  // (rematches). Set by OnlineLobbyScreen via onConnected.
  const netRef = useRef(null);
  const roleRef = useRef(null);
  const onlineCharsRef = useRef({ mine: null, theirs: null }); // char-pick exchange
  // Arrived via the "Tap to Fight!" push notification?
  const joinPendingRef = useRef(
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('join') === '1',
  );

  const wrapperRef = useRef(null);
  // Single AudioManager instance shared across all phases
  const audioRef   = useRef(null);
  if (!audioRef.current) audioRef.current = new AudioManager();

  // Responsive scaling — uses ResizeObserver for accuracy on iOS where
  // getBoundingClientRect can return 0 before layout settles.
  useEffect(() => {
    const calc = (w, h) => {
      if (w > 0 && h > 0) setScale(Math.min(w / CANVAS_WIDTH, h / CANVAS_HEIGHT));
    };

    // ResizeObserver fires whenever the wrapper's actual paint size changes
    // (orientation flip, keyboard open, fullscreen enter/exit, etc.)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        calc(e.contentRect.width, e.contentRect.height);
      }
    });
    if (wrapperRef.current) ro.observe(wrapperRef.current);

    // Fallback: window resize (catches cases where the observer hasn't fired yet)
    const onResize = () => {
      if (!wrapperRef.current) return;
      const { width, height } = wrapperRef.current.getBoundingClientRect();
      // If element reports 0 (layout not settled), use visualViewport
      const vw = width  || window.visualViewport?.width  || window.innerWidth;
      const vh = height || window.visualViewport?.height || window.innerHeight;
      calc(vw, vh);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    // Initial calculation — defer one frame to let iOS finish layout
    requestAnimationFrame(onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    const onChange = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(active);
      // Re-run scale calc after browser repaints at new dimensions
      setTimeout(() => {
        if (!wrapperRef.current) return;
        const { width, height } = wrapperRef.current.getBoundingClientRect();
        setScale(Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT));
      }, 100);
    };
    document.addEventListener('fullscreenchange',       onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange',       onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;

    if (fsEl) {
      // Exit fullscreen
      if      (document.exitFullscreen)       await document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      try { await screen.orientation.unlock(); } catch {}
      return;
    }

    // iOS — no programmatic fullscreen; offer orientation lock + hint
    if (isIOS()) {
      try { await screen.orientation.lock('landscape'); } catch {}
      // Only show the PWA hint if not already running as a PWA
      const isPwa = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
      if (!isPwa) {
        setIosHint(true);
        setTimeout(() => setIosHint(false), 5000);
      }
      return;
    }

    // Android / desktop — standard Fullscreen API
    const el = document.documentElement;
    try {
      if      (el.requestFullscreen)       await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      try { await screen.orientation.lock('landscape'); } catch {}
    } catch {}
  };

  // Gamepad connect/disconnect — update count so TitleScreen shows 2P option
  useEffect(() => {
    const update = () =>
      setGamepadCount([...(navigator.getGamepads?.() ?? [])].filter(Boolean).length);
    window.addEventListener('gamepadconnected',    update);
    window.addEventListener('gamepaddisconnected', update);
    return () => {
      window.removeEventListener('gamepadconnected',    update);
      window.removeEventListener('gamepaddisconnected', update);
    };
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

  // Stop all audio when navigating away from the game route
  useEffect(() => {
    return () => {
      audioRef.current?.stopMenuMusic();
      audioRef.current?.stopBattleMusic();
    };
  }, []);

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goTitle            = ()     => setPhase('title');
  const goAfterSplash      = ()     => setPhase(joinPendingRef.current ? 'online_lobby' : 'title');
  const goOnlineLobby      = ()     => setPhase('online_lobby');

  // Online lobby handed us an open DataChannel — both players pick a
  // character (any combination, mirror matches allowed), exchange picks over
  // the channel, then it's VS screen → fight. Host owns the P1 slot.
  const handleOnlineConnected = (net, role) => {
    netRef.current = net;
    roleRef.current = role;
    onlineCharsRef.current = { mine: null, theirs: null };
    net.onClose = () => {        // GameScreen overrides this while mounted
      netRef.current = null;
      roleRef.current = null;
      setNetRole(null);
      setTwoPlayer(false);
      setP2Char(null);
      setPhase('title');
    };
    net.onMessage = (m) => {     // pre-game: only char picks flow here
      if (m.t === 'char') {
        onlineCharsRef.current.theirs = m.c;
        maybeStartOnlineMatch();
      }
    };
    setNetRole(role);
    setTwoPlayer(true);
    setCostume('default');
    setLevel(null);              // default stage online
    setPhase('online_char_select');
  };

  const handleOnlineCharPick = (c) => {
    onlineCharsRef.current.mine = c;
    netRef.current?.send({ t: 'char', c });
    if (!maybeStartOnlineMatch()) setPhase('online_wait');
  };

  function maybeStartOnlineMatch() {
    const { mine, theirs } = onlineCharsRef.current;
    if (!mine || !theirs || !netRef.current) return false;
    const p1 = roleRef.current === 'host' ? mine : theirs;  // host = P1 slot
    const p2 = roleRef.current === 'host' ? theirs : mine;
    setCharacter(p1);
    setP2Char(p2);
    audioRef.current.playVsStinger();
    setPhase('vs_screen');
    return true;
  }
  const goDifficultySelect = ()     => setPhase('difficulty_select');
  const goCharSelect       = (diff) => { setDifficulty(diff); setPhase('character_select'); };
  const goCostumeSelect    = (c)    => { setCharacter(c); setPhase('costume_select'); };
  const goLevelSelect      = (cos)  => { setCostume(cos); setPhase('level_select'); };

  // 2P: skip difficulty/char/costume — go straight to level select as Katie
  const goLevelSelect2P = () => {
    setTwoPlayer(true);
    setCharacter('katie');
    setCostume('default');
    setPhase('level_select');
  };

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
    if (netRef.current) {
      netRef.current.onClose = null;   // we're quitting deliberately
      netRef.current.close();
      netRef.current = null;
      roleRef.current = null;
      setNetRole(null);
    }
    setCharacter(null); setCostume(null); setLevel(null);
    setTwoPlayer(false);
    setP2Char(null);
    setPhase('title');
  };

  // Rematch → difficulty select (1P), level select (2P), instant restart (online)
  const handleRematch = () => {
    if (netRef.current) {
      setMatchKey(k => k + 1);         // remount GameScreen, channel stays open
      return;
    }
    setCharacter(twoPlayer ? 'katie' : null);
    setCostume(twoPlayer ? 'default' : null);
    setLevel(null);
    setMatchKey(k => k + 1);
    setPhase(twoPlayer ? 'level_select' : 'difficulty_select');
  };

  const cpuCharId = character === 'katie' ? 'david' : 'katie';

  return (
    <div
      ref={wrapperRef}
      className="w-full flex-1 min-h-0 bg-black flex items-center justify-center"
      style={{ position: 'relative' }}
    >
      {/* Fullscreen toggle — hidden on iOS PWA (already fullscreen, button
          can't do anything useful there). position:absolute keeps it inside
          the game wrapper so it never overlaps the app header. */}
      {!(isIOS() && (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches)) && (
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{
            position:    'absolute',
            top:         8,
            right:       8,
            zIndex:      500,
            minWidth:    44,
            minHeight:   44,
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
            background:  'rgba(0,0,0,0.50)',
            border:      '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6,
            cursor:      'pointer',
            color:       'rgba(255,255,255,0.80)',
            lineHeight:  0,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      )}

      {/* iOS "Add to Home Screen" hint */}
      {iosHint && (
        <div
          style={{
            position:   'fixed',
            bottom:     20,
            left:       '50%',
            transform:  'translateX(-50%)',
            zIndex:     200,
            background: 'rgba(0,0,0,0.82)',
            border:     '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8,
            padding:    '10px 18px',
            color:      'rgba(255,255,255,0.85)',
            fontSize:   11,
            fontFamily: 'system-ui, sans-serif',
            textAlign:  'center',
            whiteSpace: 'nowrap',
            lineHeight: 1.5,
            pointerEvents: 'none',
          }}
        >
          For fullscreen on iOS:<br />
          Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>
        </div>
      )}

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
          <SplashScreen ready={!!sprites} onContinue={goAfterSplash} />
        )}
        {phase === 'title' && (
          <TitleScreen
            onStart={goDifficultySelect}
            onStart2P={goLevelSelect2P}
            onStartOnline={goOnlineLobby}
            canStart2P={gamepadCount >= 2}
            audio={audioRef.current}
          />
        )}
        {phase === 'online_lobby' && (
          <OnlineLobbyScreen
            autoJoin={joinPendingRef.current && (joinPendingRef.current = false, true)}
            onConnected={handleOnlineConnected}
            onBack={goTitle}
            audio={audioRef.current}
          />
        )}
        {phase === 'online_char_select' && (
          <CharacterSelectScreen
            onSelect={handleOnlineCharPick}
            onBack={handleQuit}
            audio={audioRef.current}
          />
        )}
        {phase === 'online_wait' && (
          <div className="flex h-full w-full items-center justify-center bg-black select-none">
            <p className="animate-pulse" style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.6rem', letterSpacing: '0.2em', color: '#fff' }}>
              WAITING FOR OPPONENT…
            </p>
          </div>
        )}
        {phase === 'difficulty_select' && (
          <DifficultySelectScreen
            onSelect={goCharSelect}
            onBack={goTitle}
            audio={audioRef.current}
          />
        )}
        {phase === 'character_select' && (
          <CharacterSelectScreen onSelect={goCostumeSelect} onBack={() => setPhase('difficulty_select')} audio={audioRef.current} />
        )}
        {phase === 'costume_select' && (
          <CostumeSelectScreen character={character} onSelect={goLevelSelect} onBack={goCharSelect} audio={audioRef.current} />
        )}
        {phase === 'level_select' && (
          <LevelSelectScreen
            onSelect={goVsScreen}
            onBack={() => twoPlayer ? setPhase('title') : setPhase('costume_select')}
            audio={audioRef.current}
          />
        )}
        {phase === 'vs_screen' && (
          <VSScreen
            sprites={sprites}
            playerCharId={character}
            cpuCharId={p2Char ?? cpuCharId}
            rightTag={twoPlayer ? 'P2' : 'CPU'}
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
            difficulty={difficulty}
            audio={audioRef.current}
            twoPlayer={twoPlayer}
            p2Character={p2Char}
            net={netRef.current}
            netRole={netRole}
            onQuit={handleQuit}
            onRematch={handleRematch}
          />
        )}
      </div>
    </div>
  );
}
