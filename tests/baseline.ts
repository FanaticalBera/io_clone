import {createMatch as createCurrentMatch} from '../src/shared/game.js';
// These regressions exercise the pre-existing R22/8/19-cell fixture explicitly.
export const createMatch:typeof createCurrentMatch=(overrides,...args)=>createCurrentMatch({mapRadius:22,maxSlots:8,spawnRadius:2,...overrides},...args);
