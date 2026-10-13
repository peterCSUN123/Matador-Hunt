const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(readFileSync(join(__dirname, '../site/game.js'), 'utf8'), context);
const game = context.window.MatadorGame;
const clue = { answers: ['clock', 'a clock'], hints: ['One', 'Two', 'Three'] };

test('three hints cost 1, 2, and 3 points', () => {
  let progress = game.newProgress();
  for (let number = 1; number <= 3; number += 1) {
    const result = game.useHint(progress, clue, 1000);
    assert.equal(result.status, 'hint');
    progress = result.progress;
    assert.equal(progress.hintsUsed, number);
  }
  assert.equal(game.useHint(progress, clue, 1000).status, 'no_hints');
  const solved = game.submitAnswer(progress, clue, 'A CLOCK', 1001);
  assert.equal(solved.status, 'correct');
  assert.equal(solved.points, 4);
  assert.equal(game.pointsForHints(0), 10);
});

test('third incorrect answer locks for exactly 24 hours; later attempts reset', () => {
  let progress = game.newProgress();
  for (let number = 1; number <= 3; number += 1) {
    const result = game.submitAnswer(progress, clue, 'wrong', 5000);
    progress = result.progress;
    assert.equal(result.status, number === 3 ? 'locked' : 'incorrect');
  }
  assert.equal(progress.lockedUntil, 5000 + game.LOCK_DURATION_MS);
  assert.equal(game.submitAnswer(progress, clue, 'clock', 5001).status, 'locked');
  const afterExpiry = game.submitAnswer(progress, clue, 'clock', progress.lockedUntil);
  assert.equal(afterExpiry.status, 'correct');
  assert.equal(afterExpiry.progress.attempts, 0);
});

test('a solved riddle cannot award points a second time', () => {
  const first = game.submitAnswer(game.newProgress(), clue, 'clock', 7000);
  const second = game.submitAnswer(first.progress, clue, 'clock', 8000);
  assert.equal(first.points, 10);
  assert.equal(second.status, 'solved');
  assert.equal(game.totalScore({ progress: { clock: second.progress } }), 10);
});
