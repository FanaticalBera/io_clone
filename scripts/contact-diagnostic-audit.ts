import {runContactMovement} from '../tests/contact-movement-fixture.js';
import {MovementCaptureFixture} from '../tests/movement-capture-fixture.js';
import {watchDeaths,type DeathTrace} from '../src/shared/life.js';
const reports=[];for(const scenario of ['simultaneous-neutral','existing-line','enemy-territory','near-miss'] as const)for(const reverse of [false,true]){const f=runContactMovement(scenario,reverse);reports.push({scenario,reverse,seed:f.m.seed,goal:f.goal,nearestBodyDistance:f.nearest,deaths:f.deaths,journal:f.journal});}
const territoryLoss=[];for(const reverse of [false,true]){const f=new MovementCaptureFixture(reverse),deaths:DeathTrace[]=[];watchDeaths(f.match,t=>deaths.push(t));f.runInsideTerritoryLoss();territoryLoss.push({reverse,captureTick:f.captureTick,directContacts:f.directContacts,deaths,journal:f.journal});}
console.log(JSON.stringify({contacts:reports,territoryLoss},null,2));
