import {createMatch as createCurrentMatch} from '../src/shared/game.js';
// Historical regressions keep their R22/8/19-cell fixture and 4.2/9 movement.
// Production's +5% pace is exercised independently in game-speed tests.
export const createMatch:typeof createCurrentMatch=(overrides,...args)=>createCurrentMatch({mapRadius:22,maxSlots:8,spawnRadius:2,moveCellsPerSecond:4.2,turnRadiansPerSecond:9,...overrides},...args);
