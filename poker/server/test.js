'use strict';
const assert = require('node:assert/strict');
const { bestOfSeven, compareRank, makeDeck, freshRoom, addSeat, startHand, applyAction } = require('./game');

const deck = makeDeck();
assert.equal(deck.length, 52);
assert.equal(new Set(deck.map(c=>c.rank+c.suit)).size, 52);

const royal = ['10♠','J♠','Q♠','K♠','A♠'].map(x=>({rank:x.slice(0,-1),suit:x.slice(-1),v:({10:10,J:11,Q:12,K:13,A:14})[x.slice(0,-1)]}));
const straightFlush = bestOfSeven([...royal,{rank:'2',suit:'♥',v:2},{rank:'3',suit:'♦',v:3}]);
assert.equal(straightFlush[0], 8);
const quads = bestOfSeven([
  {rank:'A',suit:'♠',v:14},{rank:'A',suit:'♥',v:14},{rank:'A',suit:'♦',v:14},
  {rank:'A',suit:'♣',v:14},{rank:'K',suit:'♠',v:13},{rank:'2',suit:'♥',v:2},{rank:'3',suit:'♦',v:3}
]);
assert.equal(quads[0],7);
assert(compareRank(straightFlush,quads)>0);

const room=freshRoom({id:'t1',code:'ABC234',ownerId:'p1',ownerName:'Ana'});
assert.equal(addSeat(room,'p2','Bia',500).ok,true);
startHand(room);
assert.equal(room.status,'playing');
assert.equal(room.hand.stage,'preflop');
assert.equal(room.hand.pot,15);
assert(room.hand.currentPlayer);
for(let i=0;i<12 && room.hand.stage!=='complete';i++){
  const who=room.seats.find(s=>s.id===room.hand.currentPlayer);
  const result=applyAction(room,who.playerId,{type:room.hand.currentBet>who.streetBet?'call':'check'});
  assert.equal(result.ok,true);
}
assert(room.hand.stage==='complete' || room.hand.pot>15);
console.log('Poker Arena: testes do baralho, ranking de mãos e fluxo inicial passaram.');
