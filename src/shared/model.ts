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
export type LifeState = 'ALIVE' | 'DEAD_WAIT' | 'SPAWN_BLOCKED' | 'ELIMINATED' | 'FINISHED';
export type DeathCause='EXISTING_TRAIL_CONTACT'|'PENDING_TRAIL_CONTACT'|'TRAIL_CAPTURE'|'HOME_CAPTURE'|'TERRITORY_LOST'|'WALL_HIT';
export interface DeathContext {cause:DeathCause|'TRAIL_CONTACT';cellId:number;eventTick?:number}
export interface ParticipantSpec { participantId: string; slot: number; nickname: string; kind: 'HUMAN' | 'BOT'; personality?: Personality }
export type RunEndReason='DEATH'|'FULL_CAPTURE_WIN'|'FULL_CAPTURE_LOSS';
export interface RunResult {runId:string;matchId:string;participantId:string;lifeId:number;endReason:RunEndReason;startedAtTick:number;endedAtTick:number;durationTicks:number;simulationHz:number;mapCellCount:number;kills:number;bestTerritoryCells:number;bestTerritoryPercent:number}
export interface HumanRun {runId:string;lifeId:number;startedAtTick:number;initialKills:number;bestTerritoryCells:number;pendingDeathAtTick:number|null;result:Readonly<RunResult>|null}
export interface Participant extends ParticipantSpec {
 // direction is actual heading; null target means keep heading until input.
 position: Vec; cellId: number; direction: Vec; targetDirection: Vec|null; lifeId: number; lifeState: LifeState;
 trailCells: Set<number>;trailOriginCellId:number|null; spawnCells: Set<number>; territoryCount: number; controlScore: number;
 run:HumanRun|null; kills: number; deaths: number; respawnAtTick: number; protectedUntilTick: number;
 deathReason: string | null; deathContext?:DeathContext; lastAppliedInputSeq: number;
}
export interface DirectionInput { matchId: string; lifeId: number; seq: number; dx: number; dy: number }
export interface GameEvent { eventId: string; tick: number; type: 'CAPTURE'|'DEATH'|'SPAWN'|'POINT'|'FINISH'; participantId: string; amount?: number; reason?: string; killerId?:string; position?:Vec; lifeId?:number;deathContext?:DeathContext }
export interface ResultRow {
 participantId: string; nickname: string; kind: 'HUMAN'|'BOT'; score: number; territory: number;
 controlScore: number; kills: number; deaths: number; rank: number | null; status: 'FINISHED'|'LEFT';
}
export interface MatchOutcome {winnerId:string;reason:'FULL_CAPTURE';atTick:number}
export interface MatchState {
 matchId: string; seed: number; tick: number; config: GameConfig; map: MapDefinition;
 participants: Participant[]; owners: Uint8Array; trailMasks: Uint16Array;
 priority: number[]; spawnOrder: number[]; phase: 'RUNNING'|'FINISHED'|'ABORTED';
 events: GameEvent[]; eventCounter: number; results: ResultRow[] | null; departed: ResultRow[];
 gameMode:GameModeConfig;modeState:ModeState;outcome:MatchOutcome|null;
}
export interface PublicParticipant extends Omit<Participant,'trailCells'|'trailOriginCellId'|'spawnCells'> { protected: boolean }
export interface MatchView {
 matchId: string; seed: number; tick: number; remainingTicks: number|null; phase: MatchState['phase'];
 config: GameConfig; mapId: string; owners: Uint8Array; trailMasks: Uint16Array;
 participants: PublicParticipant[]; events: GameEvent[]; results: ResultRow[] | null;
 gameMode:GameModeConfig;modeState:ModeState;outcome:MatchOutcome|null;
}
