const pieces = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚",
};

const pieceValues = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
};

const promotionPieces = ["q", "r", "b", "n"];
const boardFiles = ["a", "b", "c", "d", "e", "f", "g", "h"];
const boardRanks = ["1", "2", "3", "4", "5", "6", "7", "8"];

const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const moveListEl = document.querySelector("#move-list");
const moveCountEl = document.querySelector("#move-count");
const capturedWhiteEl = document.querySelector("#captured-white");
const capturedBlackEl = document.querySelector("#captured-black");
const flipButton = document.querySelector("#flip-board");
const undoButton = document.querySelector("#undo-move");
const resetButton = document.querySelector("#reset-game");

let game;
let selectedSquare = null;
let legalMoves = [];
let flipped = false;

function waitForChess() {
  if (window.Chess) {
    game = new window.Chess();
    render();
    return;
  }

  boardEl.className = "loading";
  boardEl.textContent = "Loading board...";
  setTimeout(() => {
    if (window.Chess) {
      game = new window.Chess();
      render();
    } else {
      boardEl.className = "error";
      boardEl.textContent = "Chess engine could not load.";
    }
  }, 700);
}

function getFiles() {
  const files = [...boardFiles];
  return flipped ? files.reverse() : files;
}

function getRanks() {
  const ranks = [...boardRanks].reverse();
  return flipped ? ranks.reverse() : ranks;
}

function getSquares() {
  return getRanks().flatMap((rank) => getFiles().map((file) => `${file}${rank}`));
}

function getBoardSquares() {
  return [...boardRanks].reverse().flatMap((rank) => boardFiles.map((file) => `${file}${rank}`));
}

function renderCoordinates() {
  document.querySelectorAll(".files").forEach((el) => {
    el.innerHTML = getFiles()
      .map((file) => `<span>${file}</span>`)
      .join("");
  });

  document.querySelectorAll(".ranks").forEach((el) => {
    el.innerHTML = getRanks()
      .map((rank) => `<span>${rank}</span>`)
      .join("");
  });
}

function render() {
  if (!game) return;

  boardEl.className = "board";
  boardEl.innerHTML = "";
  renderCoordinates();

  const legalTargets = new Map(legalMoves.map((move) => [move.to, move]));
  const attackCounts = getAttackCounts();
  const strongestAttack = Math.max(1, ...attackCounts.values());

  getSquares().forEach((square) => {
    const piece = game.get(square);
    const attackCount = attackCounts.get(square) || 0;
    const button = document.createElement("button");
    const fileIndex = square.charCodeAt(0) - 97;
    const rankIndex = Number(square[1]) - 1;
    const colorClass = (fileIndex + rankIndex) % 2 === 0 ? "dark" : "light";
    const legalMove = legalTargets.get(square);

    button.type = "button";
    button.className = `square ${colorClass}`;
    button.dataset.square = square;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", square);

    if (attackCount) {
      button.classList.add("attacked");
      button.style.setProperty("--attack-alpha", getAttackAlpha(attackCount, strongestAttack));
      button.title = `${square}: attacked by ${attackCount} piece${attackCount === 1 ? "" : "s"}`;
    }
    if (selectedSquare === square) button.classList.add("selected");
    if (legalMove) button.classList.add(/[ce]/.test(legalMove.flags) ? "capture" : "legal");
    if (piece) {
      const pieceEl = document.createElement("span");
      pieceEl.className = "piece";
      pieceEl.textContent = pieces[`${piece.color}${piece.type}`];
      button.appendChild(pieceEl);
    }

    button.addEventListener("click", () => handleSquareClick(square));
    boardEl.appendChild(button);
  });

  updateStatus();
  updateHistory();
  updateCaptured();
}

function getAttackAlpha(count, strongestAttack) {
  const intensity = count / strongestAttack;
  return String(Math.min(0.76, 0.16 + intensity * 0.52));
}

function getAttackCounts() {
  const counts = new Map();

  getBoardSquares().forEach((square) => {
    const piece = game.get(square);
    if (!piece) return;

    getAttackedSquares(square, piece).forEach((attackedSquare) => {
      counts.set(attackedSquare, (counts.get(attackedSquare) || 0) + 1);
    });
  });

  return counts;
}

function getAttackedSquares(square, piece) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;

  if (piece.type === "p") {
    const direction = piece.color === "w" ? 1 : -1;
    return [
      toSquare(file - 1, rank + direction),
      toSquare(file + 1, rank + direction),
    ].filter(Boolean);
  }

  if (piece.type === "n") {
    return [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ]
      .map(([fileStep, rankStep]) => toSquare(file + fileStep, rank + rankStep))
      .filter(Boolean);
  }

  if (piece.type === "k") {
    return [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]
      .map(([fileStep, rankStep]) => toSquare(file + fileStep, rank + rankStep))
      .filter(Boolean);
  }

  const directions = {
    b: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
    r: [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ],
    q: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ],
  };

  return directions[piece.type].flatMap(([fileStep, rankStep]) =>
    getRayAttacks(file, rank, fileStep, rankStep),
  );
}

function getRayAttacks(file, rank, fileStep, rankStep) {
  const attackedSquares = [];
  let nextFile = file + fileStep;
  let nextRank = rank + rankStep;

  while (isOnBoard(nextFile, nextRank)) {
    const square = toSquare(nextFile, nextRank);
    attackedSquares.push(square);
    if (game.get(square)) break;
    nextFile += fileStep;
    nextRank += rankStep;
  }

  return attackedSquares;
}

function toSquare(file, rank) {
  if (!isOnBoard(file, rank)) return null;
  return `${boardFiles[file]}${boardRanks[rank]}`;
}

function isOnBoard(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function handleSquareClick(square) {
  const piece = game.get(square);

  if (!selectedSquare) {
    selectSquare(square);
    return;
  }

  if (selectedSquare === square) {
    clearSelection();
    render();
    return;
  }

  const matchingMove = legalMoves.find((move) => move.to === square);
  if (matchingMove) {
    movePiece(matchingMove);
    return;
  }

  if (piece && piece.color === game.turn()) {
    selectSquare(square);
    return;
  }

  clearSelection();
  render();
}

function selectSquare(square) {
  const piece = game.get(square);
  if (!piece || piece.color !== game.turn()) {
    return;
  }

  selectedSquare = square;
  legalMoves = game.moves({ square, verbose: true });
  render();
}

function movePiece(move) {
  const promotion = move.flags.includes("p") ? choosePromotion(move.color) : undefined;
  game.move({
    from: move.from,
    to: move.to,
    promotion,
  });
  clearSelection();
  render();
}

function choosePromotion(color) {
  const label = color === "w" ? "White" : "Black";
  const choice = window.prompt(`${label} promotes to queen, rook, bishop, or knight`, "queen");
  const normalized = (choice || "queen").toLowerCase().trim()[0];
  return promotionPieces.includes(normalized) ? normalized : "q";
}

function clearSelection() {
  selectedSquare = null;
  legalMoves = [];
}

function updateStatus() {
  const turn = game.turn() === "w" ? "White" : "Black";

  if (game.in_checkmate()) {
    statusEl.textContent = `Checkmate, ${turn === "White" ? "black" : "white"} wins`;
    return;
  }

  if (game.in_stalemate()) {
    statusEl.textContent = "Stalemate";
    return;
  }

  if (game.in_draw()) {
    statusEl.textContent = "Draw";
    return;
  }

  statusEl.textContent = `${turn} to move${game.in_check() ? ", check" : ""}`;
}

function updateHistory() {
  const history = game.history();
  moveCountEl.textContent = history.length;
  moveListEl.innerHTML = "";

  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement("li");
    row.className = "move-row";
    row.innerHTML = `<span>${i / 2 + 1}.</span><span>${history[i] || ""}</span><span>${history[i + 1] || ""}</span>`;
    moveListEl.appendChild(row);
  }

  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function updateCaptured() {
  const captured = getCapturedPieces();
  capturedWhiteEl.textContent = captured.white.map((type) => pieces[`w${type}`]).join(" ");
  capturedBlackEl.textContent = captured.black.map((type) => pieces[`b${type}`]).join(" ");
}

function getCapturedPieces() {
  const starting = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const remaining = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };

  getBoardSquares().forEach((square) => {
    const piece = game.get(square);
    if (!piece || piece.type === "k") return;
    const color = piece.color === "w" ? "white" : "black";
    remaining[color][piece.type] += 1;
  });

  return {
    white: missingPieces(starting, remaining.white),
    black: missingPieces(starting, remaining.black),
  };
}

function missingPieces(starting, remaining) {
  return Object.keys(starting)
    .flatMap((type) => Array(Math.max(0, starting[type] - remaining[type])).fill(type))
    .sort((a, b) => pieceValues[a] - pieceValues[b]);
}

flipButton.addEventListener("click", () => {
  flipped = !flipped;
  render();
});

undoButton.addEventListener("click", () => {
  game.undo();
  clearSelection();
  render();
});

resetButton.addEventListener("click", () => {
  game.reset();
  clearSelection();
  render();
});

waitForChess();
