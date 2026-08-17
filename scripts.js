"use strict";

const PLAYER = "X";
const AI = "O";
const STORAGE_KEY = "jogo-da-velha-v2-score";
const AI_DELAY_MS = 260;
const NEXT_ROUND_DELAY_MS = 1800;

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const boardElement = document.querySelector("#board");
const cells = Array.from(document.querySelectorAll(".cell"));
const statusElement = document.querySelector("#status");
const turnBanner = document.querySelector("#turn-banner");
const scorePlayer = document.querySelector("#score-player");
const scoreDraw = document.querySelector("#score-draw");
const scoreAi = document.querySelector("#score-ai");
const roundNumberElement = document.querySelector("#round-number");
const starterNote = document.querySelector("#starter-note");
const newRoundButton = document.querySelector("#new-round");
const resetScoreButton = document.querySelector("#reset-score");
const difficultyInputs = Array.from(document.querySelectorAll('input[name="difficulty"]'));

let board = Array(9).fill(null);
let scores = loadScores();
let round = 1;
let currentTurn = PLAYER;
let roundOver = false;
let aiThinking = false;
let aiTimer = null;
let roundTimer = null;

function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved &&
      Number.isInteger(saved.player) &&
      Number.isInteger(saved.draw) &&
      Number.isInteger(saved.ai)
    ) {
      return saved;
    }
  } catch {
    // A partida continua normalmente quando o armazenamento está indisponível.
  }

  return { player: 0, draw: 0, ai: 0 };
}

function saveScores() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Salvar o placar é opcional e nunca deve interromper o jogo.
  }
}

function getDifficulty() {
  return difficultyInputs.find((input) => input.checked)?.value ?? "estrategica";
}

function getResult(state = board) {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (state[a] && state[a] === state[b] && state[a] === state[c]) {
      return { winner: state[a], line };
    }
  }

  return state.every(Boolean) ? { winner: "draw", line: [] } : null;
}

function getAvailableMoves(state = board) {
  const moves = [];
  for (let index = 0; index < state.length; index += 1) {
    if (state[index] === null) moves.push(index);
  }
  return moves;
}

function findImmediateMove(mark) {
  for (const index of getAvailableMoves()) {
    board[index] = mark;
    const wins = getResult(board)?.winner === mark;
    board[index] = null;
    if (wins) return index;
  }
  return null;
}

function minimax(state, maximizing, depth = 0, cache = new Map()) {
  const result = getResult(state);
  if (result?.winner === AI) return 10 - depth;
  if (result?.winner === PLAYER) return depth - 10;
  if (result?.winner === "draw") return 0;

  const cacheKey = `${state.map((cell) => cell ?? "-").join("")}:${maximizing}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let bestScore = maximizing ? -Infinity : Infinity;
  const mark = maximizing ? AI : PLAYER;

  for (const index of getAvailableMoves(state)) {
    state[index] = mark;
    const score = minimax(state, !maximizing, depth + 1, cache);
    state[index] = null;
    bestScore = maximizing ? Math.max(bestScore, score) : Math.min(bestScore, score);
  }

  cache.set(cacheKey, bestScore);
  return bestScore;
}

function getOptimalMove() {
  let bestScore = -Infinity;
  let bestMoves = [];
  const cache = new Map();

  for (const index of getAvailableMoves()) {
    board[index] = AI;
    const score = minimax(board, false, 0, cache);
    board[index] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [index];
    } else if (score === bestScore) {
      bestMoves.push(index);
    }
  }

  return randomItem(bestMoves);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseAiMove() {
  const available = getAvailableMoves();
  if (available.length === 0) return null;

  const winningMove = findImmediateMove(AI);
  if (winningMove !== null) return winningMove;

  const difficulty = getDifficulty();
  const blockingMove = findImmediateMove(PLAYER);

  if (difficulty === "casual") {
    if (blockingMove !== null && Math.random() < 0.62) return blockingMove;
    return Math.random() < 0.42 ? getOptimalMove() : randomItem(available);
  }

  if (difficulty === "estrategica") {
    if (blockingMove !== null) return blockingMove;
    return Math.random() < 0.86 ? getOptimalMove() : randomItem(available);
  }

  return getOptimalMove();
}

function setStatus(message, state = "playing") {
  statusElement.textContent = message;
  turnBanner.dataset.state = state;
}

function updateScoreboard() {
  scorePlayer.textContent = String(scores.player);
  scoreDraw.textContent = String(scores.draw);
  scoreAi.textContent = String(scores.ai);
  roundNumberElement.textContent = String(round).padStart(2, "0");
}

function updateCells() {
  cells.forEach((cell, index) => {
    const mark = board[index];
    cell.textContent = mark ?? "";
    cell.dataset.mark = mark ?? "";
    cell.disabled = Boolean(mark) || roundOver || aiThinking || currentTurn !== PLAYER;
    cell.setAttribute(
      "aria-label",
      `Linha ${Math.floor(index / 3) + 1}, coluna ${(index % 3) + 1}: ${mark ?? "vazia"}`,
    );
  });

  boardElement.setAttribute("aria-busy", String(aiThinking));
}

function finishRound(result) {
  roundOver = true;
  aiThinking = false;

  if (result.winner === PLAYER) {
    scores.player += 1;
    setStatus("Você venceu! Próxima rodada em instantes…", "win");
  } else if (result.winner === AI) {
    scores.ai += 1;
    setStatus("A IA venceu. Próxima rodada em instantes…", "loss");
  } else {
    scores.draw += 1;
    setStatus("Empate. Próxima rodada em instantes…", "draw");
  }

  result.line.forEach((index) => cells[index].classList.add("is-winning"));
  saveScores();
  updateScoreboard();
  updateCells();
  scheduleNextRound();
}

function scheduleNextRound() {
  window.clearTimeout(roundTimer);
  roundTimer = window.setTimeout(() => startRound(), NEXT_ROUND_DELAY_MS);
}

function evaluateRound() {
  const result = getResult();
  if (result) {
    finishRound(result);
    return true;
  }
  return false;
}

function makeMove(index, mark) {
  if (board[index] !== null || roundOver) return false;
  board[index] = mark;
  updateCells();
  return evaluateRound();
}

function scheduleAiMove() {
  if (roundOver) return;

  currentTurn = AI;
  aiThinking = true;
  setStatus("A IA está analisando o tabuleiro…", "thinking");
  updateCells();

  window.clearTimeout(aiTimer);
  aiTimer = window.setTimeout(() => {
    const move = chooseAiMove();
    aiThinking = false;

    if (move !== null && !roundOver) {
      const ended = makeMove(move, AI);
      if (!ended) {
        currentTurn = PLAYER;
        setStatus("Sua vez — escolha uma casa");
        updateCells();
        focusFirstAvailableCell();
      }
    }
  }, AI_DELAY_MS);
}

function handleCellClick(event) {
  const cell = event.target.closest(".cell");
  if (!cell || aiThinking || roundOver || currentTurn !== PLAYER) return;

  const index = Number(cell.dataset.index);
  const ended = makeMove(index, PLAYER);
  if (!ended) scheduleAiMove();
}

function focusFirstAvailableCell() {
  const firstAvailable = cells.find((cell, index) => board[index] === null && !cell.disabled);
  firstAvailable?.focus({ preventScroll: true });
}

function startRound({ advance = true } = {}) {
  window.clearTimeout(aiTimer);
  window.clearTimeout(roundTimer);
  if (advance) round += 1;

  board = Array(9).fill(null);
  roundOver = false;
  aiThinking = false;
  cells.forEach((cell) => cell.classList.remove("is-winning"));

  const playerStarts = round % 2 === 1;
  currentTurn = playerStarts ? PLAYER : AI;
  starterNote.textContent = playerStarts ? "Você começa esta rodada." : "A IA começa esta rodada.";
  updateScoreboard();
  updateCells();

  if (playerStarts) {
    setStatus("Sua vez — escolha uma casa");
    focusFirstAvailableCell();
  } else {
    scheduleAiMove();
  }
}

function resetScore() {
  scores = { player: 0, draw: 0, ai: 0 };
  round = 1;
  saveScores();
  startRound({ advance: false });
  setStatus("Placar zerado — sua vez");
}

function handleBoardKeyboard(event) {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

  const currentCell = event.target.closest(".cell");
  if (!currentCell) return;
  event.preventDefault();

  const index = Number(currentCell.dataset.index);
  const offsets = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 };
  let nextIndex = index + offsets[event.key];

  if (event.key === "ArrowLeft" && index % 3 === 0) nextIndex = index + 2;
  if (event.key === "ArrowRight" && index % 3 === 2) nextIndex = index - 2;
  if (nextIndex < 0) nextIndex += 9;
  if (nextIndex > 8) nextIndex -= 9;

  cells[nextIndex].focus();
}

boardElement.addEventListener("click", handleCellClick);
boardElement.addEventListener("keydown", handleBoardKeyboard);
newRoundButton.addEventListener("click", () => startRound());
resetScoreButton.addEventListener("click", resetScore);

difficultyInputs.forEach((input) => {
  input.addEventListener("change", () => {
    startRound({ advance: false });
    if (currentTurn === PLAYER) {
      setStatus(`Nível ${input.nextElementSibling.textContent.toLowerCase()} selecionado — sua vez`);
    }
  });
});

updateScoreboard();
updateCells();
