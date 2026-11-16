'use strict';

const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  pingInterval: 20000,
  pingTimeout: 45000,
  maxHttpBufferSize: 1e6,
});

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 6;
const DEFAULT_ROUNDS = 24;
const BOARD_SIZE = 16;
const MOVE_STEP_MS = 520;
const MARKET_PHASE_MS = 25000;
const TURN_GRACE_MS = 45000;
const AUCTION_MS = 20000;
const ROOM_IDLE_MS = 15 * 60 * 1000;

// A kid-friendly, spooky remix of Crypto Boss. Card texts and effects are original.
const BOARD = [
  { name: 'Портал старта', short: 'СТАРТ', icon: '🌀', type: 'start', color: 'start', desc: 'За каждый полный круг получаешь зарплату и доход майнеров.' },
  { name: 'Биржа призраков', short: 'БИРЖА', icon: '📈', type: 'exchange', color: 'exchange', desc: 'Купи или продай игровые монеты по текущему курсу.' },
  { name: 'Лотерея ведьмочки', short: 'ЛОТЕРЕЯ', icon: '🧙‍♀️', type: 'lottery', color: 'lottery', desc: 'Открой карту из колоды Лотереи.' },
  { name: 'Кризисный коридор', short: 'КРИЗИС', icon: '🕯️', type: 'crisis', color: 'crisis', desc: 'Неожиданная ситуация. Иногда неприятная, но не безнадёжная.' },
  { name: 'Майнинг-пещера', short: 'МАЙНИНГ', icon: '⛏️', type: 'mine', color: 'mine', desc: 'Купи майнер и получай доход при каждом проходе старта.' },
  { name: 'Биржа призраков', short: 'БИРЖА', icon: '📈', type: 'exchange', color: 'exchange', desc: 'Купи или продай игровые монеты по текущему курсу.' },
  { name: 'Разворот рынка', short: 'РЫНОК', icon: '🌪️', type: 'market', color: 'market', desc: 'Рынок меняется по новой карте. Все игроки увидят новые курсы.' },
  { name: 'Аукционный чердак', short: 'АУКЦИОН', icon: '🔔', type: 'auction', color: 'auction', desc: 'Все игроки могут сделать тайную ставку за редкий майнер.' },
  { name: 'Биржа призраков', short: 'БИРЖА', icon: '📈', type: 'exchange', color: 'exchange', desc: 'Купи или продай игровые монеты по текущему курсу.' },
  { name: 'Лотерея ведьмочки', short: 'ЛОТЕРЕЯ', icon: '🧙‍♀️', type: 'lottery', color: 'lottery', desc: 'Открой карту из колоды Лотереи.' },
  { name: 'Кризисный коридор', short: 'КРИЗИС', icon: '🕯️', type: 'crisis', color: 'crisis', desc: 'Неожиданная ситуация. Иногда неприятная, но не безнадёжная.' },
  { name: 'Банк привидений', short: 'БАНК', icon: '🏦', type: 'bank', color: 'bank', desc: 'Возьми кредит или полностью верни старый.' },
  { name: 'Разворот рынка', short: 'РЫНОК', icon: '🌪️', type: 'market', color: 'market', desc: 'Рынок меняется по новой карте. Все игроки увидят новые курсы.' },
  { name: 'Майнинг-пещера', short: 'МАЙНИНГ', icon: '⛏️', type: 'mine', color: 'mine', desc: 'Купи майнер и получай доход при каждом проходе старта.' },
  { name: 'Подработка у скелета', short: 'РАБОТА', icon: '🦴', type: 'job', color: 'job', desc: 'Помоги скелету разобрать серверную и заработай.' },
  { name: 'Кекс удачи', short: 'БОНУС', icon: '🧁', type: 'bonus', color: 'bonus', desc: 'Небольшой приятный бонус перед новым кругом.' },
];

const COINS = [
  { id: 'BTC', name: 'Биткоин', icon: '₿', base: 30000, tint: '#f7a52b' },
  { id: 'ETH', name: 'Эфир', icon: '💎', base: 18000, tint: '#8091ff' },
  { id: 'DOGE', name: 'Догик', icon: '🐶', base: 7000, tint: '#d8b956' },
  { id: 'PEPE', name: 'Пепе', icon: '🐸', base: 2500, tint: '#71c987' },
];
const COLORS = ['#ff9a70', '#71b8ff', '#c19aff', '#77d3a0', '#ffd16e', '#ff8fbd'];

const GOALS = [
  { id: 'hodler', title: 'ХОМЯК-ХОДЛЕР', icon: '🐹', description: 'Заверши игру минимум с 3 BTC.', reward: 25000 },
  { id: 'miner', title: 'ПОВЕЛИТЕЛЬ МАЙНЕРОВ', icon: '⛏️', description: 'К концу игры собери минимум 2 майнера.', reward: 25000 },
  { id: 'trader', title: 'КОРОЛЬ СДЕЛОК', icon: '📈', description: 'Соверши хотя бы 3 успешные сделки на бирже.', reward: 25000 },
  { id: 'cash', title: 'ЗОЛОТОЙ КОШЕЛЁК', icon: '💰', description: 'Заверши игру с наличными не меньше 130 000 сом.', reward: 25000 },
  { id: 'doge', title: 'ДОГЕ-ДРУГ', icon: '🐶', description: 'Собери к финалу минимум 7 DOGE.', reward: 25000 },
  { id: 'debtfree', title: 'БЕЗ ДОЛГОВ', icon: '🧾', description: 'Заверши игру без долга и хотя бы с 1 майнером.', reward: 25000 },
];

const LOTTERY_CARDS = [
  ['Хомяк вернул сдачу', 'В кармане старого плаща нашлись монетки.', { cash: 18000 }],
  ['Мем недели', 'Твой смешной мем стал вирусным. Донаты летят!', { cash: 24000 }],
  ['Счастливая находка', 'Ведьмочка нашла звезду удачи под ковриком. Она твоя!', { luck: 1 }],
  ['Подарок ведьмочки', 'Ведьмочка поделилась запасом DOGE.', { coin: 'DOGE', qty: 3 }],
  ['Кристалл с чердака', 'Внутри сияет маленький ETH.', { coin: 'ETH', qty: 2 }],
  ['Счастливый блок', 'Ты нашёл забытый блок с наградой.', { cash: 12000 }],
  ['Биткоин-печенька', 'В печеньке оказался очень вкусный BTC.', { coin: 'BTC', qty: 1 }],
  ['Пепе-парад', 'Лягушачья команда устроила тебе подарок.', { coin: 'PEPE', qty: 8 }],
  ['Вечеринка в серверной', 'Монстрики собрали деньги на пиццу и оставили сдачу.', { cash: 15000 }],
  ['Секретный донат', 'Анонимный призрак прислал игровые сомы.', { cash: 30000 }],
  ['Удачная сделка', 'Ты вовремя заметил выгодный курс.', { cash: 10000 }],
  ['Сундук удачи', 'В сундуке лежали сразу две редкие монеты.', { coin: 'ETH', qty: 1, cash: 8000 }],
].map(([title, text, effect]) => ({ type: 'lottery', title, text, effect }));

const CRISIS_CARDS = [
  ['Перегрелся сервер', 'Вентиляторы гудели всю ночь. Оплати ремонт.', { cash: -12000 }],
  ['Паук-подписчик', 'Паук подключил платную подписку на туман. Вот счёт.', { cash: -7000 }],
  ['Проверка электрика', 'Скелет-электрик проверил провода и выставил счёт.', { cash: -9000 }],
  ['Глючный майнер', 'Один майнер сломался. Ремонт съел часть прибыли.', { cash: -15000 }],
  ['Ночной налог', 'Призрачная мэрия собирает налог на освещение.', { cash: -10000 }],
  ['Чёрный кот-перебежчик', 'Кот пробежал через серверную и унёс одну звезду удачи.', { luck: -1 }],
  ['Фейковый розыгрыш', 'Ты кликнул на подозрительную ссылку. Хорошо, что потерял только немного.', { cash: -6000 }],
  ['Сбитый курс', 'Кошелёк завис, но техподдержка вернула часть комиссии.', { cash: 5000 }],
  ['Щедрый скелет', 'Скелет нашёл старый бонус и поделился с тобой.', { cash: 14000 }],
  ['Пыльный сейф', 'За портретом обнаружился небольшой тайник.', { cash: 11000 }],
  ['Мышь в серверной', 'Мышь перегрызла кабель. Хорошо, что запасной был рядом.', { cash: -5000 }],
  ['Премия за смелость', 'Ты не испугался подвала и получил награду.', { cash: 18000 }],
  ['Туманная комиссия', 'Комиссия за перевод оказалась чуть выше.', { cash: -8000 }],
  ['Призрачный инвестор', 'Таинственный инвестор поддержал твой проект.', { cash: 16000 }],
  ['Секретный ключ', 'Ты нашёл забытый ключ от сейфа с DOGE.', { coin: 'DOGE', qty: 2 }],
].map(([title, text, effect]) => ({ type: 'crisis', title, text, effect }));

const MARKET_CARDS = [
  ['Биткоин на луне', 'BTC подрос на новостях из космоса.', { BTC: 18, ETH: 5 }],
  ['Эфирный фестиваль', 'Разработчики устроили праздник. ETH в плюсе!', { ETH: 20, PEPE: 5 }],
  ['Мемный хайп', 'Все обсуждают мем-монеты. DOGE и PEPE растут.', { DOGE: 20, PEPE: 15, BTC: -5 }],
  ['День осторожного хомяка', 'Игроки фиксируют прибыль. Рынок немного остыл.', { BTC: -10, ETH: -8, DOGE: -5, PEPE: -5 }],
  ['Зелёная свеча', 'Хорошие новости подняли весь рынок.', { BTC: 8, ETH: 8, DOGE: 8, PEPE: 8 }],
  ['Призрачная распродажа', 'Крупный игрок распродаёт активы.', { BTC: -14, ETH: -10, DOGE: -12 }],
  ['Лягушачий сезон', 'PEPE стал звездой крипто-особняка.', { PEPE: 25, DOGE: 8 }],
  ['Тихий понедельник', 'На рынке почти ничего не происходит.', { BTC: 2, ETH: 1, DOGE: -1, PEPE: 1 }],
  ['Майнинг-бум', 'Новые фермы добывают монеты быстрее.', { BTC: 10, ETH: 12 }],
  ['Туманная паника', 'Слухи напугали инвесторов. Но рынок уже готов отскочить.', { BTC: -8, ETH: -8, DOGE: -8, PEPE: -8 }],
].map(([title, text, changes]) => ({ type: 'market', title, text, changes }));

const rooms = new Map();
const playerSessions = new Map();
const dashboardSessions = new Map();
const randomInt = (max) => crypto.randomInt(0, max);
const randomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const token = () => crypto.randomBytes(32).toString('hex');
const cleanName = (name) => String(name || 'Игрок').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Игрок';
const safeMoney = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const formatMoney = (n) => `${Math.round(n).toLocaleString('ru-RU')} сом`;
const freshCoins = () => ({ BTC: 0, ETH: 0, DOGE: 0, PEPE: 0 });
const basePrices = () => Object.fromEntries(COINS.map((coin) => [coin.id, coin.base]));
const clone = (value) => JSON.parse(JSON.stringify(value));

function safeAvatarData(value) {
  if (typeof value !== 'string' || value.length > 260000) return '';
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return '';
  return value;
}
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function makeDecks() {
  return {
    goal: shuffle(GOALS.map(clone)),
    lottery: shuffle(LOTTERY_CARDS.map(clone)),
    crisis: shuffle(CRISIS_CARDS.map(clone)),
    market: shuffle(MARKET_CARDS.map(clone)),
  };
}
function drawCard(room, deckName) {
  const source = { goal: GOALS, lottery: LOTTERY_CARDS, crisis: CRISIS_CARDS, market: MARKET_CARDS }[deckName];
  if (!source) throw new Error(`Unknown card deck: ${deckName}`);
  if (!room.decks[deckName] || room.decks[deckName].length === 0) room.decks[deckName] = shuffle(source.map(clone));
  return clone(room.decks[deckName].pop());
}

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Crypto Boss', version: '6.1.0' }));

function log(room, message, kind = 'normal') {
  room.logs.unshift({ id: crypto.randomUUID(), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), message, kind });
  if (room.logs.length > 80) room.logs.length = 80;
}
function setEvent(room, title, text, kind = 'event') {
  room.lastEvent = { title, text, kind, at: Date.now() };
  log(room, `${title} — ${text}`, kind);
}
function avatarLabel(player) {
  return player.avatarData || player.name.slice(0, 1).toUpperCase();
}
function makePlayer(socket, data) {
  const name = cleanName(data.name);
  return {
    uid: crypto.randomUUID(), token: token(), socketId: socket.id, connected: true,
    name, avatarData: safeAvatarData(data.avatarData), avatar: name.slice(0, 1).toUpperCase(),
    color: COLORS[0], cash: 100000, salary: 35000, position: 0,
    coins: freshCoins(), nodes: 0, premiumNodes: 0, networkNodes: 1, miningSlots: [], luck: 3, luckUsed: false,
    marketDealsUsed: 0, marketDealLimit: 1, debt: 0, loanRate: 10, laps: 0,
    rolled: false, moving: false, moveDone: false, actionUsed: false,
    lastRoll: 0, dice: [0, 0], trades: 0, goal: null, goalComplete: false, goalBonus: 0,
    lastCard: null,
  };
}
function findPlayer(room, uid) { return room.players.find((p) => p.uid === uid) || null; }
function netWorth(room, player) {
  const coinsValue = COINS.reduce((sum, coin) => sum + player.coins[coin.id] * room.prices[coin.id], 0);
  const networkValue = Math.max(0, (player.networkNodes - 1) * 20000);
  const farmValue = (player.miningSlots?.length || 0) * 15000;
  return Math.max(0, player.cash + coinsValue + player.nodes * 25000 + player.premiumNodes * 40000 + networkValue + farmValue - player.debt);
}
function checkGoal(player) {
  if (!player.goal) return false;
  switch (player.goal.id) {
    case 'hodler': return player.coins.BTC >= 3;
    case 'miner': return (player.miningSlots?.length || 0) >= 2 || player.nodes + player.premiumNodes >= 2;
    case 'trader': return player.trades >= 3;
    case 'cash': return player.cash >= 130000;
    case 'doge': return player.coins.DOGE >= 7;
    case 'debtfree': return player.debt === 0 && ((player.miningSlots?.length || 0) >= 1 || player.nodes + player.premiumNodes >= 1);
    default: return false;
  }
}
function publicPlayers(room) {
  return room.players.map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, avatarData: p.avatarData, color: p.color,
    connected: p.connected, position: p.position, rolled: p.rolled, moving: p.moving,
    lastRoll: p.lastRoll, dice: [...p.dice], laps: p.laps,
    cash: p.cash, debt: p.debt, nodes: p.nodes, premiumNodes: p.premiumNodes, networkNodes: p.networkNodes,
    miningSlots: p.miningSlots.map(slot => ({ ...slot })), luck: p.luck,
    netWorth: netWorth(room, p), coins: { ...p.coins },
  }));
}
function publicAuction(room, player = null) {
  if (!room.auction) return null;
  const a = room.auction;
  return {
    id: a.id, status: a.status, lot: a.lot, description: a.description,
    minBid: a.minBid, endsAt: a.endsAt, bidCount: Object.keys(a.bids || {}).length,
    myBid: player ? (a.bids[player.uid]?.amount || 0) : 0,
    myCoin: player ? (a.bids[player.uid]?.coin || 'BTC') : 'BTC',
    result: a.result ? { ...a.result } : null,
  };
}
function dashboardState(room) {
  return {
    code: room.code, status: room.status, round: room.round, maxRounds: room.maxRounds, roundTurnCount: room.roundTurnCount || 0,
    turnIndex: room.turnIndex, currentUid: room.marketPhase?.stewardUid || room.players[room.turnIndex]?.uid || null,
    players: publicPlayers(room), board: BOARD, coins: COINS.map(({ id, name, icon, tint }) => ({ id, name, icon, tint })),
    prices: { ...room.prices }, priceDelta: { ...(room.priceDelta || {}) }, marketHistory: room.marketHistory.slice(-8),
    marketStewardUid: room.marketStewardUid || null, marketPhase: room.marketPhase ? { status: 'open', stewardUid: room.marketPhase.stewardUid, endsAt: room.marketPhase.endsAt } : null, lastEvent: room.lastEvent, lastCard: room.lastCard,
    logs: room.logs, ranking: room.ranking, playerCount: room.players.length,
    movement: room.movement ? { ...room.movement } : null,
    auction: publicAuction(room), deckCounts: Object.fromEntries(Object.entries(room.decks).map(([k, v]) => [k, v.length])),
  };
}
function playerState(room, player) {
  const current = room.players[room.turnIndex] || null;
  return {
    code: room.code, status: room.status, round: room.round, maxRounds: room.maxRounds,
    currentUid: room.marketPhase?.stewardUid || current?.uid || null, currentName: (room.marketPhase ? findPlayer(room, room.marketPhase.stewardUid)?.name : current?.name) || '',
    isMyTurn: room.marketPhase ? room.marketPhase.stewardUid === player.uid : Boolean(current && current.uid === player.uid),
    marketPhase: room.marketPhase ? { status: 'open', stewardUid: room.marketPhase.stewardUid, stewardName: findPlayer(room, room.marketPhase.stewardUid)?.name || '', endsAt: room.marketPhase.endsAt } : null, myUid: player.uid,
    me: {
      uid: player.uid, name: player.name, avatar: player.avatar, avatarData: player.avatarData, color: player.color,
      cash: player.cash, salary: player.salary, position: player.position,
      coins: { ...player.coins }, nodes: player.nodes, premiumNodes: player.premiumNodes, networkNodes: player.networkNodes,
      miningSlots: player.miningSlots.map(slot => ({ ...slot })), luck: player.luck, luckUsed: player.luckUsed,
      marketDealsUsed: player.marketDealsUsed, marketDealLimit: player.marketDealLimit, debt: player.debt, loanRate: player.loanRate, laps: player.laps,
      rolled: player.rolled, moving: player.moving, moveDone: player.moveDone, moveRemaining: room.movement?.uid === player.uid ? room.movement.remaining : 0,
      moveStep: room.movement?.uid === player.uid ? room.movement.step : 0,
      moveTotal: room.movement?.uid === player.uid ? room.movement.total : 0,
      actionUsed: player.actionUsed, lastRoll: player.lastRoll, dice: [...player.dice], trades: player.trades,
      netWorth: netWorth(room, player), goal: player.goal ? { ...player.goal } : null,
      lastCard: player.lastCard,
    },
    players: room.players.map((p) => ({ uid: p.uid, name: p.name, avatar: p.avatar, avatarData: p.avatarData, color: p.color, connected: p.connected, position: p.position, rolled: p.rolled, moving: p.moving, lastRoll: p.lastRoll })),
    board: BOARD, coins: COINS.map(({ id, name, icon, tint }) => ({ id, name, icon, tint })),
    prices: { ...room.prices }, priceDelta: { ...(room.priceDelta || {}) }, marketHistory: room.marketHistory.slice(-8),
    lastEvent: room.lastEvent, marketStewardUid: room.marketStewardUid || null,
    logs: room.logs.slice(0, 10), ranking: room.ranking, currentCell: BOARD[player.position], lastCard: room.lastCard,
    auction: publicAuction(room, player),
  };
}
function broadcast(room) {
  const dash = dashboardState(room);
  for (const socketId of room.dashboardSockets) io.to(socketId).emit('dashboardState', dash);
  for (const player of room.players) {
    if (player.connected && player.socketId) io.to(player.socketId).emit('playerState', playerState(room, player));
  }
}
function sendError(socket, message, ack) {
  const result = { ok: false, error: message };
  if (typeof ack === 'function') ack(result); else socket.emit('notice', result);
}
function sendSuccess(ack, extra = {}) { if (typeof ack === 'function') ack({ ok: true, ...extra }); }
function sessionFor(socket) {
  const session = playerSessions.get(socket.id);
  if (!session) return null;
  const room = rooms.get(session.code);
  const player = room && findPlayer(room, session.uid);
  return room && player ? { room, player } : null;
}
function dashboardRoomFor(socket) {
  const code = dashboardSessions.get(socket.id);
  return code ? rooms.get(code) || null : null;
}
function createRoomForDashboard(socket, data = {}) {
  let code;
  do { code = randomCode(); } while (rooms.has(code));
  const room = {
    code, dashboardToken: token(), dashboardSockets: new Set([socket.id]),
    status: 'lobby', players: [], turnIndex: 0, roundStartPlayerIndex: 0, roundTurnCount: 0, round: 1, maxRounds: [12, 16, 20, 24].includes(Number(data.rounds)) ? Number(data.rounds) : DEFAULT_ROUNDS,
    prices: basePrices(), priceDelta: {}, marketHistory: [{ round: 1, prices: basePrices() }], marketStewardUid: null, decks: makeDecks(),
    lastEvent: { title: 'Добро пожаловать в крипто-особняк!', text: 'Игроки подключаются. Колоды уже перетасованы, кубики заряжены!', kind: 'event', at: Date.now() },
    lastCard: null, logs: [], ranking: null, movement: null, moveTimer: null,
    auction: null, auctionTimer: null, auctionCleanupTimer: null,
    marketPhase: null, marketTimer: null,
    turnTimer: null, idleTimer: null,
  };
  rooms.set(code, room);
  dashboardSessions.set(socket.id, code);
  log(room, '🎥 Эфир создан. Четыре колоды перемешаны. Ждём игроков!', 'system');
  return room;
}
function clearRoomTimers(room) {
  for (const key of ['turnTimer', 'moveTimer', 'auctionTimer', 'auctionCleanupTimer', 'marketTimer']) {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  }
  room.movement = null;
  room.auction = null;
  room.marketPhase = null;
}
function beginMatch(room) {
  clearRoomTimers(room);
  room.decks = makeDecks();
  room.status = 'playing'; room.round = 1; room.turnIndex = 0; room.roundStartPlayerIndex = 0; room.roundTurnCount = 0;
  room.prices = basePrices(); room.priceDelta = {}; room.marketHistory = [{ round: 1, prices: basePrices() }];
  room.marketStewardUid = room.players[0]?.uid || null; room.marketPhase = null; if (room.marketTimer) clearTimeout(room.marketTimer); room.marketTimer = null; room.ranking = null; room.lastCard = null;
  room.players.forEach((p, i) => {
    p.color = COLORS[i % COLORS.length]; p.cash = 100000; p.salary = 35000;
    p.position = 0; p.coins = freshCoins(); p.nodes = 0; p.premiumNodes = 0; p.networkNodes = 1; p.miningSlots = []; p.luck = 3; p.luckUsed = false;
    p.marketDealsUsed = 0; p.marketDealLimit = 1; p.debt = 0; p.loanRate = 10; p.laps = 0;
    p.rolled = false; p.moving = false; p.moveDone = false; p.actionUsed = false;
    p.lastRoll = 0; p.dice = [0, 0]; p.trades = 0; p.goal = drawCard(room, 'goal');
    p.goalComplete = false; p.goalBonus = 0; p.lastCard = null;
  });
  setEvent(room, '🎬 Портал открыт!', `Все получили по 100 000 сом, 1 стартовую ноду и 3 звезды удачи. Впереди ${room.maxRounds} раундов: личные ходы, отдельная фаза рынка, прибыль ферм, кредиты, ноды и четыре колоды карт.`, 'system');
  scheduleDisconnectedTurn(room);
}
function charge(player, amount) {
  const value = Math.max(0, Math.floor(amount));
  const paid = Math.min(player.cash, value);
  player.cash -= paid;
  return paid;
}
function cardResult(room, player, card, deckName) {
  const effect = card.effect || {};
  let result = '';
  if (Number.isInteger(effect.cash) && effect.cash !== 0) {
    if (effect.cash > 0) { player.cash += effect.cash; result = `+${formatMoney(effect.cash)}`; }
    else { const paid = charge(player, -effect.cash); result = `−${formatMoney(paid)}`; }
  }
  if (effect.coin && Number.isInteger(effect.qty)) {
    if (effect.qty > 0) player.coins[effect.coin] += effect.qty;
    result = `${result ? `${result} · ` : ''}${effect.qty > 0 ? '+' : ''}${effect.qty} ${effect.coin}`;
  }
  if (Number.isInteger(effect.luck) && effect.luck !== 0) {
    const before = player.luck;
    player.luck = Math.max(0, Math.min(3, player.luck + effect.luck));
    const actual = player.luck - before;
    if (actual !== 0) result = `${result ? `${result} · ` : ''}${actual > 0 ? '+' : '−'}${Math.abs(actual)} ⭐`;
  }
  const shown = { id: crypto.randomUUID(), revealedAt: Date.now(), type: deckName, title: card.title, text: card.text, icon: deckName === 'lottery' ? '🎟️' : '🕯️', result: result || 'Событие разрешено', playerName: player.name };
  player.lastCard = shown;
  room.lastCard = { ...shown };
  setEvent(room, `${shown.icon} ${card.title}`, `${player.name}: ${card.text}${result ? ` (${result})` : ''}`, deckName === 'crisis' ? (effect.cash < 0 ? 'warning' : 'good') : 'good');
}
function applyLottery(room, player) { cardResult(room, player, drawCard(room, 'lottery'), 'lottery'); }
function applyCrisis(room, player) { cardResult(room, player, drawCard(room, 'crisis'), 'crisis'); }
function applyMarketCard(room, sourcePlayer = null) {
  const card = drawCard(room, 'market');
  const changes = [];
  const deltas = {};
  for (const [coin, pct] of Object.entries(card.changes)) {
    if (!Object.prototype.hasOwnProperty.call(room.prices, coin)) continue;
    const before = room.prices[coin];
    const next = Math.round((before * (100 + pct)) / 100 / 100) * 100;
    room.prices[coin] = Math.max(500, Math.min(300000, next));
    const actual = Math.round((room.prices[coin] / before - 1) * 100);
    deltas[coin] = { pct: actual, before, after: room.prices[coin] };
    changes.push(`${coin} ${actual > 0 ? '+' : ''}${actual}%`);
  }
  room.priceDelta = { ...(room.priceDelta || {}), ...deltas };
  room.marketHistory.push({ round: room.round, prices: { ...room.prices }, changes: { ...(room.priceDelta || {}) }, cardTitle: card.title });
  if (room.marketHistory.length > 20) room.marketHistory.shift();
  const shown = { id: crypto.randomUUID(), revealedAt: Date.now(), type: 'market', title: card.title, text: card.text, icon: '🌪️', result: changes.join(' · ') || 'Курсы без изменений', playerName: sourcePlayer?.name || 'Весь рынок' };
  room.lastCard = { ...shown };
  setEvent(room, '🌪️ Разворот рынка: ' + card.title, `${card.text} Новые курсы: ${changes.join(' · ')}.`, 'system');
}

function settleRoundEconomy(room) {
  // Reference game has a distinct mining-farm profit phase and loan interest.
  // Resolve both once after every player has completed the round.
  const lines = [];
  for (const player of room.players) {
    const mined = {};
    for (const slot of player.miningSlots || []) {
      if (!room.prices[slot.coin]) continue;
      player.coins[slot.coin] += 1;
      mined[slot.coin] = (mined[slot.coin] || 0) + 1;
    }
    const minedText = Object.entries(mined).map(([coin, qty]) => `+${qty} ${coin}`).join(', ');
    let interestText = '';
    if (player.debt > 0) {
      const rate = player.loanRate === 20 ? 20 : 10;
      const interest = Math.ceil(player.debt * rate / 100);
      player.debt += interest;
      interestText = `проценты −${formatMoney(interest)}`;
      log(room, `🏦 Проценты ${player.name}: +${formatMoney(interest)} (${rate}%).`, 'warning');
    }
    if (minedText) log(room, `⛏️ Ферма ${player.name} добыла ${minedText}.`, 'good');
    if (minedText || interestText) lines.push(`${player.name}: ${[minedText, interestText].filter(Boolean).join(' · ')}`);
  }
  const summary = lines.length ? lines.join('  |  ') : 'В этом раунде фермы молчат, а кредитов для начисления процентов нет.';
  room.lastCard = {
    id: crypto.randomUUID(), revealedAt: Date.now(), type: 'profit', icon: '⛏️',
    title: `Фаза прибыли · раунд ${room.round}`, playerName: 'ВСЕ ИГРОКИ',
    text: summary, result: 'Каждый слот добывает 1 монету выбранного типа. Банк начисляет проценты по долгу один раз за раунд.',
  };
  log(room, `🧾 Завершена экономика раунда ${room.round}: фермы обработаны, проценты начислены.`, 'system');
  setEvent(room, '⛏️ Фаза прибыли криптоферм', 'Сначала фермы зачислили монеты, затем банк начислил проценты. Сейчас управляющий выберет изменение цены, после чего откроется карта рынка.', 'system');
}

function startAuction(room, player) {
  if (room.auction?.status === 'open') {
    setEvent(room, '🔔 Аукционный чердак занят', 'Предыдущий лот ещё разыгрывается. Дождись результатов.', 'warning');
    return;
  }
  room.auction = {
    id: crypto.randomUUID(), status: 'open', lot: 'Редкий слот майнинг-фермы',
    description: 'Победитель получит слот для добычи и сам выберет монету: BTC, ETH, DOGE или PEPE. Слот приносит 1 выбранную монету в конце каждого полного раунда.',
    minBid: 20000, bids: {}, endsAt: Date.now() + AUCTION_MS, initiatorUid: player.uid, result: null,
  };
  setEvent(room, '🔔 Открыт аукцион!', `${player.name} нашёл редкий слот майнинг-фермы. Все игроки могут сделать тайную ставку и выбрать монету для добычи в течение 20 секунд.`, 'event');
  if (room.auctionTimer) clearTimeout(room.auctionTimer);
  room.auctionTimer = setTimeout(() => closeAuction(room), AUCTION_MS);
}
function closeAuction(room) {
  room.auctionTimer = null;
  if (!room.auction || room.auction.status !== 'open') return;
  const offers = Object.entries(room.auction.bids).map(([uid, bid]) => ({ uid, ...bid })).sort((a, b) => b.amount - a.amount || a.at - b.at);
  const winnerOffer = offers[0];
  const winner = winnerOffer ? findPlayer(room, winnerOffer.uid) : null;
  if (winner && winner.cash >= winnerOffer.amount && winner.miningSlots.length < 5) {
    winner.cash -= winnerOffer.amount;
    const coin = COINS.some((item) => item.id === winnerOffer.coin) ? winnerOffer.coin : 'BTC';
    winner.miningSlots.push({ id: crypto.randomUUID(), coin });
    room.auction.status = 'closed';
    room.auction.result = { winnerUid: winner.uid, winnerName: winner.name, amount: winnerOffer.amount, coin };
    setEvent(room, '🏆 Аукцион выигран!', `${winner.name} забрал слот ${coin} за ${formatMoney(winnerOffer.amount)}. Теперь ферма добывает 1 ${coin} в конце каждого раунда!`, 'good');
  } else {
    room.auction.status = 'closed';
    room.auction.result = { winnerUid: null, winnerName: '', amount: 0, coin: null };
    setEvent(room, '🔔 Аукцион завершён', 'Ставок не было. Призрачный ASIC снова спрятался на чердаке.', 'event');
  }
  broadcast(room);
  room.auctionCleanupTimer = setTimeout(() => { room.auction = null; room.auctionCleanupTimer = null; broadcast(room); }, 10000);
}
function land(room, player) {
  const cell = BOARD[player.position];
  switch (cell.type) {
    case 'start':
      player.cash += 10000;
      setEvent(room, '🌀 Точное попадание в портал!', `${player.name} получил дополнительный бонус за остановку на старте: 10 000 сом.`, 'good');
      break;
    case 'lottery': applyLottery(room, player); break;
    case 'crisis': applyCrisis(room, player); break;
    case 'market': applyMarketCard(room, player); break;
    case 'job':
      player.cash += 15000;
      setEvent(room, '🦴 Скелет выдал подработку!', `${player.name} разобрал завалы серверной и заработал 15 000 сом.`, 'good');
      break;
    case 'bonus':
      player.cash += 8000;
      setEvent(room, '🧁 Кекс удачи!', `${player.name} нашёл в кексе 8 000 сом. Сладкая инвестиция!`, 'good');
      break;
    case 'exchange': setEvent(room, '📈 Биржа призраков', `${player.name} может совершить одну сделку: купить или продать монеты.`, 'event'); break;
    case 'bank': setEvent(room, '🏦 Банк привидений', `${player.name} может взять кредит или полностью вернуть долг.`, 'event'); break;
    case 'mine': setEvent(room, '⛏️ Майнинг-пещера', `${player.name} получил скидку на ноду и слот фермы. Ноды расширяют количество сделок, а слоты добывают монеты в конце каждого раунда.`, 'event'); break;
    case 'auction': startAuction(room, player); break;
    default: setEvent(room, cell.name, `${player.name} остановился на клетке.`, 'event');
  }
}
function currentPlayer(room) { return room.players[room.turnIndex] || null; }
function scheduleDisconnectedTurn(room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  if (room.status !== 'playing' || room.marketPhase?.status === 'open') return;
  const current = currentPlayer(room);
  if (!current || current.connected || room.movement) return;
  const expectedUid = current.uid;
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    const latest = rooms.get(room.code);
    if (!latest || latest.status !== 'playing' || latest.movement) return;
    if (currentPlayer(latest)?.uid !== expectedUid || currentPlayer(latest)?.connected) return;
    advanceTurn(latest, true);
    broadcast(latest);
  }, TURN_GRACE_MS);
}
function finishGame(room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.moveTimer) clearTimeout(room.moveTimer);
  room.turnTimer = null; room.moveTimer = null; room.movement = null;
  if (room.marketTimer) clearTimeout(room.marketTimer); room.marketTimer = null; room.marketPhase = null;
  room.status = 'finished';
  room.players.forEach((p) => {
    p.goalComplete = checkGoal(p);
    p.goalBonus = p.goalComplete ? (p.goal?.reward || 0) : 0;
  });
  room.ranking = room.players.map((p) => ({
    uid: p.uid, name: p.name, avatar: p.avatar, avatarData: p.avatarData,
    score: netWorth(room, p) + p.goalBonus, assets: netWorth(room, p),
    goalTitle: p.goal?.title || 'Секретная цель', goalComplete: p.goalComplete, goalBonus: p.goalBonus,
  })).sort((a, b) => b.score - a.score);
  const winner = room.ranking[0];
  const tied = room.ranking.filter((r) => r.score === winner?.score);
  const message = tied.length > 1
    ? `Ничья! ${tied.map((p) => p.name).join(' и ')} разделили титул с капиталом ${formatMoney(winner.score)}!`
    : winner ? `${winner.name} — новый Крипто Босс с капиталом ${formatMoney(winner.score)}!` : 'Партия завершена.';
  setEvent(room, '🏆 Крипто-кубок найден!', message, 'good');
}
function advanceTurn(room, skipped = false) {
  if (room.movement || room.auction?.status === 'open' || room.marketPhase?.status === 'open') return;
  const ended = currentPlayer(room);
  if (ended) {
    if (skipped) log(room, `⏭️ Ход ${ended.name} пропущен: игрок пока не на связи.`, 'warning');
    ended.rolled = false; ended.moving = false; ended.moveDone = false; ended.actionUsed = false;
    ended.lastRoll = 0; ended.dice = [0, 0]; ended.marketDealsUsed = 0; ended.marketDealLimit = ended.networkNodes;
    ended.luckUsed = false;
  }
  // Count completed turns explicitly. This is essential when the starting player rotates each round.
  room.roundTurnCount = (room.roundTurnCount || 0) + 1;
  if (room.roundTurnCount >= room.players.length) {
    room.roundTurnCount = 0;
    settleRoundEconomy(room);
    if (room.round >= room.maxRounds) { finishGame(room); return; }
    const steward = room.players[room.roundStartPlayerIndex] || room.players[0];
    room.marketStewardUid = steward?.uid || null;
    room.priceDelta = {};
    room.marketPhase = { status: 'open', stewardUid: room.marketStewardUid, endsAt: Date.now() + MARKET_PHASE_MS };
    setEvent(room, '📊 Фаза рынка!', `${steward?.name || 'Игрок'} назначен управляющим биржей. Он выбирает одну монету и меняет её курс на 10%; затем всем открывается общая карта разворота рынка.`, 'system');
    if (room.marketTimer) clearTimeout(room.marketTimer);
    room.marketTimer = setTimeout(() => {
      if (!room.marketPhase || room.status !== 'playing') return;
      const coin = COINS[randomInt(COINS.length)];
      resolveMarketDecision(room, coin.id, randomInt(2) ? 'up' : 'down', null, true);
      setEvent(room, '⏱️ Рынок решил сам', 'Время управляющего вышло. Особняк сам выбрал направление курса и открыл рыночную карту.', 'system');
      broadcast(room);
    }, MARKET_PHASE_MS);
    return;
  }
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  const next = currentPlayer(room);
  if (next) setEvent(room, '🔔 Передача кубика', `Теперь ходит ${next.name}.`, 'system');
  scheduleDisconnectedTurn(room);
}

function resolveMarketDecision(room, coinId, direction, player = null, automatic = false) {
  const coin = COINS.find((item) => item.id === coinId);
  if (!coin || !room.marketPhase || room.marketPhase.status !== 'open') return false;
  const before = room.prices[coin.id];
  const sign = direction === 'down' ? -1 : 1;
  const after = Math.max(500, Math.min(300000, Math.round(before * (1 + sign * 0.1) / 100) * 100));
  const actual = Math.round((after / before - 1) * 100);
  room.prices[coin.id] = after;
  room.priceDelta = { ...(room.priceDelta || {}), [coin.id]: { pct: actual, before, after, steward: true } };
  const managerName = player?.name || (automatic ? 'Автопилот особняка' : 'Управляющий рынком');
  log(room, `🎛️ ${managerName} ${actual >= 0 ? 'поднял' : 'опустил'} ${coin.id} на ${Math.abs(actual)}%.`, 'system');
  if (room.marketTimer) clearTimeout(room.marketTimer);
  room.marketTimer = null;
  room.marketPhase = null;
  applyMarketCard(room, player);
  if (room.round >= room.maxRounds) {
    finishGame(room);
  } else {
    room.round += 1;
    room.roundStartPlayerIndex = (room.roundStartPlayerIndex + 1) % Math.max(1, room.players.length);
    room.turnIndex = room.roundStartPlayerIndex;
    room.marketStewardUid = room.players[room.turnIndex]?.uid || null;
    log(room, `Начался раунд ${room.round} из ${room.maxRounds}. Следующий управляющий рынком — ${room.players[room.turnIndex]?.name || 'особняк'}.`, 'system');
    scheduleDisconnectedTurn(room);
  }
  return true;
}

function marketDecision(socket, data, ack) {
  const session = sessionFor(socket);
  if (!session) return sendError(socket, 'Ты не подключён к комнате.', ack);
  const { room, player } = session;
  if (room.status !== 'playing' || !room.marketPhase || room.marketPhase.status !== 'open') return sendError(socket, 'Сейчас фаза рынка не активна.', ack);
  if (room.marketPhase.stewardUid !== player.uid) return sendError(socket, 'Биржей сейчас управляет другой игрок.', ack);
  if (!resolveMarketDecision(room, String(data.coin || ''), data.direction === 'down' ? 'down' : 'up', player, false)) return sendError(socket, 'Выбери монету и направление изменения цены.', ack);
  setEvent(room, '📈 Управление биржей завершено', `${player.name} принял решение по рынку. Карта разворота уже влияет на все курсы.`, 'good');
  broadcast(room);
  sendSuccess(ack);
}

function mustBeMyTurn(room, player) {
  if (room.status !== 'playing') return 'Партия сейчас не идёт.';
  if (room.marketPhase?.status === 'open') return 'Сейчас отдельная фаза рынка. Сначала управляющий должен изменить курс.';
  if (currentPlayer(room)?.uid !== player.uid) return 'Сейчас ход другого игрока.';
  return null;
}
function finishMovement(room, player) {
  if (room.movement?.uid !== player.uid || currentPlayer(room)?.uid !== player.uid) return;
  room.movement = null;
  room.moveTimer = null;
  player.moving = false;
  player.moveDone = true;
  player.marketDealsUsed = 0;
  player.marketDealLimit = player.networkNodes + (BOARD[player.position].type === 'exchange' ? 1 : 0);
  land(room, player);
  broadcast(room);
  scheduleDisconnectedTurn(room);
}
function movementStep(room, uid) {
  const player = findPlayer(room, uid);
  if (!player || room.status !== 'playing' || room.movement?.uid !== uid || currentPlayer(room)?.uid !== uid) return;
  const from = player.position;
  const to = (from + 1) % BOARD_SIZE;
  player.position = to;
  room.movement.step += 1;
  room.movement.remaining -= 1;
  room.movement.lastTile = to;
  if (to === 0) {
    player.laps += 1;
    const miningIncome = player.nodes * 8000 + player.premiumNodes * 12000;
    const payout = player.salary + miningIncome;
    player.cash += payout;
    log(room, `🏁 ${player.name} прошёл портал: зарплата ${formatMoney(player.salary)} + майнинг ${formatMoney(miningIncome)}.`, 'good');
    setEvent(room, '🌀 Пройден портал!', `${player.name} получил ${formatMoney(payout)}. Весь особняк услышал звон монет!`, 'good');
  } else {
    log(room, `👣 ${player.name}: шаг ${room.movement.step}/${room.movement.total} — клетка ${to + 1}.`, 'move');
  }
  broadcast(room);
  if (room.movement.remaining > 0) {
    room.moveTimer = setTimeout(() => movementStep(room, uid), MOVE_STEP_MS);
  } else {
    room.moveTimer = setTimeout(() => finishMovement(room, player), MOVE_STEP_MS);
  }
}
function roll(socket, ack) {
  const session = sessionFor(socket);
  if (!session) return sendError(socket, 'Вы не подключены к комнате.', ack);
  const { room, player } = session;
  const turnError = mustBeMyTurn(room, player);
  if (turnError) return sendError(socket, turnError, ack);
  if (player.rolled || room.movement) return sendError(socket, 'Кубики уже брошены. Дождись окончания движения.', ack);
  const dice = [randomInt(6) + 1, randomInt(6) + 1];
  const total = dice[0] + dice[1];
  player.rolled = true; player.moving = true; player.moveDone = false; player.actionUsed = false;
  player.dice = dice; player.lastRoll = total; player.marketDealsUsed = 0; player.marketDealLimit = player.networkNodes; player.luckUsed = false;
  room.movement = { uid: player.uid, total, step: 0, remaining: total, from: player.position, lastTile: player.position };
  setEvent(room, '🎲 Кубики брошены!', `${player.name} выбросил ${dice[0]} + ${dice[1]} = ${total}. Фишка отправилась в путь!`, 'move');
  broadcast(room);
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  room.moveTimer = setTimeout(() => movementStep(room, player.uid), MOVE_STEP_MS);
  sendSuccess(ack, { dice, total });
}
function validateActionCell(room, player, type) {
  const turnError = mustBeMyTurn(room, player);
  if (turnError) return turnError;
  if (!player.rolled || !player.moveDone || player.moving) return 'Сначала дождись, пока фишка пройдёт все клетки.';
  if (type === 'trade') {
    if (player.marketDealsUsed >= player.marketDealLimit) return `Все сделки на этот ход использованы (${player.marketDealLimit}). Купи ноду, чтобы расширить лимит.`;
    return null;
  }
  if (type === 'luck') {
    if (player.luck <= 0) return 'Звёзды удачи закончились.';
    if (player.luckUsed) return 'В этом ходу ты уже использовал звезду удачи.';
    return null;
  }
  if (player.actionUsed) return 'Особое действие уже использовано в этом ходу.';
  const allowed = { loan: 'bank', repay: 'bank' };
  if (allowed[type] && allowed[type] !== BOARD[player.position].type) return 'Кредитные действия доступны только в Банке.';
  if (!['loan', 'repay', 'node', 'slot'].includes(type)) return 'Неизвестное действие.';
  return null;
}

function performAction(socket, data, ack) {
  const session = sessionFor(socket);
  if (!session) return sendError(socket, 'Вы не подключены к комнате.', ack);
  const { room, player } = session;
  const type = String(data.type || '');
  const invalid = validateActionCell(room, player, type);
  if (invalid) return sendError(socket, invalid, ack);

  if (type === 'trade') {
    const coin = COINS.find((c) => c.id === data.coin);
    const side = data.side;
    const qty = Number(data.qty);
    if (!coin || !['buy', 'sell'].includes(side)) return sendError(socket, 'Проверь параметры сделки.', ack);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 999) return sendError(socket, 'Количество должно быть от 1 до 999.', ack);
    const price = room.prices[coin.id];
    const total = price * qty;
    if (!Number.isSafeInteger(total)) return sendError(socket, 'Слишком большая сумма сделки.', ack);
    if (side === 'buy') {
      if (player.cash < total) return sendError(socket, 'Не хватает сомов для покупки.', ack);
      player.cash -= total; player.coins[coin.id] += qty;
    } else {
      if (player.coins[coin.id] < qty) return sendError(socket, 'У тебя нет столько монет.', ack);
      player.coins[coin.id] -= qty; player.cash += total;
    }
    player.trades += 1;
    player.marketDealsUsed += 1;
    setEvent(room, '📈 Сделка прошла!', `${player.name} ${side === 'buy' ? 'купил' : 'продал'} ${qty} ${coin.id} за ${formatMoney(total)}.`, 'good');
  } else if (type === 'loan') {
    if (player.debt > 0) return sendError(socket, 'Сначала верни старый кредит.', ack);
    const rate = Number(data.rate) === 20 ? 20 : 10;
    player.cash += 50000; player.debt = rate === 20 ? 60000 : 55000; player.loanRate = rate; player.actionUsed = true;
    setEvent(room, '🏦 Банк выдал кредит', `${player.name} получил 50 000 сом. Ставка ${rate}% за раунд, долг на старте ${formatMoney(player.debt)}.`, 'event');
  } else if (type === 'repay') {
    if (player.debt <= 0) return sendError(socket, 'У тебя нет кредита.', ack);
    if (player.cash < player.debt) return sendError(socket, `Для возврата нужно ${formatMoney(player.debt)}.`, ack);
    const paid = player.debt; player.cash -= paid; player.debt = 0; player.actionUsed = true;
    setEvent(room, '✅ Кредит закрыт!', `${player.name} полностью вернул ${formatMoney(paid)}. Банк доволен!`, 'good');
  } else if (type === 'node') {
    const discount = BOARD[player.position].type === 'mine' ? 5000 : 0;
    const cost = Math.max(25000, (player.networkNodes === 1 ? 35000 : 50000) - discount);
    if (player.networkNodes >= 3) return sendError(socket, 'У тебя уже максимум: 3 ноды.', ack);
    if (player.cash < cost) return sendError(socket, `Нужно ${formatMoney(cost)} для покупки ноды.`, ack);
    player.cash -= cost; player.networkNodes += 1; player.marketDealLimit += 1; player.actionUsed = true;
    setEvent(room, '🔗 Нода подключена!', `${player.name} подключил ноду за ${formatMoney(cost)}. Сеть даёт ${player.networkNodes} сделки на каждом своём ходу. Ноду можно купить в любой клетке; в Майнинг-пещере дешевле.`, 'good');
  } else if (type === 'slot') {
    const coin = COINS.find(c => c.id === data.coin);
    const discount = BOARD[player.position].type === 'mine' ? 10000 : 0;
    const cost = 50000 - discount;
    if (!coin) return sendError(socket, 'Выбери монету для майнинг-слота.', ack);
    if (player.miningSlots.length >= 5) return sendError(socket, 'Можно установить не больше 5 слотов фермы.', ack);
    if (player.cash < cost) return sendError(socket, `Нужно ${formatMoney(cost)} для покупки слота.`, ack);
    player.cash -= cost; player.miningSlots.push({ id: crypto.randomUUID(), coin: coin.id }); player.actionUsed = true;
    setEvent(room, '⛏️ Ферма запущена!', `${player.name} установил слот ${coin.id} за ${formatMoney(cost)}. Каждый раунд ферма добывает 1 ${coin.id}.`, 'good');
  } else if (type === 'luck') {
    const coin = COINS.find(c => c.id === data.coin);
    const direction = data.direction === 'down' ? -1 : 1;
    if (!coin) return sendError(socket, 'Выбери монету для влияния на рынок.', ack);
    const before = room.prices[coin.id];
    room.prices[coin.id] = Math.max(500, Math.min(300000, Math.round(before * (1 + direction * 0.1) / 100) * 100));
    const actual = Math.round((room.prices[coin.id] / before - 1) * 100);
    room.priceDelta[coin.id] = { pct: actual, before, after: room.prices[coin.id], luck: true };
    player.luck -= 1; player.luckUsed = true;
    setEvent(room, '⭐ Звезда удачи!', `${player.name} потратил звезду и повлиял на ${coin.id}: ${actual > 0 ? '+' : ''}${actual}%.`, 'good');
  }
  broadcast(room);
  sendSuccess(ack);
}
function bidAuction(socket, data, ack) {
  const session = sessionFor(socket);
  if (!session) return sendError(socket, 'Ты не подключён к комнате.', ack);
  const { room, player } = session;
  const auction = room.auction;
  if (!auction || auction.status !== 'open' || Date.now() >= auction.endsAt) return sendError(socket, 'Аукцион уже завершён.', ack);
  const amount = Number(data.amount);
  if (!Number.isSafeInteger(amount) || amount < auction.minBid || amount > 10000000) return sendError(socket, `Ставка должна быть не меньше ${formatMoney(auction.minBid)}.`, ack);
  if (amount > player.cash) return sendError(socket, 'У тебя не хватает наличных для такой ставки.', ack);
  if (player.miningSlots.length >= 5) return sendError(socket, 'У тебя уже заполнена вся майнинг-ферма — слот не поместится.', ack);
  const bidCoin = String(data.coin || 'BTC');
  if (!COINS.some((item) => item.id === bidCoin)) return sendError(socket, 'Выбери монету, которую будет добывать слот.', ack);
  const previous = auction.bids[player.uid]?.amount || 0;
  if (amount <= previous) return sendError(socket, 'Новая ставка должна быть выше твоей предыдущей.', ack);
  auction.bids[player.uid] = { amount, coin: bidCoin, at: Date.now() };
  log(room, `🔔 ${player.name} сделал тайную ставку на аукционе.`, 'system');
  broadcast(room);
  sendSuccess(ack, { myBid: amount });
}
function endTurn(socket, ack) {
  const session = sessionFor(socket);
  if (!session) return sendError(socket, 'Вы не подключены к комнате.', ack);
  const { room, player } = session;
  const turnError = mustBeMyTurn(room, player);
  if (turnError) return sendError(socket, turnError, ack);
  if (!player.rolled || !player.moveDone || player.moving) return sendError(socket, 'Сначала брось кубики и дождись окончания движения.', ack);
  if (room.auction?.status === 'open') return sendError(socket, 'Сначала дождись завершения аукциона на большом экране.', ack);
  if (room.marketPhase?.status === 'open') return sendError(socket, 'Сейчас проходит фаза рынка. Дождись её завершения.', ack);
  advanceTurn(room, false);
  if (room.status === 'playing') log(room, `Ход перешёл к ${currentPlayer(room)?.name || 'следующему игроку'}.`, 'system');
  broadcast(room);
  sendSuccess(ack);
}
function dashboardAction(socket, action, ack) {
  const room = dashboardRoomFor(socket);
  if (!room) return sendError(socket, 'Этот экран больше не связан с комнатой.', ack);
  if (action === 'start') {
    if (room.status !== 'lobby') return sendError(socket, 'Партия уже запущена.', ack);
    const connected = room.players.filter((p) => p.connected).length;
    if (connected < 2) return sendError(socket, 'Для старта нужно минимум 2 подключённых игрока.', ack);
    beginMatch(room);
  } else if (action === 'restart') {
    if (room.status !== 'finished') return sendError(socket, 'Сначала завершите текущую партию.', ack);
    if (room.players.filter((p) => p.connected).length < 2) return sendError(socket, 'Для новой партии нужно минимум 2 подключённых игрока.', ack);
    beginMatch(room);
  } else {
    return sendError(socket, 'Неизвестное действие ведущего.', ack);
  }
  broadcast(room);
  sendSuccess(ack);
}
function resumePlayer(socket, savedToken, ack) {
  if (typeof savedToken !== 'string' || savedToken.length < 32 || savedToken.length > 128) return sendError(socket, 'Сохранённый вход не найден. Введи код комнаты.', ack);
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.token === savedToken);
    if (!player) continue;
    const oldSocketId = player.socketId;
    player.socketId = socket.id; player.connected = true;
    if (oldSocketId && oldSocketId !== socket.id) {
      playerSessions.delete(oldSocketId);
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket) oldSocket.disconnect(true);
    }
    playerSessions.set(socket.id, { code: room.code, uid: player.uid });
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = null;
    log(room, `🔌 ${player.name} вернулся в игру.`, 'system');
    scheduleDisconnectedTurn(room);
    sendSuccess(ack, { code: room.code, uid: player.uid, status: room.status });
    broadcast(room);
    return;
  }
  sendError(socket, 'Комната уже закрыта. Введи код новой игры.', ack);
}
function resumeDashboard(socket, savedToken, ack) {
  for (const room of rooms.values()) {
    if (room.dashboardToken !== savedToken) continue;
    room.dashboardSockets.add(socket.id);
    dashboardSessions.set(socket.id, room.code);
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = null;
    sendSuccess(ack, { code: room.code });
    broadcast(room);
    return;
  }
  sendError(socket, 'Эфир не найден. Создай новую комнату.', ack);
}
function removeFromLobby(room, player) {
  const index = room.players.findIndex((p) => p.uid === player.uid);
  if (index < 0) return;
  room.players.splice(index, 1);
  if (index < room.turnIndex) room.turnIndex -= 1;
  if (room.turnIndex >= room.players.length) room.turnIndex = 0;
  log(room, `${player.name} покинул комнату.`, 'warning');
}
function scheduleIdleCleanup(room) {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  if (room.players.some((p) => p.connected) || room.dashboardSockets.size) return;
  room.idleTimer = setTimeout(() => {
    const latest = rooms.get(room.code);
    if (latest && !latest.players.some((p) => p.connected) && latest.dashboardSockets.size === 0) {
      clearRoomTimers(latest);
      rooms.delete(room.code);
    }
  }, ROOM_IDLE_MS);
}

io.on('connection', (socket) => {
  socket.on('createDashboardRoom', (data = {}, ack) => {
    if (dashboardSessions.has(socket.id) || playerSessions.has(socket.id)) return sendError(socket, 'Этот браузер уже подключён к игре.', ack);
    const room = createRoomForDashboard(socket, data);
    sendSuccess(ack, { code: room.code, token: room.dashboardToken });
    broadcast(room);
  });
  socket.on('dashboardResume', (data = {}, ack) => {
    if (dashboardSessions.has(socket.id)) return sendError(socket, 'Экран уже подключён.', ack);
    resumeDashboard(socket, data.token, ack);
  });
  socket.on('joinRoom', (data = {}, ack) => {
    if (playerSessions.has(socket.id) || dashboardSessions.has(socket.id)) return sendError(socket, 'Этот браузер уже подключён к комнате.', ack);
    const code = String(data.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const room = rooms.get(code);
    if (!room) return sendError(socket, 'Комната не найдена. Проверь код на большом экране.', ack);
    if (room.status !== 'lobby') return sendError(socket, 'Партия уже началась. В неё нельзя войти посреди игры.', ack);
    if (room.players.length >= MAX_PLAYERS) return sendError(socket, `В комнате максимум ${MAX_PLAYERS} игроков.`, ack);
    const player = makePlayer(socket, data);
    player.color = COLORS[room.players.length % COLORS.length];
    room.players.push(player);
    playerSessions.set(socket.id, { code, uid: player.uid });
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = null;
    log(room, `${player.name} вошёл в крипто-особняк.`, 'good');
    sendSuccess(ack, { code, uid: player.uid, token: player.token });
    broadcast(room);
  });
  socket.on('resumePlayer', (data = {}, ack) => resumePlayer(socket, data.token, ack));
  socket.on('dashboardStart', (_data, ack) => dashboardAction(socket, 'start', ack));
  socket.on('dashboardRestart', (_data, ack) => dashboardAction(socket, 'restart', ack));
  socket.on('roll', (_data, ack) => roll(socket, ack));
  socket.on('action', (data = {}, ack) => performAction(socket, data, ack));
  socket.on('auctionBid', (data = {}, ack) => bidAuction(socket, data, ack));
  socket.on('marketDecision', (data = {}, ack) => marketDecision(socket, data, ack));
  socket.on('endTurn', (_data, ack) => endTurn(socket, ack));
  socket.on('leavePlayer', (_data, ack) => {
    const session = sessionFor(socket);
    if (!session) return sendError(socket, 'Ты уже не в комнате.', ack);
    const { room, player } = session;
    playerSessions.delete(socket.id); socket.leave(room.code);
    player.connected = false; player.socketId = null;
    if (room.status === 'lobby') removeFromLobby(room, player);
    else log(room, `${player.name} временно покинул партию.`, 'warning');
    if (room.status === 'playing') scheduleDisconnectedTurn(room);
    broadcast(room); scheduleIdleCleanup(room); sendSuccess(ack);
  });
  socket.on('disconnect', () => {
    const code = dashboardSessions.get(socket.id);
    if (code) {
      dashboardSessions.delete(socket.id);
      const room = rooms.get(code);
      if (room) { room.dashboardSockets.delete(socket.id); log(room, '📺 Большой экран отключился. Можно открыть /dashboard и вернуться.', 'warning'); broadcast(room); scheduleIdleCleanup(room); }
      return;
    }
    const session = playerSessions.get(socket.id);
    playerSessions.delete(socket.id);
    if (!session) return;
    const room = rooms.get(session.code);
    if (!room) return;
    const player = findPlayer(room, session.uid);
    if (!player || player.socketId !== socket.id) return;
    player.connected = false; player.socketId = null;
    log(room, `📡 ${player.name} потерял связь. Он может вернуться с того же устройства.`, 'warning');
    broadcast(room);
    if (room.status === 'playing') scheduleDisconnectedTurn(room);
    scheduleIdleCleanup(room);
  });
});

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const address of list || []) if (address.family === 'IPv4' && !address.internal) result.push(address.address);
  }
  return [...new Set(result)];
}
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n👻 CRYPTO BOSS 6.1 — Крипто-особняк запущен!');
  console.log(`Большой экран: http://localhost:${PORT}/dashboard`);
  console.log(`Планшет игрока: http://localhost:${PORT}/`);
  const addresses = lanAddresses();
  if (addresses.length) {
    console.log('\nНа устройствах в той же Wi-Fi сети:');
    addresses.forEach((ip) => console.log(`  Большой экран: http://${ip}:${PORT}/dashboard`));
    addresses.forEach((ip) => console.log(`  Планшет игрока: http://${ip}:${PORT}/`));
  }
  console.log('\nОставьте это окно открытым на всё время игры.\n');
});
