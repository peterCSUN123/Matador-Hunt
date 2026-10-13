(function () {
  'use strict';

  const STORAGE_KEY = 'matador-hunt-players-v1';
  const riddles = window.MATADOR_RIDDLES;
  const game = window.MatadorGame;
  const $ = (selector) => document.querySelector(selector);

  function emptyState() {
    return { activePlayer: null, players: {} };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && parsed.players && typeof parsed.players === 'object') return parsed;
    } catch (_) {
      // The game still works if browser storage is unavailable.
    }
    return emptyState();
  }

  const state = loadState();
  let activeRiddleId = riddles[0]?.id ?? null;
  let activeTab = 'riddles';
  let toastTimer;

  function notify(message, error = false) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      notify('Your browser could not save progress. Changes may disappear after closing this page.', true);
    }
  }

  function element(tag, text, className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function player() {
    return state.players[state.activePlayer];
  }

  function keyFor(name) {
    return `player:${name.toLowerCase()}`;
  }

  function usePlayer(name) {
    const displayName = name.trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(displayName)) {
      notify('Use 2 to 20 letters, numbers, spaces, underscores, or dashes.', true);
      return;
    }
    const key = keyFor(displayName);
    if (!state.players[key]) {
      state.players[key] = { name: displayName, theme: 'crimson', createdAt: Date.now(), progress: {} };
    }
    state.activePlayer = key;
    activeRiddleId = riddles[0]?.id ?? null;
    activeTab = 'riddles';
    saveState();
    render();
  }

  function getProgress(riddleId) {
    const saved = player().progress[riddleId];
    const current = game.currentProgress(saved);
    if (saved && saved.lockedUntil && !current.lockedUntil) {
      player().progress[riddleId] = current;
      saveState();
    }
    return current;
  }

  function renderEntry() {
    const entries = Object.values(state.players).sort((a, b) => b.createdAt - a.createdAt);
    $('#recent-players').hidden = entries.length === 0;
    const list = $('#recent-list');
    list.replaceChildren();
    for (const entry of entries) {
      const button = element('button', entry.name);
      button.type = 'button';
      button.addEventListener('click', () => usePlayer(entry.name));
      list.append(button);
    }
  }

  function renderRiddleList() {
    const list = $('#riddle-list');
    list.replaceChildren();
    const solved = riddles.filter((riddle) => getProgress(riddle.id).solvedAt).length;
    $('#completed-count').textContent = `${solved} of ${riddles.length} solved`;
    $('#finish-banner').hidden = solved !== riddles.length || riddles.length === 0;

    for (const riddle of riddles) {
      const progress = getProgress(riddle.id);
      const tile = element('button', '', 'riddle-tile');
      tile.type = 'button';
      tile.classList.toggle('active', riddle.id === activeRiddleId);
      tile.append(element('span', riddle.zone, 'zone'));
      tile.append(element('strong', riddle.title));
      const status = progress.solvedAt
        ? `Solved · +${progress.points} points`
        : progress.lockedUntil ? 'Locked for 24 hours' : 'Ready to solve';
      tile.append(element('span', status, 'state'));
      tile.addEventListener('click', () => {
        activeRiddleId = riddle.id;
        renderRiddleList();
        renderDetail();
      });
      list.append(tile);
    }
  }

  function renderDetail() {
    const panel = $('#riddle-detail');
    panel.replaceChildren();
    const riddle = riddles.find((entry) => entry.id === activeRiddleId);
    if (!riddle) {
      panel.append(element('p', 'Add your first riddle in riddles.js.'));
      return;
    }

    const progress = getProgress(riddle.id);
    panel.append(element('span', riddle.zone, 'eyebrow'));
    panel.append(element('h3', riddle.title));
    panel.append(element('p', riddle.prompt));

    const hintBox = element('div', '', 'hint-box');
    hintBox.append(element('h4', `Hints: ${progress.hintsUsed} / 3`));
    hintBox.append(element('p', 'Hints reduce the possible 10 points by 1, then 2, then 3.'));
    if (progress.hintsUsed) {
      const list = document.createElement('ol');
      for (const hint of riddle.hints.slice(0, progress.hintsUsed)) list.append(element('li', hint));
      hintBox.append(list);
    }
    if (!progress.solvedAt && !progress.lockedUntil && progress.hintsUsed < 3) {
      const hintButton = element('button', 'Reveal next hint', 'small-button');
      hintButton.type = 'button';
      hintButton.addEventListener('click', () => {
        const result = game.useHint(getProgress(riddle.id), riddle);
        if (result.status === 'hint') {
          player().progress[riddle.id] = result.progress;
          saveState();
          render();
          notify('Hint revealed.');
        } else notify('No hint available right now.', true);
      });
      hintBox.append(hintButton);
    }
    panel.append(hintBox);

    if (progress.solvedAt) {
      panel.append(element('p', `Solved! You earned ${progress.points} points.`, 'status-note'));
      return;
    }
    if (progress.lockedUntil) {
      const until = new Date(progress.lockedUntil).toLocaleString();
      panel.append(element('p', `Three incorrect answers. Try again after ${until}.`, 'status-note'));
      return;
    }
    if (progress.attempts) {
      panel.append(element('p', `${3 - progress.attempts} wrong attempt(s) remaining.`, 'status-note'));
    }

    const form = element('form', '', 'answer-form');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 100;
    input.required = true;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your answer');
    input.placeholder = 'Type your answer';
    const submit = element('button', 'Submit answer', 'button button-primary');
    submit.type = 'submit';
    form.append(input, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = game.submitAnswer(getProgress(riddle.id), riddle, input.value);
      if (result.status === 'empty') { notify('Enter an answer first.', true); return; }
      player().progress[riddle.id] = result.progress;
      saveState();
      render();
      if (result.status === 'correct') notify(`Correct! +${result.points} points.`);
      else if (result.status === 'incorrect') notify(`Not quite. ${result.remaining} attempt(s) left.`, true);
      else if (result.status === 'locked') notify('Third wrong answer: locked for 24 hours.', true);
    });
    panel.append(form);
  }

  function renderProgress() {
    const list = $('#progress-list');
    list.replaceChildren();
    for (const riddle of riddles) {
      const progress = getProgress(riddle.id);
      const row = element('div', '', 'row');
      row.append(element('strong', riddle.title));
      row.append(element('span', progress.solvedAt ? `Completed · +${progress.points} points` : 'Not completed yet'));
      list.append(row);
    }
  }

  function renderLeaderboard() {
    const list = $('#leaderboard-list');
    list.replaceChildren();
    const ranked = Object.values(state.players)
      .sort((a, b) => game.totalScore(b) - game.totalScore(a) || a.createdAt - b.createdAt);
    for (const [index, entry] of ranked.entries()) {
      const row = element('div', '', 'row');
      row.append(element('strong', `${index + 1}. ${entry.name}`));
      row.append(element('span', `${game.totalScore(entry)} points`));
      list.append(row);
    }
  }

  function showTab(name) {
    activeTab = name;
    for (const button of document.querySelectorAll('[data-tab]')) {
      const selected = button.dataset.tab === name;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const tab of ['riddles', 'progress', 'leaderboard', 'settings']) {
      $(`#${tab}-panel`).hidden = tab !== name;
    }
  }

  function render() {
    const current = player();
    $('#entry-view').hidden = Boolean(current);
    $('#game-view').hidden = !current;
    $('#switch-player').hidden = !current;
    if (!current) { renderEntry(); return; }

    document.body.dataset.theme = current.theme === 'midnight' ? 'midnight' : 'crimson';
    $('#theme-select').value = document.body.dataset.theme;
    $('#player-name').textContent = current.name;
    $('#total-score').textContent = game.totalScore(current);
    renderRiddleList();
    renderDetail();
    renderProgress();
    renderLeaderboard();
    showTab(activeTab);
  }

  $('#player-form').addEventListener('submit', (event) => {
    event.preventDefault();
    usePlayer($('#player-input').value);
    $('#player-form').reset();
  });
  $('#switch-player').addEventListener('click', () => {
    state.activePlayer = null;
    saveState();
    render();
  });
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.tab));
  });
  $('#theme-select').addEventListener('change', (event) => {
    player().theme = event.target.value;
    saveState();
    render();
    notify('Theme saved for this player.');
  });
  $('#reset-progress').addEventListener('click', () => {
    if (!confirm(`Reset all progress for ${player().name}?`)) return;
    player().progress = {};
    saveState();
    render();
    notify('Your progress has been reset.');
  });

  render();
}());
