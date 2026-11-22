'use strict';

const crypto = require('node:crypto');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RV = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
const streets = ['preflop', 'flop', 'turn', 'river'];

function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit, v: RV[rank] });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function nextIndex(seats, from, predicate = () => true) {
  for (let step = 1; step <= seats.length; step++) {
    const i = (from + step + seats.length) % seats.length;
    if (predicate(seats[i])) return i;
  }
  return -1;
}
function orderedSeats(room, afterIndex, predicate) {
  const out = [];
  for (let n = 1; n <= room.seats.length; n++) {
    const s = room.seats[(afterIndex + n + room.seats.length) % room.seats.length];
    if (predicate(s)) out.push(s);
  }
  return out;
}
function freshRoom({ id, code, ownerId, ownerName, name, maxPlayers = 6, buyIn = 500, smallBlind = 5, bigBlind = 10, mode = 'free', rakePercent = 5, rakeCap = 100 }) {
  const room = {
    id, code, ownerId, name: String(name || 'Mesa aberta').slice(0, 28),
    maxPlayers, buyIn, smallBlind, bigBlind, mode, rakePercent, rakeCap, status: 'waiting',
    seats: [{ id: crypto.randomUUID(), playerId: ownerId, username: ownerName, stack: buyIn, totalHands: 0, left: false, leaveAfterHand: false }],
    dealerId: null, handNo: 0, hand: null, nextHandAt: null,
    history: ['Mesa criada. Aguardando jogadores.'], updatedAt: Date.now()
  };
  return room;
}
function addSeat(room, playerId, username, buyIn) {
  if (room.seats.some(s => s.playerId === playerId && !s.left)) return { error: 'Você já está nesta mesa.' };
  if (room.seats.filter(s => !s.left).length >= room.maxPlayers) return { error: 'Mesa cheia.' };
  if (!Number.isInteger(buyIn) || buyIn < room.buyIn || buyIn > room.buyIn * 4) return { error: 'Entrada inválida para esta mesa.' };
  room.seats.push({ id: crypto.randomUUID(), playerId, username, stack: buyIn, totalHands: 0, left: false, leaveAfterHand: false });
  room.updatedAt = Date.now();
  return { ok: true };
}
function contribute(seat, amount) {
  const n = Math.max(0, Math.min(seat.stack, Math.floor(amount)));
  seat.stack -= n;
  seat.streetBet += n;
  seat.totalBet += n;
  if (seat.stack === 0) seat.allIn = true;
  return n;
}
function startHand(room) {
  const eligible = room.seats.filter(s => !s.left && s.stack > 0);
  if (eligible.length < 2) {
    room.status = 'waiting';
    room.hand = null;
    room.nextHandAt = null;
    return false;
  }
  let dealerIndex = room.dealerId ? room.seats.findIndex(s => s.id === room.dealerId) : -1;
  dealerIndex = nextIndex(room.seats, dealerIndex < 0 ? room.seats.length - 1 : dealerIndex, s => !s.left && s.stack > 0);
  const dealer = room.seats[dealerIndex];
  room.dealerId = dealer.id;
  room.handNo++;
  const deck = makeDeck();
  const hand = {
    handNo: room.handNo, deck, community: [], stage: 'preflop',
    pot: 0, currentBet: 0, minRaise: room.bigBlind,
    currentPlayer: null, pending: [], startedAt: Date.now(), turnStartedAt: Date.now(), result: null
  };
  for (const s of room.seats) {
    s.holeCards = [];
    s.streetBet = 0; s.totalBet = 0; s.folded = s.left || s.stack <= 0;
    s.allIn = false; s.lastAction = ''; 
  }
  for (let c = 0; c < 2; c++) for (const s of eligible) s.holeCards.push(deck.pop());
  let smallIndex, bigIndex;
  if (eligible.length === 2) {
    smallIndex = dealerIndex;
    bigIndex = nextIndex(room.seats, smallIndex, s => !s.left && s.stack > 0);
  } else {
    smallIndex = nextIndex(room.seats, dealerIndex, s => !s.left && s.stack > 0);
    bigIndex = nextIndex(room.seats, smallIndex, s => !s.left && s.stack > 0);
  }
  const small = room.seats[smallIndex], big = room.seats[bigIndex];
  hand.pot += contribute(small, room.smallBlind);
  hand.pot += contribute(big, room.bigBlind);
  hand.currentBet = Math.max(small.streetBet, big.streetBet);
  hand.pending = orderedSeats(room, bigIndex, s => !s.left && !s.folded && !s.allIn).map(s => s.id);
  hand.currentPlayer = hand.pending[0] || null;
  room.hand = hand;
  room.status = 'playing';
  room.nextHandAt = null;
  room.history.unshift('Mão ' + room.handNo + ' começou · blinds ' + room.smallBlind + '/' + room.bigBlind);
  room.history = room.history.slice(0, 12);
  if (hand.pending.length === 0) runOut(room);
  room.updatedAt = Date.now();
  return true;
}
function evalFive(cards) {
  const values = cards.map(c => c.v).sort((a, b) => b - a);
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const unique = [...new Set(values)];
  let straightHigh = 0;
  const sequence = unique.includes(14) ? [...unique, 1] : unique;
  for (let i = 0; i <= sequence.length - 5; i++) {
    if (sequence[i] - sequence[i + 4] === 4) { straightHigh = sequence[i] === 1 ? 5 : sequence[i]; break; }
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b)=>b-a)];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b)=>b-a)];
  return [0, ...values];
}
function compareRank(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}
function bestOfSeven(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const rank = evalFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareRank(rank, best) > 0) best = rank;
          }
  return best;
}
function finishHand(room, uncontested = false) {
  const h = room.hand;
  const potTotal = h.pot;
  const fee = room.mode === 'paid' ? Math.min(Math.floor(potTotal * (Number(room.rakePercent ?? 5) / 100)), Number(room.rakeCap ?? 100)) : 0;
  const paidOut = Math.max(0, potTotal - fee);
  const payouts = {};
  const winners = [];
  if (uncontested) {
    const winner = room.seats.find(s => !s.left && !s.folded);
    if (winner) { winner.stack += paidOut; payouts[winner.id] = paidOut; winners.push({ id: winner.id, username: winner.username }); }
  } else {
    const levels = [...new Set(room.seats.map(s => s.totalBet).filter(n => n > 0))].sort((a,b)=>a-b);
    let prev = 0, rakeLeft = fee;
    for (const level of levels) {
      const contributors = room.seats.filter(s => s.totalBet >= level);
      let layer = (level - prev) * contributors.length;
      prev = level;
      const layerFee = Math.min(layer, rakeLeft);
      layer -= layerFee; rakeLeft -= layerFee;
      const eligible = contributors.filter(s => !s.folded);
      if (!eligible.length || !layer) continue;
      const scored = eligible.map(s => ({ seat: s, rank: bestOfSeven([...s.holeCards, ...h.community]) }));
      scored.sort((a,b)=>compareRank(b.rank,a.rank));
      const best = scored[0].rank;
      const tied = scored.filter(x => compareRank(x.rank,best) === 0).map(x => x.seat);
      const each = Math.floor(layer / tied.length), odd = layer % tied.length;
      for (const seat of tied) {
        payouts[seat.id] = (payouts[seat.id] || 0) + each;
        seat.stack += each;
      }
      const tiedSet = new Set(tied.map(s=>s.id));
      const oddOrder = orderedSeats(room, room.seats.findIndex(s=>s.id===room.dealerId), s=>tiedSet.has(s.id));
      for (let i = 0; i < odd; i++) {
        const winner = oddOrder[i % oddOrder.length];
        winner.stack++;
        payouts[winner.id] = (payouts[winner.id] || 0) + 1;
      }
      for (const seat of tied) if (!winners.some(w=>w.id===seat.id)) winners.push({id:seat.id,username:seat.username});
    }
  }
  room.history.unshift(uncontested
    ? (winners[0]?.username || 'Jogador') + ' levou ' + paidOut + ' fichas (todos desistiram).'
    : 'Showdown · vencedores: ' + (winners.map(w=>w.username).join(', ') || 'sem vencedor') + ' · prêmio ' + paidOut);
  if (fee) room.history.unshift('Comissão da casa: ' + fee + ' fichas.');
  room.history = room.history.slice(0, 12);
  h.stage = 'complete';
  h.currentPlayer = null;
  h.pending = [];
  h.result = { winners, payouts, rake: fee, pot: potTotal };
  room.status = 'waiting';
  room.nextHandAt = Date.now() + 6500;
  room.updatedAt = Date.now();
  for (const seat of room.seats) seat.totalHands = (seat.totalHands || 0) + 1;
  return h.result;
}
function runOut(room) {
  const h = room.hand;
  while (h.community.length < 5) {
    if (h.community.length === 0) h.community.push(h.deck.pop(), h.deck.pop(), h.deck.pop());
    else h.community.push(h.deck.pop());
  }
  return finishHand(room, false);
}
function advanceStreet(room) {
  const h = room.hand;
  const index = streets.indexOf(h.stage);
  if (index >= streets.length - 1) return finishHand(room, false);
  const next = streets[index + 1];
  if (next === 'flop') h.community.push(h.deck.pop(), h.deck.pop(), h.deck.pop());
  else h.community.push(h.deck.pop());
  h.stage = next;
  h.currentBet = 0;
  h.minRaise = room.bigBlind;
  for (const s of room.seats) s.streetBet = 0;
  h.pending = orderedSeats(room, room.seats.findIndex(s=>s.id===room.dealerId), s => !s.left && !s.folded && !s.allIn).map(s=>s.id);
  h.currentPlayer = h.pending[0] || null;
  h.turnStartedAt = Date.now();
  if (h.pending.length === 0) return runOut(room);
}
function applyAction(room, playerId, action) {
  const h = room.hand;
  if (!h || room.status !== 'playing' || !h.currentPlayer) return { error: 'A mão não está aceitando jogadas.' };
  const seat = room.seats.find(s => s.playerId === playerId && !s.left);
  if (!seat || seat.id !== h.currentPlayer) return { error: 'Ainda não é sua vez.' };
  const type = seat.leaveAfterHand ? 'fold' : String(action?.type || '');
  const callAmount = Math.max(0, h.currentBet - seat.streetBet);
  if (type === 'fold') {
    seat.folded = true; seat.lastAction = 'Desistiu';
    room.history.unshift(seat.username + ' desistiu.');
    h.pending = h.pending.filter(id=>id!==seat.id);
  } else if (type === 'check' || type === 'call') {
    if (type === 'check' && callAmount > 0) return { error: 'Você precisa pagar ou desistir.' };
    const n = contribute(seat, type === 'call' ? callAmount : 0);
    h.pot += n;
    seat.lastAction = type === 'call' ? 'Pagou ' + n : 'Mesa';
    room.history.unshift(seat.username + (type === 'call' ? ' pagou ' + n : ' deu mesa') + '.');
    h.pending = h.pending.filter(id=>id!==seat.id);
  } else if (type === 'raise' || type === 'bet' || type === 'allin') {
    const maxTarget = seat.streetBet + seat.stack;
    const target = type === 'allin' ? maxTarget : Math.floor(Number(action.amount));
    if (!Number.isFinite(target) || target <= seat.streetBet || target > maxTarget) return { error: 'Valor de aposta inválido.' };
    const oldBet = h.currentBet;
    const isAllIn = type === 'allin';
    const raiseBy = target - oldBet;
    const isRaise = target > oldBet;
    if (isRaise && raiseBy < h.minRaise && !isAllIn) return { error: 'Aumente pelo menos ' + h.minRaise + ' fichas acima da aposta atual.' };
    const n = contribute(seat, target - seat.streetBet);
    h.pot += n;
    if (isRaise) {
      h.currentBet = seat.streetBet;
      if (raiseBy >= h.minRaise) h.minRaise = raiseBy;
      seat.lastAction = (oldBet === 0 ? 'Apostou ' : 'Aumentou para ') + h.currentBet;
      room.history.unshift(seat.username + ' ' + seat.lastAction.toLowerCase() + '.');
      h.pending = orderedSeats(room, room.seats.findIndex(s=>s.id===seat.id), s => !s.left && !s.folded && !s.allIn && s.streetBet < h.currentBet).map(s=>s.id);
    } else {
      seat.lastAction = 'All-in para pagar ' + n;
      room.history.unshift(seat.username + ' foi all-in para pagar.');
      h.pending = h.pending.filter(id=>id!==seat.id);
    }
  } else return { error: 'Jogada desconhecida.' };

  room.history = room.history.slice(0, 12);
  const contenders = room.seats.filter(s=>!s.left && !s.folded);
  if (contenders.length === 1) finishHand(room, true);
  else {
    const canAct = contenders.filter(s=>!s.allIn);
    if (!canAct.length) runOut(room);
    else if (!h.pending.length) advanceStreet(room);
    else { h.currentPlayer = h.pending[0]; h.turnStartedAt = Date.now(); }
  }
  room.updatedAt = Date.now();
  return { ok: true, finished: room.hand.stage === 'complete', result: room.hand.result };
}
function publicRoom(room, playerId) {
  const h = room.hand;
  const me = room.seats.find(s=>s.playerId===playerId && !s.left);
  return {
    id: room.id, code: room.code, name: room.name, mode: room.mode, status: room.status,
    maxPlayers: room.maxPlayers, buyIn: room.buyIn, smallBlind: room.smallBlind, bigBlind: room.bigBlind,
    handNo: room.handNo, dealerId: room.dealerId, nextHandAt: room.nextHandAt,
    players: room.seats.filter(s=>!s.left).map(s=>({
      id:s.id, username:s.username, stack:s.stack, streetBet:s.streetBet||0,
      folded:!!s.folded, allIn:!!s.allIn, lastAction:s.lastAction||'',
      isMe:s.playerId===playerId, isDealer:s.id===room.dealerId,
      cards: (!h || h.stage==='complete' || s.playerId===playerId) ? (s.holeCards||[]) : []
    })),
    hand: h ? {
      handNo:h.handNo, stage:h.stage, community:h.community, pot:h.pot,
      currentBet:h.currentBet, minRaise:h.minRaise,
      currentPlayer: h.currentPlayer,
      myCards: me ? (me.holeCards||[]) : [],
      callAmount: me ? Math.max(0,h.currentBet-(me.streetBet||0)) : 0,
      myTurn: !!(me && h.currentPlayer===me.id),
      result:h.result
    } : null,
    history: room.history.slice(0,12)
  };
}

module.exports = { freshRoom, addSeat, startHand, applyAction, publicRoom, makeDeck, bestOfSeven, compareRank, finishHand };
