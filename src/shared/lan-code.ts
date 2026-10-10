// LAN friend-room code: 7 data chars carry the host's private IPv4 (32 bits) and a port slot (3 bits),
// the 8th char is a Luhn mod 32 check char, so every single-character typo is rejected without a network round trip.
// Values are 35 bits wide, so all bit work uses BigInt (JS number bitwise operators truncate to 32 bits).
export const LAN_CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LAN_BASE_PORT=47610;export const LAN_PORT_SLOTS=8;
const DATA_CHARS=7,BASE=32n,DATA_BITS=35n,DATA_MASK=(1n<<DATA_BITS)-1n;
// Scrambles nearby addresses into unrelated-looking codes: multiply by an odd constant (a bijection mod 2^35)
// so low address bits spread into every char, then XOR. Not a secret.
const MIX=0x5DEECE66Dn&DATA_MASK|1n,SCRAMBLE=0x36D2B59E3n;
const MIX_INVERSE=(()=>{let x=1n;for(let i=0;i<6;i++)x=(x*(2n-MIX*x))&DATA_MASK;return x;})();
export type LanCodeError='FORMAT'|'CHECK'|'NOT_PRIVATE';
export type DecodedLanCode={ok:true;address:string;slot:number;port:number}|{ok:false;reason:LanCodeError};

export function parseIPv4(address:string):number[]|null {
 const parts=address.split('.');if(parts.length!==4)return null;
 const octets=parts.map(p=>/^(0|[1-9]\d{0,2})$/.test(p)?Number(p):NaN);return octets.every(o=>o>=0&&o<=255)?octets:null;
}
export function isPrivateIPv4(octets:readonly number[]):boolean {
 const [a,b]=octets;return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;
}
function checkChar(values:readonly number[]):number {
 let sum=0,factor=2;
 for(let i=values.length-1;i>=0;i--){const addend=factor*values[i]!;sum+=Math.floor(addend/32)+addend%32;factor=factor===2?1:2;}
 return (32-sum%32)%32;
}
export function normalizeLanCode(raw:string):string {return raw.replace(/[\s-]/g,'').toUpperCase();}

export function encodeLanCode(address:string,slot:number):string {
 const octets=parseIPv4(address);if(!octets||!isPrivateIPv4(octets))throw new Error('LAN code needs a private IPv4 address');
 if(!Number.isInteger(slot)||slot<0||slot>=LAN_PORT_SLOTS)throw new Error('Invalid LAN port slot');
 let data=octets.reduce((n,o)=>(n<<8n)|BigInt(o),0n);data=(((data<<3n)|BigInt(slot))*MIX&DATA_MASK)^SCRAMBLE;
 const values:number[]=[];for(let i=0;i<DATA_CHARS;i++){values.unshift(Number(data%BASE));data/=BASE;}
 values.push(checkChar(values));return values.map(v=>LAN_CODE_ALPHABET[v]).join('');
}

export function decodeLanCode(raw:string):DecodedLanCode {
 const code=normalizeLanCode(raw);if(code.length!==DATA_CHARS+1)return{ok:false,reason:'FORMAT'};
 const values=[...code].map(c=>LAN_CODE_ALPHABET.indexOf(c));if(values.some(v=>v<0))return{ok:false,reason:'FORMAT'};
 if(checkChar(values.slice(0,DATA_CHARS))!==values[DATA_CHARS])return{ok:false,reason:'CHECK'};
 let data=0n;for(const v of values.slice(0,DATA_CHARS))data=data*BASE+BigInt(v);data=((data^SCRAMBLE)&DATA_MASK)*MIX_INVERSE&DATA_MASK;
 const slot=Number(data&7n),ip=data>>3n,octets=[24n,16n,8n,0n].map(s=>Number((ip>>s)&255n));
 // A typo that slips past the check char almost never lands in RFC 1918 space, so this is a second free filter.
 if(!isPrivateIPv4(octets))return{ok:false,reason:'NOT_PRIVATE'};
 return{ok:true,address:octets.join('.'),slot,port:LAN_BASE_PORT+slot};
}
