import {createMatch as createCurrentMatch} from '../src/shared/game.js';
import {setHomeReturnMargin} from '../src/shared/home-return-margin.js';
// Historical regressions keep their R22/8/19-cell fixture and 4.2/9 movement.
// Production's +5% pace is exercised independently in game-speed tests.
// Preserve centre-only returns in historical fixtures. Current defaults are
// covered separately by home-return-margin, practice and LAN host tests.
export const createMatch:typeof createCurrentMatch=(overrides,...args)=>{
 const match=createCurrentMatch({mapRadius:22,maxSlots:8,spawnRadius:2,moveCellsPerSecond:4.2,turnRadiansPerSecond:9,...overrides},...args);
 setHomeReturnMargin(match,0);return match;
};
