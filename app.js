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
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  return flipped ? files.reverse() : files;
}

function getRanks() {
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];
  return flipped ? ranks.reverse() : ranks;
}

function getSquares() {
  return getRanks().flatMap((rank) => getFiles().map((file) => `${file}${rank}`));
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

  getSquares().forEach((square) => {
    const piece = game.get(square);
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

    if (selectedSquare === square) button.classList.add("selected");
    if (legalMove) button.classList.add(legalMove.flags.includes("c") ? "capture" : "legal");
    if (piece) button.textContent = pieces[`${piece.color}${piece.type}`];

    button.addEventListener("click", () => handleSquareClick(square));
    boardEl.appendChild(button);
  });

  updateStatus();
  updateHistory();
  updateCaptured();
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

  getSquares().forEach((square) => {
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
