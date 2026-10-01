import type { GameConfig } from './config.js';
import type {GameModeConfig,ModeState} from './modes.js';
export interface Vec { x: number; y: number }
export interface Axial { q: number; r: number }
export interface Cell extends Axial { id: number; center: Vec; neighbors: number[]; vertices: Vec[] }
export interface MapDefinition {
 mapId: string; radius: number; side: number; cells: Cell[]; byKey: Map<string, number>;
 controlPoints: { pointId: number; cellId: number }[]; anchors: number[];
 boundaryEdges: { a: Vec; b: Vec }[];
}
export type Personality = 'EXPAND' | 'ATTACK' | 'DEFEND' | 'SEEK_POINT';
export type LifeState = 'ALIVE' | 'DEAD_WAIT' | 'SPAWN_BLOCKED' | 'FINISHED';
export interface ParticipantSpec { participantId: string; slot: number; nickname: string; kind: 'HUMAN' | 'BOT'; personality?: Personality }
export interface Participant extends ParticipantSpec {
 // direction is actual heading; null target means keep heading until input.
 position: Vec; cellId: number; direction: Vec; targetDirection: Vec|null; lifeId: number; lifeState: LifeState;
 trailCells: Set<number>; spawnCells: Set<number>; territoryCount: number; controlScore: number;
 kills: number; deaths: number; respawnAtTick: number; protectedUntilTick: number;
 deathReason: string | null; lastAppliedInputSeq: number;
}
export interface DirectionInput { matchId: string; lifeId: number; seq: number; dx: number; dy: number }
export interface GameEvent { eventId: string; tick: number; type: 'CAPTURE'|'DEATH'|'SPAWN'|'POINT'|'FINISH'; participantId: string; amount?: number; reason?: string; killerId?:string; position?:Vec; lifeId?:number }
export interface ResultRow {
 participantId: string; nickname: string; kind: 'HUMAN'|'BOT'; score: number; territory: number;
 controlScore: number; kills: number; deaths: number; rank: number | null; status: 'FINISHED'|'LEFT';
}
export interface MatchOutcome {winnerId:string;reason:'FULL_CAPTURE'|'HELD_TERRITORY';atTick:number}
export interface MatchState {
 matchId: string; seed: number; tick: number; config: GameConfig; map: MapDefinition;
 participants: Participant[]; owners: Uint8Array; trailMasks: Uint8Array;
 priority: number[]; spawnOrder: number[]; phase: 'RUNNING'|'FINISHED'|'ABORTED';
 events: GameEvent[]; eventCounter: number; results: ResultRow[] | null; departed: ResultRow[];
 gameMode:GameModeConfig;modeState:ModeState;outcome:MatchOutcome|null;
}
export interface PublicParticipant extends Omit<Participant,'trailCells'|'spawnCells'> { protected: boolean }
export interface MatchView {
 matchId: string; seed: number; tick: number; remainingTicks: number|null; phase: MatchState['phase'];
 config: GameConfig; mapId: string; owners: Uint8Array; trailMasks: Uint8Array;
 participants: PublicParticipant[]; events: GameEvent[]; results: ResultRow[] | null;
 gameMode:GameModeConfig;modeState:ModeState;outcome:MatchOutcome|null;
}
