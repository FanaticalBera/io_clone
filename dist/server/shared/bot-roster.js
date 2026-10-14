import { seededRandom, shuffled } from './random.js';
import { BOT_PERSONALITIES } from './bot-identity.js';
// Original 48 names stay in their reviewed order; names use a separate RNG stream.
export const LEGACY_BOT_NICKNAMES = [
    '밤산책', '구름한조각', '느린우체통', '소금빵', '파란연필', '잠든감자', '여름귤', '모서리', '달빛수프', '초록양말', '물결', '오후세시',
    '귤껍질', '단풍우유', '작은우주', '연두콩', '바람개비', '고요한밤', '치즈토스트', '비오는창가', '새벽별', '노란장화', '나무그늘', '햇살조각',
    '민트초코', '별사탕', '달팽이집', '푸른바다', '산책중', '냥발자국', '감자전', '반달', '낮잠시간', '동그라미', '빵끝', '종이배',
    '오리발', '오늘도맑음', '파도소리', '초코라떼', '눈꽃', '골목길', '참새', '봄바람', '따뜻한차', '몽실', '돌멩이', '호두과자'
];
// Reviewed 288-name pool: docs/bot-nickname-pool-review.txt (1-based Japanese range229–248).
export const BOT_NICKNAMES = [...LEGACY_BOT_NICKNAMES,
    "도망가는쌀", "냉장고유령", "두부멘탈임", "내땅인데요", "벽이왜여기", "방금못봤어",
    "선은밟지마", "한번만봐줘", "이판내거야", "또속았네", "아직살았다", "집에가고픔",
    "거기비켜봐", "선넘었네", "라면불었다", "커피쏟았음", "월급은어디", "주말이짧다",
    "침대가부름", "퇴근까지3분", "반쯤천재", "헛발질명인", "수건도둑", "맨발출근",
    "숨겨둔간식", "목표는생존", "꾸벅졸았네", "후다닥귀가", "허겁지겁", "와장창대참사",
    "흑염룡", "고인물", "뉴비입니다", "갓생살기", "킹갓제너럴", "어쩔티비",
    "알빠노", "중2병말기", "오히려좋아", "가보자고", "킹받네", "폼미쳤다",
    "실화냐", "레게노", "이게맞나", "대충살자", "응애나애기", "무지성돌진",
    "손이먼저나감", "국밥한그릇", "존버는승리", "오늘만산다", "인생2회차", "도른자",
    "엄마몰래", "땅부자될래", "영토확장중", "한입만줘", "줄긋는중", "동그랗게돌기",
    "직진본능", "우회전금지", "유턴장인", "내가1등함", "꼴찌탈출", "이번엔진짜",
    "뒤통수조심", "몰래먹기", "영역표시", "집이최고야", "민수2008", "김철수",
    "지훈이다", "박대리", "이과장", "서준아빠", "하윤이누나", "최고다윤",
    "영희99", "도윤짱", "수빈이", "현우123", "은지맘", "막내작가",
    "김씨아저씨", "옆집형", "반장님", "2반회장", "동네형", "할매손맛",
    "치킨은반반", "떡볶이장인", "붕어빵꼬리", "마라탕중독", "삼겹살데이", "고양이집사",
    "댕댕이산책", "햄찌볼", "쿼카웃음", "펭귄걸음", "오리궁뎅이", "꿀떡꿀떡",
    "만두가좋아", "콩떡이", "김치볶음밥", "ㅋㅋㅋㅋ", "ㅇㅅㅇ", "ㄱㄱㄱ",
    "ㅎㅇㅎㅇ", "ㅂㅂ2", "헐대박", "와씨", "엥?", "하...",
    "ㄹㅇㅋㅋ", "으아아악", "오잉또잉", "아니근데", "잠깐만", "헉헉",
    "xXSn1perXx", "DarkLord99", "iiTzMango", "Sw3atyHand", "L0rdOfLand", "KingHexx",
    "Not_A_Pro", "ShadowFox7", "GhostHex", "NightOwl_", "bruh", "ez",
    "asdf", "hi", "lol", "k", "noob", "yo",
    "zzz", "afk", "just vibin", "touchgrass", "gg ez", "help pls",
    "why me", "not a bot", "dont chase", "brb snack", "no u", "im lost",
    "Potato", "Steve", "Kevin", "Sandwich", "Mr Toast", "Banana Joe",
    "Grandpa", "Big Dave", "Pickle", "Uncle Bob", "x3x3x3", "h4x0r",
    "1v1 me", "2fast4u", "gr8escape", "n00bslayer", "42069", "l33t",
    "b4ck2home", "007", "Catch Me", "UR NEXT", "Too Slow", "My Map Now",
    "Run.", "Bye Trail", "Nice Line", "Mine Now", "Try Again", "Cya",
    "ねむいです", "迷子の魚", "また壁か", "お先に失礼", "まだ帰らない", "こっそり行く",
    "雨のしっぽ", "お腹すいた", "足がすべる", "まるい影", "次こそ勝つ", "砂の手紙",
    "道をください", "家はどこ", "忘れた傘", "ちょっと休憩", "羽なしの鳥", "ここ空いてる",
    "夕方の猫", "ねじれた糸", "3초후복귀", "0킬장인", "404길없음", "오늘도7등",
    "2칸만빌림", "살려줘ㅠㅠ", "마지막1칸", "HP는기분", "나가기싫다;", "한숨=3",
    "대충123", "아직ON", "★1등가자★", "♡귀요미♡", "~떠돌이~", "[KR]용사",
    "영토왕^^", "-_-;", ">_<도망", "수학0점", "씨발선밟음", "존나억울함",
    "좆같은각도", "개씨발렉", "씨바또벽", "좆망한루프", "지랄맞은핑", "씨발귀환중",
    "개빡침주의", "젠장또잘림", "닥치고점령", "뒤질뻔했다", "꼴받는각도", "엿같은핑",
    "아씨또죽네", "야한생각중", "오늘도꼴림", "19금아님", "변태각도", "발정난선",
];
export const JAPANESE_BOT_NICKNAMES = BOT_NICKNAMES.slice(228, 248);
// Keep off until Japanese rendering is checked on real devices. Shared by practice/LAN/server.
export const BOT_NICKNAME_FLAGS = Object.freeze({ japanese: false });
const japaneseNames = new Set(JAPANESE_BOT_NICKNAMES);
const defaultNonJapanesePool = BOT_NICKNAMES.filter(name => !japaneseNames.has(name));
const nicknameKey = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function assignBotSpecs(count, startSlot = 0, prefix = 'bot', options = {}) {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(startSlot) || startSlot < 0)
        throw new Error('Invalid bot roster size');
    const seed = options.seed ?? 0, random = seededRandom(seed ^ 0x21b4a3), nameRandom = seededRandom(seed ^ 0x61c87d), existing = options.existing ?? [];
    const counts = new Map(BOT_PERSONALITIES.map(p => [p, existing.filter(e => e.kind === 'BOT' && e.personality === p).length]));
    const usedSlots = new Set(existing.map(p => p.slot)), usedIds = new Set(existing.map(p => p.participantId)), usedNames = new Set(existing.map(p => nicknameKey(p.nickname)));
    const personalities = [];
    for (let i = 0; i < count; i++) {
        const specified = options.overrides?.[startSlot + i]?.personality;
        if (specified !== undefined && !BOT_PERSONALITIES.includes(specified))
            throw new Error('Invalid bot personality override');
        const minimum = Math.min(...counts.values()), choices = BOT_PERSONALITIES.filter(p => counts.get(p) === minimum);
        const selected = specified ?? choices[Math.floor(random() * choices.length)];
        counts.set(selected, counts.get(selected) + 1);
        personalities.push(selected);
    }
    // Overrides are tied to actual slots, so shuffle only unconstrained assignments.
    const free = shuffled(personalities.filter((_, i) => !options.overrides?.[startSlot + i]?.personality), random);
    let freeIndex = 0;
    const defaultPool = (options.japaneseNicknames ?? BOT_NICKNAME_FLAGS.japanese) ? BOT_NICKNAMES : defaultNonJapanesePool;
    const pool = shuffled([...new Set(options.nicknamePool ?? defaultPool)], nameRandom);
    let suffix = 1;
    return personalities.map((assigned, i) => {
        const slot = startSlot + i, participantId = prefix + '-' + i, override = options.overrides?.[slot];
        if (usedSlots.has(slot) || usedIds.has(participantId))
            throw new Error('Duplicate bot identity or slot');
        const personality = override?.personality ?? free[freeIndex++] ?? assigned;
        let nickname = override?.nickname ?? pool.find(n => n.trim() && !usedNames.has(nicknameKey(n)));
        if (override?.nickname !== undefined && (!nickname?.trim() || usedNames.has(nicknameKey(nickname))))
            throw new Error('Duplicate or empty bot nickname override');
        while (!nickname) {
            const candidate = '산책' + suffix++;
            if (!usedNames.has(nicknameKey(candidate)))
                nickname = candidate;
        }
        usedNames.add(nicknameKey(nickname));
        usedSlots.add(slot);
        usedIds.add(participantId);
        return { participantId, slot, nickname, kind: 'BOT', personality };
    });
}
