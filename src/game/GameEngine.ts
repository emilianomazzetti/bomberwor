import { soundEngine } from '../utils/audio';
import { CHARACTER_OPTIONS } from '../data/characters';
import { SubjectType, getInitialQuestion, getNextQuestion } from '../data/educationalData';
import confetti from 'canvas-confetti';

export const GRID_COLS = 21;
export const GRID_ROWS = 13;

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;      // Unbreakable block
export const TILE_CRATE = 2;     // Destructible brick crate

export interface EduTile {
  x: number;
  y: number;
  symbol: string;
  subject: SubjectType;
  color?: string;
  bobOffset: number;
}

export interface Bomb {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  timer: number; // in frames (starts at 180 = ~3 seconds at 60fps)
  maxTimer: number;
  range: number;
  allowedPlayers: Set<string>; // players currently stepping off this bomb
}

export interface FlameTile {
  x: number;
  y: number;
  life: number; // in frames (e.g. 30 frames = 0.5s)
  isCenter: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export type BonusType = 'points_5' | 'points_10' | 'points_15' | 'speed_wings' | 'extra_bombs_1' | 'extra_bombs_2' | 'fire_power';

export interface BonusItem {
  id: string;
  x: number;
  y: number;
  type: BonusType;
  bobOffset: number;
}

export interface EnginePlayer {
  id: string;
  name: string;
  colorIdx: number;
  x: number; // in grid units
  y: number; // in grid units
  vx: number;
  vy: number;
  direction: 'down' | 'up' | 'left' | 'right';
  frame: number;
  speed: number;
  bombs: number;
  maxBombs: number;
  bombRange: number;
  score: number;
  isGhost: boolean;
  stunnedUntil: number; // timestamp
  lastBombSeq: number;

  // Active bonuses
  speedBonus: number;       // count of wings
  rangeBonus: number;       // count of flames (up to 5)
  extraBombsBonus: number;  // extra bomb slots
  completedItems: string[]; // history of solved words/operations
  bombRechargeTimer: number; // 3-second cooldown countdown when bombs are exhausted

  // Autonomous bot properties
  isBot?: boolean;
  isAdversary?: boolean;
  botAiTimer?: number;
  botBombTimer?: number;
  
  // Educational progress
  subject: SubjectType;
  questionText: string;
  targetSymbol: string;
  spellingWord?: string;
  letterIndex?: number;
  options?: string[];
  correctAnswer?: string;
  wordsCompleted: number;

  // Last input received
  input: {
    dx: number;
    dy: number;
    bombSeq: number;
  };
}

export class GameEngine {
  public grid: number[][] = [];
  public eduTiles: EduTile[] = [];
  public bonusItems: BonusItem[] = [];
  public bombs: Bomb[] = [];
  public flames: FlameTile[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public players: Map<string, EnginePlayer> = new Map();
  public subject: SubjectType = 'ortografia';
  public mysteryBoxes: boolean = true;
  
  private charImage: HTMLImageElement | null = null;
  private mapImage: HTMLImageElement | null = null;
  private imagesLoaded = false;
  
  public gameTimerSeconds: number = 180;
  public isGameOver: boolean = false;
  public winnerName: string | null = null;

  constructor() {
    this.initImages();
    this.initGrid();
  }

  private initImages() {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '') + '/';
    this.charImage = new Image();
    this.charImage.src = `${base}assets/aistudio/personaggio1_ede34207.jpg`;
    this.charImage.onload = () => {
      this.imagesLoaded = true;
    };
    this.charImage.onerror = () => {
      console.warn('Could not load character sprite, using high-res vector canvas fallback');
    };

    this.mapImage = new Image();
    this.mapImage.src = `${base}assets/aistudio/esempio_mappa_b8da9aae.png`;
    this.mapImage.onload = () => {};
  }

  public initGrid() {
    this.grid = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      const row: number[] = [];
      for (let x = 0; x < GRID_COLS; x++) {
        // Outer boundaries
        if (x === 0 || x === GRID_COLS - 1 || y === 0 || y === GRID_ROWS - 1) {
          row.push(TILE_WALL);
        }
        // Fixed pillars on every odd coordinate
        else if (x % 2 === 0 && y % 2 === 0) {
          row.push(TILE_WALL);
        }
        // Safe spawn corners and generous surrounding open space (guaranteed unblocked)
        else if (
          (x <= 3 && y <= 3) ||
          (x >= GRID_COLS - 4 && y <= 3) ||
          (x <= 3 && y >= GRID_ROWS - 4) ||
          (x >= GRID_COLS - 4 && y >= GRID_ROWS - 4) ||
          (x === Math.floor(GRID_COLS / 2) && y <= 3) ||
          (x === Math.floor(GRID_COLS / 2) && y >= GRID_ROWS - 4)
        ) {
          row.push(TILE_EMPTY);
        }
        // Random destructible crates
        else {
          row.push(Math.random() < 0.60 ? TILE_CRATE : TILE_EMPTY);
        }
      }
      this.grid.push(row);
    }

    this.bombs = [];
    this.flames = [];
    this.particles = [];
    this.floatingTexts = [];
    this.eduTiles = [];
    this.bonusItems = [];
    this.initAdversaryBots();
    this.repopulateEduTiles();
  }

  public initAdversaryBots() {
    // 2 enemy bots moving at reduced speed and dropping bombs randomly at regular intervals
    const bot1Id = 'adversary_bot_1';
    const bot2Id = 'adversary_bot_2';

    this.players.delete(bot1Id);
    this.players.delete(bot2Id);

    const initialQ1 = getInitialQuestion(this.subject, 1);
    const initialQ2 = getInitialQuestion(this.subject, 2);

    const bot1: EnginePlayer = {
      id: bot1Id,
      name: 'Robo-Alfa 🤖',
      colorIdx: 0, // Red
      x: GRID_COLS - 2 + 0.5,
      y: 1.5,
      vx: 0,
      vy: 0,
      direction: 'left',
      frame: 0,
      speed: 0.05, // Reduced speed as requested
      bombs: 1,
      maxBombs: 2,
      bombRange: 2,
      score: 0,
      isGhost: false,
      stunnedUntil: 0,
      lastBombSeq: 0,
      speedBonus: 0,
      rangeBonus: 0,
      extraBombsBonus: 0,
      completedItems: [],
      bombRechargeTimer: 0,
      isBot: true,
      isAdversary: true,
      botAiTimer: 30,
      botBombTimer: 240 + Math.floor(Math.random() * 120),
      subject: this.subject,
      questionText: initialQ1.questionText,
      targetSymbol: initialQ1.targetSymbol,
      spellingWord: initialQ1.spellingWord,
      letterIndex: initialQ1.letterIndex,
      wordsCompleted: 0,
      input: { dx: -1, dy: 0, bombSeq: 0 }
    };

    const bot2: EnginePlayer = {
      id: bot2Id,
      name: 'Robo-Beta 🤖',
      colorIdx: 4, // Purple
      x: 1.5,
      y: GRID_ROWS - 2 + 0.5,
      vx: 0,
      vy: 0,
      direction: 'right',
      frame: 0,
      speed: 0.05, // Reduced speed as requested
      bombs: 1,
      maxBombs: 2,
      bombRange: 2,
      score: 0,
      isGhost: false,
      stunnedUntil: 0,
      lastBombSeq: 0,
      speedBonus: 0,
      rangeBonus: 0,
      extraBombsBonus: 0,
      completedItems: [],
      bombRechargeTimer: 0,
      isBot: true,
      isAdversary: true,
      botAiTimer: 45,
      botBombTimer: 360 + Math.floor(Math.random() * 120),
      subject: this.subject,
      questionText: initialQ2.questionText,
      targetSymbol: initialQ2.targetSymbol,
      spellingWord: initialQ2.spellingWord,
      letterIndex: initialQ2.letterIndex,
      wordsCompleted: 0,
      input: { dx: 1, dy: 0, bombSeq: 0 }
    };

    this.players.set(bot1Id, bot1);
    this.players.set(bot2Id, bot2);
  }

  public repopulateEduTiles() {
    // In math mode, strictly purge any tile that is not a single digit 0-9
    if (this.subject === 'matematica') {
      this.eduTiles = this.eduTiles.filter(t => /^[0-9]$/.test(t.symbol));
    }

    // Collect all open walkable empty tiles
    const emptySpots: { x: number; y: number }[] = [];
    for (let y = 1; y < GRID_ROWS - 1; y++) {
      for (let x = 1; x < GRID_COLS - 1; x++) {
        if (this.grid[y][x] === TILE_EMPTY) {
          const hasTile = this.eduTiles.some(t => t.x === x && t.y === y);
          if (!hasTile) {
            emptySpots.push({ x, y });
          }
        }
      }
    }

    // Determine target symbols currently needed by active human players
    const neededSymbols: string[] = [];
    this.players.forEach(p => {
      if (!p.isAdversary && !p.isGhost && p.targetSymbol) {
        if (this.subject === 'matematica') {
          if (/^[0-9]$/.test(p.targetSymbol)) {
            neededSymbols.push(p.targetSymbol);
          }
        } else {
          neededSymbols.push(p.targetSymbol);
        }
      }
    });

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const mathDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    // Ensure we have at least 10 to 14 educational tiles on the wider board
    const desiredCount = Math.min(12, emptySpots.length);
    while (this.eduTiles.length < desiredCount && emptySpots.length > 0) {
      const idx = Math.floor(Math.random() * emptySpots.length);
      const spot = emptySpots.splice(idx, 1)[0];

      let symbol = '';
      if (neededSymbols.length > 0 && Math.random() < 0.6) {
        symbol = neededSymbols.shift()!;
      } else {
        if (this.subject === 'matematica') {
          symbol = mathDigits[Math.floor(Math.random() * mathDigits.length)];
        } else {
          symbol = alphabet[Math.floor(Math.random() * alphabet.length)];
        }
      }

      this.eduTiles.push({
        x: spot.x,
        y: spot.y,
        symbol,
        subject: this.subject,
        bobOffset: Math.random() * Math.PI * 2
      });
    }
  }

  public addOrUpdatePlayer(
    id: string,
    name: string,
    colorIdx: number,
    initialSubject: SubjectType
  ): EnginePlayer {
    let player = this.players.get(id);
    if (!player) {
      // Find spawn location based on player count
      const spawns = [
        { x: 1, y: 1 },
        { x: GRID_COLS - 2, y: GRID_ROWS - 2 },
        { x: Math.floor(GRID_COLS / 2), y: 1 },
        { x: Math.floor(GRID_COLS / 2), y: GRID_ROWS - 2 },
        { x: 1, y: Math.floor(GRID_ROWS / 2) },
        { x: GRID_COLS - 2, y: Math.floor(GRID_ROWS / 2) },
        { x: 3, y: 1 },
        { x: GRID_COLS - 4, y: GRID_ROWS - 2 },
        { x: 1, y: 3 },
        { x: GRID_COLS - 2, y: 3 }
      ];
      const spawn = spawns[this.players.size % spawns.length];
      const initialQ = getInitialQuestion(initialSubject, this.players.size);

      player = {
        id,
        name: name || `Bomber ${this.players.size + 1}`,
        colorIdx: colorIdx % CHARACTER_OPTIONS.length,
        x: spawn.x + 0.5,
        y: spawn.y + 0.5,
        vx: 0,
        vy: 0,
        direction: 'down',
        frame: 0,
        speed: 0.11, // Smooth, crisp arcade walking speed
        bombs: 1, // starts with 1 ready bomb
        maxBombs: 3,
        bombRange: 2,
        score: 0,
        isGhost: false,
        stunnedUntil: 0,
        lastBombSeq: 0,
        speedBonus: 0,
        rangeBonus: 0,
        extraBombsBonus: 0,
        completedItems: [],
        bombRechargeTimer: 0,
        subject: initialSubject,
        questionText: initialQ.questionText,
        targetSymbol: initialQ.targetSymbol,
        spellingWord: initialQ.spellingWord,
        letterIndex: initialQ.letterIndex,
        options: initialQ.options,
        correctAnswer: initialQ.correctAnswer,
        wordsCompleted: 0,
        input: { dx: 0, dy: 0, bombSeq: 0 }
      };
      this.players.set(id, player);
    } else {
      player.name = name;
      player.colorIdx = colorIdx;
    }
    return player;
  }

  public removePlayer(id: string) {
    this.players.delete(id);
  }

  public updatePlayerInput(id: string, dx: number, dy: number, bombSeq: number) {
    const player = this.players.get(id);
    if (!player) return;
    player.input.dx = dx;
    player.input.dy = dy;
    if (bombSeq > player.lastBombSeq) {
      player.input.bombSeq = bombSeq;
    }
  }

  public reviveGhost(playerId: string) {
    const player = this.players.get(playerId);
    if (!player || !player.isGhost) return;
    
    // Revive in a safe corner
    player.isGhost = false;
    player.bombs = Math.max(1, player.bombs);
    player.x = 1.5;
    player.y = 1.5;
    this.addFloatingText(player.x, player.y, 'RIVISSUTO! 🌟', '#10b981');
    soundEngine.playWordComplete();
  }

  public dropBomb(player: EnginePlayer) {
    if (player.isGhost || player.bombs <= 0) return;
    
    const tileX = Math.floor(player.x);
    const tileY = Math.floor(player.y);

    // Check if a bomb already exists at this tile
    const alreadyExists = this.bombs.some(b => b.x === tileX && b.y === tileY);
    if (alreadyExists) return;

    player.bombs -= 1;

    // Track all players currently standing on this bomb tile so they can freely walk off!
    const allowed = new Set<string>();
    this.players.forEach(p => {
      const dist = Math.hypot(p.x - (tileX + 0.5), p.y - (tileY + 0.5));
      if (dist < 0.95) {
        allowed.add(p.id);
      }
    });

    this.bombs.push({
      id: `bomb_${Date.now()}_${Math.random()}`,
      x: tileX,
      y: tileY,
      ownerId: player.id,
      timer: 180, // ~3 seconds at 60 fps
      maxTimer: 180,
      range: player.bombRange,
      allowedPlayers: allowed
    });

    soundEngine.playBombDrop();
  }

  public explodeBomb(bomb: Bomb) {
    soundEngine.playExplosion();

    // Center flame
    this.flames.push({
      x: bomb.x,
      y: bomb.y,
      life: 30,
      isCenter: true
    });

    // 4 directions: [dx, dy]
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    dirs.forEach(({ dx, dy }) => {
      for (let r = 1; r <= bomb.range; r++) {
        const nx = bomb.x + dx * r;
        const ny = bomb.y + dy * r;

        if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) break;

        const cell = this.grid[ny][nx];

        // Hit unbreakable wall -> stops flame
        if (cell === TILE_WALL) {
          break;
        }

        // Hit destructible crate -> breaks it and stops flame
        if (cell === TILE_CRATE) {
          this.grid[ny][nx] = TILE_EMPTY;
          this.flames.push({ x: nx, y: ny, life: 30, isCenter: false });
          this.createCrateParticles(nx, ny);

          // Give mystery reward: Educational tile OR Bonus Item!
          const roll = Math.random();
          if (roll < 0.40) {
            // Drop an educational tile!
            const playerOwner = this.players.get(bomb.ownerId);
            let symbol = playerOwner ? playerOwner.targetSymbol : '';
            if (this.subject === 'matematica') {
              if (!symbol || !/^[0-9]$/.test(symbol)) {
                symbol = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'][Math.floor(Math.random() * 10)];
              }
            } else {
              if (!symbol) symbol = 'A';
            }

            this.eduTiles.push({
              x: nx,
              y: ny,
              symbol,
              subject: this.subject,
              bobOffset: Math.random() * Math.PI * 2
            });
            this.addFloatingText(nx + 0.5, ny + 0.5, this.subject === 'matematica' ? 'NUMERO! 🔢' : 'LETTERA! 🔤', '#38bdf8');
          } else if (roll < 0.85) {
            // Drop a Bonus Item!
            const bonusPool: BonusType[] = [
              'points_5', 'points_10', 'points_15',
              'speed_wings',
              'extra_bombs_1', 'extra_bombs_2',
              'fire_power'
            ];
            const chosenBonus = bonusPool[Math.floor(Math.random() * bonusPool.length)];
            this.bonusItems.push({
              id: `bonus_${Date.now()}_${Math.random()}`,
              x: nx,
              y: ny,
              type: chosenBonus,
              bobOffset: Math.random() * Math.PI * 2
            });
            this.addFloatingText(nx + 0.5, ny + 0.5, 'BONUS! 🎁', '#f59e0b');
          }
          break;
        }

        // Open space -> continue flame
        this.flames.push({ x: nx, y: ny, life: 30, isCenter: false });

        // Check if there is another bomb to trigger chain reaction
        const chainBomb = this.bombs.find(b => b.x === nx && b.y === ny);
        if (chainBomb) {
          chainBomb.timer = Math.min(chainBomb.timer, 2);
        }
      }
    });

    // Restore owner's bomb stock (up to maxBombs)
    const owner = this.players.get(bomb.ownerId);
    if (owner) {
      owner.bombs = Math.min(owner.maxBombs, owner.bombs + 1);
    }
  }

  private createCrateParticles(gx: number, gy: number) {
    const px = gx + 0.5;
    const py = gy + 0.5;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.05 + Math.random() * 0.1;
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: ['#b45309', '#d97706', '#f59e0b', '#78350f'][Math.floor(Math.random() * 4)],
        size: 3 + Math.random() * 4
      });
    }
  }

  public addFloatingText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 50,
      maxLife: 50
    });
  }

  /**
   * Main 60 FPS update loop
   */
  public update() {
    const now = Date.now();

    // 0. Update adversary enemy bots AI
    this.updateAdversaryBots(now);

    // 1. Update players
    this.players.forEach(player => {
      // Handle bomb dropping trigger from input
      if (player.input.bombSeq > player.lastBombSeq) {
        player.lastBombSeq = player.input.bombSeq;
        this.dropBomb(player);
      }

      // Automatic bomb recharge when player has 0 bombs (3-second cooldown)
      if (player.bombs <= 0 && !player.isGhost) {
        if (player.bombRechargeTimer <= 0) {
          player.bombRechargeTimer = 180; // 3 seconds at 60fps
        } else {
          player.bombRechargeTimer -= 1;
          if (player.bombRechargeTimer <= 0) {
            player.bombs = 1;
            soundEngine.playCorrect();
            this.addFloatingText(player.x, player.y - 0.3, '+1 BOMBA RICARICATA! 💣', '#22c55e');
          }
        }
      } else {
        player.bombRechargeTimer = 0;
      }

      // Check if stunned
      const isStunned = now < player.stunnedUntil;
      const speedModifier = isStunned ? 0.35 : 1.0;
      const currentSpeed = (player.isGhost ? player.speed * 0.75 : player.speed) * speedModifier;

      const dx = player.input.dx;
      const dy = player.input.dy;

      if (dx !== 0 || dy !== 0) {
        // Normalize direction vector
        const mag = Math.sqrt(dx * dx + dy * dy);
        const normDx = (dx / mag) * currentSpeed;
        const normDy = (dy / mag) * currentSpeed;

        // Facing direction
        if (Math.abs(normDx) > Math.abs(normDy)) {
          player.direction = normDx > 0 ? 'right' : 'left';
        } else {
          player.direction = normDy > 0 ? 'down' : 'up';
        }

        // Animation frame
        player.frame = (player.frame + 0.18) % 4;

        if (player.isGhost) {
          // Ghosts can float through crates (but stay within outer borders)
          const targetX = Math.max(1, Math.min(GRID_COLS - 2, player.x + normDx));
          const targetY = Math.max(1, Math.min(GRID_ROWS - 2, player.y + normDy));
          player.x = targetX;
          player.y = targetY;
        } else {
          // Grid collision with walls, crates, and other bombs
          this.movePlayerWithCollision(player, normDx, normDy);
        }
      }

      // Check collision with educational tiles (only human players)
      if (!player.isAdversary) {
        this.checkPlayerTileCollisions(player, now);
        this.checkPlayerBonusCollisions(player);
      }
    });

    // 2. Update bombs & clear allowedPlayers once players step away
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];

      // Remove players from allowed pass list once they have stepped completely outside the bomb
      if (bomb.allowedPlayers && bomb.allowedPlayers.size > 0) {
        const toClear: string[] = [];
        bomb.allowedPlayers.forEach(pId => {
          const p = this.players.get(pId);
          if (p) {
            const dist = Math.hypot(p.x - (bomb.x + 0.5), p.y - (bomb.y + 0.5));
            if (dist > 0.92) {
              toClear.push(pId);
            }
          } else {
            toClear.push(pId);
          }
        });
        toClear.forEach(id => bomb.allowedPlayers.delete(id));
      }

      bomb.timer -= 1;
      if (bomb.timer <= 0) {
        this.explodeBomb(bomb);
        this.bombs.splice(i, 1);
      }
    }

    // 3. Update flames and damage
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const flame = this.flames[i];
      flame.life -= 1;

      // Flame damage to players
      this.players.forEach(p => {
        if (!p.isGhost) {
          const dist = Math.hypot(p.x - (flame.x + 0.5), p.y - (flame.y + 0.5));
          if (dist < 0.65) {
            // Player hit by explosion!
            p.isGhost = true;
            if (p.isAdversary) {
              p.stunnedUntil = now + 3000;
              p.bombs = 1;
              soundEngine.playWrong();
              this.addFloatingText(p.x, p.y, 'NEMICO COLPITO! 💥', '#ef4444');
            } else {
              // Se fai esplodere un personaggio o lui muore si annullano tutti i bonus
              p.speed = 0.11;
              p.speedBonus = 0;
              p.bombRange = 2;
              p.rangeBonus = 0;
              p.maxBombs = 3;
              p.extraBombsBonus = 0;
              p.bombs = 1;
              p.bombRechargeTimer = 0;

              soundEngine.playWrong();
              this.addFloatingText(p.x, p.y, 'BONUS ANNULLATI! 💥', '#ef4444');
            }
          }
        }
      });

      if (flame.life <= 0) {
        this.flames.splice(i, 1);
      }
    }

    // 4. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 5. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 0.015;
      ft.life -= 1;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Ensure educational tiles remain stocked
    if (this.eduTiles.length < 8) {
      this.repopulateEduTiles();
    }
  }

  /**
   * Autonomous AI for the 2 adversary bots
   * They move at reduced speed (0.05) and drop bombs randomly at regular intervals (6-9s)
   */
  private updateAdversaryBots(now: number) {
    this.players.forEach(p => {
      if (!p.isAdversary) return;

      // If defeated / ghost, auto repair and respawn in their corner after 3 seconds
      if (p.isGhost) {
        if (now > p.stunnedUntil) {
          p.isGhost = false;
          p.bombs = 1;
          p.x = p.id.includes('1') ? GRID_COLS - 1.5 : 1.5;
          p.y = p.id.includes('1') ? 1.5 : GRID_ROWS - 1.5;
          this.addFloatingText(p.x, p.y, 'NEMICO RIGENERATO! 🤖', '#a855f7');
        }
        return;
      }

      p.botAiTimer = (p.botAiTimer || 0) - 1;
      p.botBombTimer = (p.botBombTimer || 240) - 1;

      const tileX = Math.floor(p.x);
      const tileY = Math.floor(p.y);

      // 1. Check if there is an active bomb nearby (within 3.2 tiles). If so, flee from it!
      const nearbyBomb = this.bombs.find(b => Math.hypot(b.x - p.x, b.y - p.y) < 3.2);
      if (nearbyBomb) {
        const dx = p.x - (nearbyBomb.x + 0.5);
        const dy = p.y - (nearbyBomb.y + 0.5);
        const mag = Math.hypot(dx, dy) || 1;
        p.input.dx = (dx / mag) * 0.9;
        p.input.dy = (dy / mag) * 0.9;
        p.botAiTimer = 15;
      } else {
        // 2. Hunt nearest human player!
        let nearestPlayer: EnginePlayer | null = null;
        let minDist = Infinity;
        this.players.forEach(other => {
          if (!other.isAdversary && !other.isGhost) {
            const dist = Math.hypot(other.x - p.x, other.y - p.y);
            if (dist < minDist) {
              minDist = dist;
              nearestPlayer = other;
            }
          }
        });

        if (nearestPlayer) {
          const target = nearestPlayer as EnginePlayer;
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const mag = Math.hypot(dx, dy) || 1;
          p.input.dx = (dx / mag) * 0.82;
          p.input.dy = (dy / mag) * 0.82;

          // If close to player and has bomb, drop bomb to trap/blow them up!
          if (minDist < 2.0 && p.bombs > 0 && p.botBombTimer <= 0) {
            this.dropBomb(p);
            p.input.dx = -p.input.dx;
            p.input.dy = -p.input.dy;
            p.botBombTimer = 300 + Math.floor(Math.random() * 120);
          }
        } else {
          // Wandering fallback
          if (p.botAiTimer <= 0) {
            p.botAiTimer = 45;
            const angles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
            const a = angles[Math.floor(Math.random() * angles.length)];
            p.input.dx = Math.cos(a) * 0.7;
            p.input.dy = Math.sin(a) * 0.7;
          }
        }
      }
    });
  }

  /**
   * Buttery-smooth arcade collision with corridor snapping and corner assist
   */
  private movePlayerWithCollision(player: EnginePlayer, dx: number, dy: number) {
    const radius = 0.28; // Comfortable corridor collision radius (corridors are 1.0 wide)

    const isMovingX = Math.abs(dx) > 0.01;
    const isMovingY = Math.abs(dy) > 0.01;

    // Corner assist: smoothly align into hallway center without stopping momentum
    if (isMovingX && Math.abs(dx) >= Math.abs(dy)) {
      const centerY = Math.floor(player.y) + 0.5;
      const diffY = centerY - player.y;
      if (Math.abs(diffY) > 0.01) {
        player.y += diffY * 0.22;
      }
    }

    if (isMovingY && Math.abs(dy) > Math.abs(dx)) {
      const centerX = Math.floor(player.x) + 0.5;
      const diffX = centerX - player.x;
      if (Math.abs(diffX) > 0.01) {
        player.x += diffX * 0.22;
      }
    }

    // Move along X
    if (dx !== 0) {
      const nextX = player.x + dx;
      if (!this.checkCollides(nextX, player.y, radius, player)) {
        player.x = nextX;
      }
    }

    // Move along Y
    if (dy !== 0) {
      const nextY = player.y + dy;
      if (!this.checkCollides(player.x, nextY, radius, player)) {
        player.y = nextY;
      }
    }
  }

  private checkCollides(px: number, py: number, radius: number, player: EnginePlayer): boolean {
    const minX = Math.floor(px - radius);
    const maxX = Math.floor(px + radius);
    const minY = Math.floor(py - radius);
    const maxY = Math.floor(py + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return true;
        
        const cell = this.grid[y][x];
        if (cell === TILE_WALL || cell === TILE_CRATE) {
          return true;
        }

        // Check bomb collision (only solid if player is not currently allowed to step off)
        const bomb = this.bombs.find(b => b.x === x && b.y === y);
        if (bomb) {
          if (bomb.allowedPlayers && bomb.allowedPlayers.has(player.id)) {
            // Player is allowed to freely step off the bomb!
          } else {
            return true;
          }
        }
      }
    }
    return false;
  }

  private checkPlayerTileCollisions(player: EnginePlayer, now: number) {
    if (player.isGhost) return;

    for (let i = this.eduTiles.length - 1; i >= 0; i--) {
      const tile = this.eduTiles[i];
      const dist = Math.hypot(player.x - (tile.x + 0.5), player.y - (tile.y + 0.5));

      if (dist < 0.5) {
        // Player touched this educational tile!
        const isMatch = tile.symbol.toUpperCase() === player.targetSymbol.toUpperCase();

        if (isMatch) {
          // SUCCESS!
          soundEngine.playCorrect();
          player.score += 10;
          player.bombs = Math.min(player.maxBombs, player.bombs + 1);

          this.addFloatingText(tile.x + 0.5, tile.y + 0.5, '+1 BOMBA! 💣', '#22c55e');

          // Capture current question info before advancing
          const currentSpelling = player.spellingWord;
          const currentPrompt = player.questionText;
          const currentSymbol = player.targetSymbol;
          const currentAnswer = player.correctAnswer;

          // Advance question
          const nextQ = getNextQuestion(
            player.subject,
            player.letterIndex ?? 0,
            player.spellingWord,
            player.wordsCompleted
          );

          player.questionText = nextQ.questionText;
          player.targetSymbol = nextQ.targetSymbol;
          player.spellingWord = nextQ.spellingWord;
          player.letterIndex = nextQ.letterIndex;
          player.options = nextQ.options;
          player.correctAnswer = nextQ.correctAnswer;

          if (nextQ.isWordCompleted) {
            player.wordsCompleted += 1;
            player.score += 25;
            soundEngine.playWordComplete();

            // Store formatted completed item for live scoreboard & tablet
            let solvedItem = '';
            if (player.subject === 'ortografia' || player.subject === 'inglese') {
              solvedItem = currentSpelling || player.spellingWord || currentSymbol;
            } else if (player.subject === 'matematica') {
              const fullAns = currentAnswer || currentSpelling || '';
              const cleanPrompt = currentPrompt.split('[')[0].replace('?', '').replace('=', '').trim();
              solvedItem = cleanPrompt ? `${cleanPrompt} = ${fullAns}` : fullAns;
            } else if (player.subject === 'verbi') {
              solvedItem = currentAnswer || currentSymbol;
            } else {
              solvedItem = currentSymbol;
            }

            if (solvedItem && !player.completedItems.includes(solvedItem)) {
              player.completedItems.push(solvedItem);
            }

            this.addFloatingText(player.x, player.y - 0.4, 'OBIETTIVO COMPLETATO! 🎉', '#fbbf24');
            confetti({
              particleCount: 30,
              spread: 60,
              origin: { y: 0.6 }
            });
          }

          // Remove the collected tile
          this.eduTiles.splice(i, 1);
          this.repopulateEduTiles();
          break;
        } else {
          // WRONG ANSWER TILE!
          if (now > player.stunnedUntil) {
            soundEngine.playWrong();
            player.stunnedUntil = now + 2000; // 2 seconds slowdown
            this.addFloatingText(player.x, player.y, 'RALLENTATO! ⚡ (-2s)', '#ef4444');
          }
        }
      }
    }
  }

  private checkPlayerBonusCollisions(player: EnginePlayer) {
    if (player.isGhost) return;

    for (let i = this.bonusItems.length - 1; i >= 0; i--) {
      const item = this.bonusItems[i];
      const dist = Math.hypot(player.x - (item.x + 0.5), player.y - (item.y + 0.5));

      if (dist < 0.55) {
        soundEngine.playCorrect();

        if (item.type === 'points_5') {
          player.score += 5;
          this.addFloatingText(player.x, player.y - 0.3, '+5 PUNTI! ⭐', '#facc15');
        } else if (item.type === 'points_10') {
          player.score += 10;
          this.addFloatingText(player.x, player.y - 0.3, '+10 PUNTI! 🌟', '#38bdf8');
        } else if (item.type === 'points_15') {
          player.score += 15;
          this.addFloatingText(player.x, player.y - 0.3, '+15 PUNTI! 👑', '#a855f7');
        } else if (item.type === 'speed_wings') {
          player.speedBonus = Math.min(4, player.speedBonus + 1);
          player.speed = Math.min(0.18, 0.11 + player.speedBonus * 0.018);
          this.addFloatingText(player.x, player.y - 0.3, 'ALI VELOCITÀ! 🪽', '#67e8f9');
        } else if (item.type === 'extra_bombs_1') {
          player.extraBombsBonus += 1;
          player.maxBombs = Math.min(8, player.maxBombs + 1);
          player.bombs = Math.min(player.maxBombs, player.bombs + 1);
          this.addFloatingText(player.x, player.y - 0.3, '+1 BOMBA! 💣', '#fb923c');
        } else if (item.type === 'extra_bombs_2') {
          player.extraBombsBonus += 2;
          player.maxBombs = Math.min(8, player.maxBombs + 2);
          player.bombs = Math.min(player.maxBombs, player.bombs + 2);
          this.addFloatingText(player.x, player.y - 0.3, '+2 BOMBE! 💣💣', '#f97316');
        } else if (item.type === 'fire_power') {
          player.rangeBonus = Math.min(5, player.rangeBonus + 1);
          player.bombRange = 2 + player.rangeBonus;
          this.addFloatingText(player.x, player.y - 0.3, `RAGGIO FIAMMA +${player.rangeBonus}! 🔥`, '#ef4444');
        }

        this.bonusItems.splice(i, 1);
        break;
      }
    }
  }

  /**
   * High performance 60 FPS HTML5 Canvas Rendering
   */
  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height);

    const tileW = width / GRID_COLS;
    const tileH = height / GRID_ROWS;

    // 1. Draw Arena Floor (Checkered Grass Pattern)
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const isEven = (x + y) % 2 === 0;
        ctx.fillStyle = isEven ? '#4ade80' : '#22c55e'; // Vibrant retro grass
        ctx.fillRect(x * tileW, y * tileH, tileW, tileH);

        // Subtle grass blade details
        if (isEven && (x + y) % 3 === 0) {
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(x * tileW + tileW * 0.4, y * tileH + tileH * 0.4, tileW * 0.1, tileH * 0.2);
        }
      }
    }

    // 2. Draw Grid Obstacles (Walls and Crates)
    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const cell = this.grid[y][x];
        const rx = x * tileW;
        const ry = y * tileH;

        if (cell === TILE_WALL) {
          this.drawSolidWall(ctx, rx, ry, tileW, tileH, x, y);
        } else if (cell === TILE_CRATE) {
          this.drawCrate(ctx, rx, ry, tileW, tileH);
        }
      }
    }

    // 3. Draw Educational Tiles (Floating Bobbing Elements)
    const time = Date.now() * 0.005;
    this.eduTiles.forEach(tile => {
      const rx = tile.x * tileW;
      const ry = tile.y * tileH;
      const bob = Math.sin(time + tile.bobOffset) * 4;

      this.drawEduTile(ctx, rx, ry + bob, tileW, tileH, tile.symbol);
    });

    // Draw Mystery Bonus Items (Wings, Flames, Bomb stock, Bonus points)
    this.bonusItems.forEach(item => {
      const rx = item.x * tileW;
      const ry = item.y * tileH;
      const bob = Math.sin(time + item.bobOffset) * 4;
      this.drawBonusItem(ctx, rx, ry + bob, tileW, tileH, item.type);
    });

    // 4. Draw Bombs
    this.bombs.forEach(bomb => {
      const rx = bomb.x * tileW;
      const ry = bomb.y * tileH;
      this.drawBomb(ctx, rx, ry, tileW, tileH, bomb);
    });

    // 5. Draw Explosion Flames
    this.flames.forEach(flame => {
      const rx = flame.x * tileW;
      const ry = flame.y * tileH;
      this.drawFlame(ctx, rx, ry, tileW, tileH, flame);
    });

    // 6. Draw Players (Sorted by Y for correct isometric depth)
    const sortedPlayers = Array.from(this.players.values()).sort((a, b) => a.y - b.y);
    sortedPlayers.forEach(player => {
      this.drawPlayer(ctx, player, tileW, tileH);
    });

    // 7. Draw Particles
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * tileW, p.y * tileH, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });

    // 8. Draw Floating Texts
    this.floatingTexts.forEach(ft => {
      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 15px "Fredoka", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x * tileW, ft.y * tileH);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x * tileW, ft.y * tileH);
      ctx.restore();
    });
  }

  private drawSolidWall(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    gx: number,
    gy: number
  ) {
    const isPerimeter = gx === 0 || gx === GRID_COLS - 1 || gy === 0 || gy === GRID_ROWS - 1;

    // Base stone color
    ctx.fillStyle = isPerimeter ? '#64748b' : '#94a3b8';
    ctx.fillRect(x, y, w, h);

    // Bevel highlights
    ctx.fillStyle = '#cbd5e1'; // Top highlight
    ctx.fillRect(x, y, w, h * 0.15);
    ctx.fillRect(x, y, w * 0.15, h);

    // Bevel shadow
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, y + h * 0.85, w, h * 0.15);
    ctx.fillRect(x + w * 0.85, y, w * 0.15, h);

    // Center inner stone block
    ctx.fillStyle = isPerimeter ? '#475569' : '#64748b';
    ctx.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);

    // Rivet dots
    ctx.fillStyle = '#334155';
    const dotR = Math.max(1.5, w * 0.05);
    ctx.beginPath();
    ctx.arc(x + w * 0.25, y + h * 0.25, dotR, 0, Math.PI * 2);
    ctx.arc(x + w * 0.75, y + h * 0.25, dotR, 0, Math.PI * 2);
    ctx.arc(x + w * 0.25, y + h * 0.75, dotR, 0, Math.PI * 2);
    ctx.arc(x + w * 0.75, y + h * 0.75, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    // Destructible brick / wood crate
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

    // Brick pattern
    ctx.fillStyle = '#d97706';
    ctx.fillRect(x + 4, y + 4, w - 8, (h - 8) * 0.45);
    ctx.fillRect(x + 4, y + h * 0.5, w - 8, (h - 8) * 0.45);

    // Diagonal crate brace
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + w - 4, y + h - 4);
    ctx.stroke();

    // Mystery box sparkle question mark icon
    ctx.fillStyle = '#fef08a';
    ctx.font = `bold ${Math.floor(w * 0.4)}px "Fredoka", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w * 0.5, y + h * 0.5);
  }

  private drawEduTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    symbol: string
  ) {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.85, w * 0.35, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Floating glowing coin / card
    const cardMargin = 4;
    const cardW = w - cardMargin * 2;
    const cardH = h - cardMargin * 2;
    const cardX = x + cardMargin;
    const cardY = y + cardMargin;

    // Glowing border
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Card border
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner header bar
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.roundRect(cardX + 2, cardY + 2, cardW - 4, cardH * 0.3, [6, 6, 0, 0]);
    ctx.fill();

    // Symbol text (Letter or Calculation Result)
    ctx.fillStyle = '#0f172a';
    const fontSize = symbol.length > 2 ? Math.floor(w * 0.32) : Math.floor(w * 0.45);
    ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, cardX + cardW * 0.5, cardY + cardH * 0.55);

    ctx.restore();
  }

  private drawBonusItem(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    type: BonusType
  ) {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.85, w * 0.35, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    const pad = 2;
    const bw = w - pad * 2;
    const bh = h - pad * 2;
    const bx = x + pad;
    const by = y + pad;

    let borderCol = '#f59e0b';
    let bgCol = '#fef3c7';
    let icon = '⭐';
    let label = 'BONUS';

    if (type === 'points_5') {
      borderCol = '#eab308';
      bgCol = '#fef08a';
      icon = '⭐';
      label = '+5 pt';
    } else if (type === 'points_10') {
      borderCol = '#0284c7';
      bgCol = '#e0f2fe';
      icon = '🌟';
      label = '+10 pt';
    } else if (type === 'points_15') {
      borderCol = '#9333ea';
      bgCol = '#f3e8ff';
      icon = '👑';
      label = '+15 pt';
    } else if (type === 'speed_wings') {
      borderCol = '#06b6d4';
      bgCol = '#cffafe';
      icon = '🪽';
      label = 'ALI';
    } else if (type === 'extra_bombs_1') {
      borderCol = '#ea580c';
      bgCol = '#ffedd5';
      icon = '💣';
      label = '+1';
    } else if (type === 'extra_bombs_2') {
      borderCol = '#c2410c';
      bgCol = '#fed7aa';
      icon = '💣';
      label = '+2';
    } else if (type === 'fire_power') {
      borderCol = '#dc2626';
      bgCol = '#fee2e2';
      icon = '🔥';
      label = 'FUOCO';
    }

    ctx.fillStyle = bgCol;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    // Emoji icon in center
    ctx.font = `${Math.floor(bw * 0.42)}px "Fredoka", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, bx + bw * 0.5, by + bh * 0.42);

    // Label on bottom
    ctx.font = `bold ${Math.floor(bw * 0.26)}px "Fredoka", sans-serif`;
    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, bx + bw * 0.5, by + bh * 0.82);

    ctx.restore();
  }

  private drawBomb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    bomb: Bomb
  ) {
    ctx.save();
    const cx = x + w * 0.5;
    const cy = y + h * 0.55;
    const radius = w * 0.35;

    // Ticking pulse effect
    const pulse = 1 + Math.sin((bomb.maxTimer - bomb.timer) * 0.3) * 0.08;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.88, radius * 1.1, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bomb body (black glossy sphere)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // 3D reflection highlight
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.35, cy - radius * 0.35, radius * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Metallic cap on top
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx - w * 0.1, cy - radius * pulse - h * 0.08, w * 0.2, h * 0.1);

    // Fuse string
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius * pulse - h * 0.05);
    ctx.quadraticCurveTo(cx + w * 0.15, cy - radius * pulse - h * 0.2, cx + w * 0.2, cy - radius * pulse - h * 0.25);
    ctx.stroke();

    // Spark at fuse tip
    const sparkX = cx + w * 0.2;
    const sparkY = cy - radius * pulse - h * 0.25;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 4 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 2 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawFlame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    flame: FlameTile
  ) {
    ctx.save();
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const progress = flame.life / 30; // 1 to 0

    // Outer fire explosion
    ctx.fillStyle = '#dc2626'; // Deep red
    ctx.beginPath();
    ctx.arc(cx, cy, (w * 0.5) * (0.8 + 0.2 * progress), 0, Math.PI * 2);
    ctx.fill();

    // Mid orange flame
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(cx, cy, (w * 0.38) * progress, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright yellow/white core
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(cx, cy, (w * 0.22) * progress, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: EnginePlayer,
    tileW: number,
    tileH: number
  ) {
    ctx.save();
    const px = player.x * tileW;
    const py = player.y * tileH;
    const char = CHARACTER_OPTIONS[player.colorIdx] || CHARACTER_OPTIONS[0];

    const isStunned = Date.now() < player.stunnedUntil;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + tileH * 0.35, tileW * 0.3, tileH * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Check if player is Ghost
    if (player.isGhost) {
      ctx.globalAlpha = 0.55;
      // Float bob
      const ghostBob = Math.sin(Date.now() * 0.008) * 5;
      this.drawGhostSprite(ctx, px, py + ghostBob, tileW, tileH);
      ctx.globalAlpha = 1.0;
    } else {
      // Draw Bomberman character with player's color
      this.drawBombermanCharacter(ctx, px, py, tileW, tileH, char, player, isStunned);
    }

    // Name tag & current target badge above head
    if (player.isAdversary) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(px - 26, py - tileH * 0.76, 52, 14, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px "Fredoka", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ NEMICO', px, py - tileH * 0.76 + 10);
    }

    ctx.font = 'bold 11px "Fredoka", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(player.name, px, py - tileH * 0.52);

    // Target letter / question hint pill (only for human players)
    if (!player.isGhost && player.targetSymbol && !player.isAdversary) {
      const badgeW = 28;
      const badgeH = 18;
      const badgeX = px - badgeW / 2;
      const badgeY = py - tileH * 0.5 - badgeH;

      ctx.fillStyle = char.hex;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px "Fredoka", sans-serif';
      ctx.fillText(player.targetSymbol, px, badgeY + 12);
    }

    // Stun indicator
    if (isStunned) {
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 14px "Fredoka", sans-serif';
      ctx.fillText('💫 SLOW!', px, py - tileH * 0.75);
    }

    ctx.restore();
  }

  private drawBombermanCharacter(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileW: number,
    tileH: number,
    char: typeof CHARACTER_OPTIONS[0],
    player: EnginePlayer,
    isStunned: boolean
  ) {
    const size = tileW * 0.9;
    const halfS = size / 2;

    ctx.save();
    ctx.translate(px, py);

    // If walk animation
    const legOffset = Math.sin(player.frame * Math.PI) * 4;

    // Feet / Shoes (Magenta/Pink in classic Bomberman, matching character accent)
    ctx.fillStyle = char.accentHex;
    // Left foot
    ctx.beginPath();
    ctx.ellipse(-halfS * 0.35, halfS * 0.45 + legOffset, halfS * 0.22, halfS * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right foot
    ctx.beginPath();
    ctx.ellipse(halfS * 0.35, halfS * 0.45 - legOffset, halfS * 0.22, halfS * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body suit (Player's custom color)
    ctx.fillStyle = char.hex;
    ctx.beginPath();
    ctx.roundRect(-halfS * 0.35, -halfS * 0.1, halfS * 0.7, halfS * 0.55, 6);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Belt & Gold Buckle
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-halfS * 0.33, halfS * 0.22, halfS * 0.66, halfS * 0.1);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-halfS * 0.12, halfS * 0.2, halfS * 0.24, halfS * 0.14);

    // Hands / Gloves (colored balls)
    ctx.fillStyle = char.accentHex;
    ctx.beginPath();
    ctx.arc(-halfS * 0.45, halfS * 0.15 - legOffset * 0.5, halfS * 0.14, 0, Math.PI * 2);
    ctx.arc(halfS * 0.45, halfS * 0.15 + legOffset * 0.5, halfS * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // Head / White Helmet
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -halfS * 0.28, halfS * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Pink / Player antenna ball on head
    ctx.fillStyle = char.hex;
    ctx.beginPath();
    ctx.arc(0, -halfS * 0.72, halfS * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Visor / Face
    ctx.fillStyle = '#fed7aa'; // Peach face tone
    ctx.beginPath();
    ctx.roundRect(-halfS * 0.28, -halfS * 0.45, halfS * 0.56, halfS * 0.32, 6);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = isStunned ? '#dc2626' : '#0f172a';
    if (player.direction === 'left') {
      ctx.fillRect(-halfS * 0.22, -halfS * 0.4, 3, 7);
      ctx.fillRect(-halfS * 0.08, -halfS * 0.4, 3, 7);
    } else if (player.direction === 'right') {
      ctx.fillRect(halfS * 0.05, -halfS * 0.4, 3, 7);
      ctx.fillRect(halfS * 0.18, -halfS * 0.4, 3, 7);
    } else {
      ctx.fillRect(-halfS * 0.14, -halfS * 0.4, 3.5, 7);
      ctx.fillRect(halfS * 0.06, -halfS * 0.4, 3.5, 7);
    }

    ctx.restore();
  }

  private drawGhostSprite(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    tileW: number,
    tileH: number
  ) {
    const size = tileW * 0.85;
    const halfS = size / 2;

    ctx.save();
    ctx.translate(px, py);

    // White translucent ghost body
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, -halfS * 0.3, halfS * 0.42, Math.PI, 0, false);
    ctx.lineTo(halfS * 0.42, halfS * 0.35);
    // wavy skirt
    ctx.quadraticCurveTo(halfS * 0.2, halfS * 0.15, 0, halfS * 0.35);
    ctx.quadraticCurveTo(-halfS * 0.2, halfS * 0.15, -halfS * 0.42, halfS * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spooky cute eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-halfS * 0.16, -halfS * 0.3, 3.5, 0, Math.PI * 2);
    ctx.arc(halfS * 0.16, -halfS * 0.3, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Little mouth
    ctx.beginPath();
    ctx.arc(0, -halfS * 0.15, 3, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }
}
