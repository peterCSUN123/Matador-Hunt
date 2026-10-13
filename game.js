// Game rules are separate from the page so they are easy to read and change.
(function () {
  'use strict';

  const LOCK_DURATION_MS = 24 * 60 * 60 * 1000;
  const MAX_WRONG_ANSWERS = 3;
  const MAX_HINTS = 3;

  function newProgress() {
    return { attempts: 0, hintsUsed: 0, lockedUntil: null, solvedAt: null, points: 0 };
  }

  function currentProgress(saved, now = Date.now()) {
    const progress = { ...newProgress(), ...(saved || {}) };
    if (progress.lockedUntil && now >= progress.lockedUntil) {
      progress.attempts = 0;
      progress.lockedUntil = null;
    }
    return progress;
  }

  function normalizeAnswer(value) {
    return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function pointsForHints(hintsUsed) {
    return 10 - (hintsUsed * (hintsUsed + 1)) / 2;
  }

  function useHint(saved, riddle, now = Date.now()) {
    const progress = currentProgress(saved, now);
    if (progress.solvedAt) return { progress, status: 'solved' };
    if (progress.lockedUntil) return { progress, status: 'locked' };
    if (progress.hintsUsed >= MAX_HINTS) return { progress, status: 'no_hints' };
    const hint = riddle.hints[progress.hintsUsed];
    progress.hintsUsed += 1;
    return { progress, status: 'hint', hint };
  }

  function submitAnswer(saved, riddle, answer, now = Date.now()) {
    const progress = currentProgress(saved, now);
    if (progress.solvedAt) return { progress, status: 'solved' };
    if (progress.lockedUntil) return { progress, status: 'locked' };
    const submitted = normalizeAnswer(answer);
    if (!submitted) return { progress, status: 'empty' };

    if (riddle.answers.some((validAnswer) => normalizeAnswer(validAnswer) === submitted)) {
      progress.solvedAt = now;
      progress.points = pointsForHints(progress.hintsUsed);
      return { progress, status: 'correct', points: progress.points };
    }

    progress.attempts += 1;
    if (progress.attempts >= MAX_WRONG_ANSWERS) {
      progress.lockedUntil = now + LOCK_DURATION_MS;
      return { progress, status: 'locked', lockedUntil: progress.lockedUntil };
    }
    return { progress, status: 'incorrect', remaining: MAX_WRONG_ANSWERS - progress.attempts };
  }

  function totalScore(player) {
    return Object.values(player.progress || {}).reduce((sum, result) => sum + (result.points || 0), 0);
  }

  window.MatadorGame = {
    LOCK_DURATION_MS, newProgress, currentProgress, pointsForHints,
    useHint, submitAnswer, totalScore
  };
}());
