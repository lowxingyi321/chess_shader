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
const shaderButtons = document.querySelectorAll(".shader-option");
const opponentButtons = document.querySelectorAll(".opponent-option");
const sideButtons = document.querySelectorAll(".side-option");
const engineOptionsEl = document.querySelector("#engine-options");
const engineStateEl = document.querySelector("#engine-state");
const stockfishLevelInput = document.querySelector("#stockfish-level");
const stockfishLevelValueEl = document.querySelector("#stockfish-level-value");
const pgnInputEl = document.querySelector("#pgn-input");
const pgnFileInput = document.querySelector("#pgn-file");
const importPgnButton = document.querySelector("#import-pgn");
const pgnStateEl = document.querySelector("#pgn-state");
const moveBackButton = document.querySelector("#move-back");
const movePlayButton = document.querySelector("#move-play");
const moveNextButton = document.querySelector("#move-next");

let game;
let selectedSquare = null;
let legalMoves = [];
let flipped = false;
let shaderMode = "both";
let gameMode = "human";
let humanColor = "w";
let stockfishLevel = 8;
let engine = null;
let engineReady = false;
let engineThinking = false;
let engineStatus = "Human";
let engineMoveRequestId = 0;
let activeEngineRequestId = 0;
let activeEngineFen = null;
let pgnStatus = "Ready";
let moveTree = null;
let currentNodeId = "root";
let nextNodeId = 1;
let playbackTimer = null;
let isPlayingLine = false;

function waitForChess() {
  if (window.Chess) {
    game = new window.Chess();
    moveTree = createMoveTree();
    render();
    return;
  }

  boardEl.className = "loading";
  boardEl.textContent = "Loading board...";
  setTimeout(() => {
    if (window.Chess) {
      game = new window.Chess();
      moveTree = createMoveTree();
      render();
    } else {
      boardEl.className = "error";
      boardEl.textContent = "Chess engine could not load.";
    }
  }, 700);
}

function createMoveTree(rootFen) {
  const rootGame = new window.Chess();
  if (rootFen) {
    rootGame.load(rootFen);
  }

  return {
    rootId: "root",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        children: [],
        mainlineChildId: null,
        fen: rootGame.fen(),
        san: "Start",
        from: null,
        to: null,
        promotion: null,
        color: null,
        moveNumber: 0,
      },
    },
  };
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
  const strongestAttack = getStrongestVisibleAttack(attackCounts);
  const playerColor = getPlayerColor();

  getSquares().forEach((square) => {
    const piece = game.get(square);
    const squareAttacks = attackCounts.get(square) || { w: 0, b: 0 };
    const visibleAttacks = getVisibleAttacks(squareAttacks);
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

    if (visibleAttacks.total) {
      const enemyColor = playerColor === "w" ? "b" : "w";
      const redCount = visibleAttacks[enemyColor];
      const blueCount = visibleAttacks[playerColor];

      button.classList.add("attacked");
      if (redCount) {
        button.classList.add("attack-red");
        button.style.setProperty("--red-alpha", getAttackAlpha(redCount, strongestAttack));
      }
      if (blueCount) {
        button.classList.add("attack-blue");
        button.style.setProperty("--blue-alpha", getAttackAlpha(blueCount, strongestAttack));
      }
      button.title = getAttackTitle(square, visibleAttacks, playerColor);
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
  updateShaderControls();
  updateOpponentControls();
  updatePgnStatus();
  updatePlaybackControls();
}

function getAttackAlpha(count, strongestAttack) {
  const intensity = count / strongestAttack;
  return String(Math.min(0.76, 0.16 + intensity * 0.52));
}

function getPlayerColor() {
  return flipped ? "b" : "w";
}

function getVisibleAttacks(attacks) {
  if (shaderMode === "off") {
    return { w: 0, b: 0, total: 0 };
  }

  const visible = {
    w: shaderMode === "b" ? 0 : attacks.w,
    b: shaderMode === "w" ? 0 : attacks.b,
  };
  visible.total = visible.w + visible.b;
  return visible;
}

function getStrongestVisibleAttack(attackCounts) {
  let strongest = 1;

  attackCounts.forEach((attacks) => {
    const visible = getVisibleAttacks(attacks);
    strongest = Math.max(strongest, visible.w, visible.b);
  });

  return strongest;
}

function getAttackTitle(square, attacks, playerColor) {
  const colorName = playerColor === "w" ? "White" : "Black";
  const enemyName = playerColor === "w" ? "Black" : "White";
  const labels = [];

  if (attacks[playerColor]) {
    labels.push(`${colorName}: ${attacks[playerColor]}`);
  }
  if (attacks[playerColor === "w" ? "b" : "w"]) {
    labels.push(`${enemyName}: ${attacks[playerColor === "w" ? "b" : "w"]}`);
  }

  return `${square}: ${labels.join(", ")}`;
}

function getAttackCounts() {
  const counts = new Map();

  getBoardSquares().forEach((square) => {
    const piece = game.get(square);
    if (!piece) return;

    getAttackedSquares(square, piece).forEach((attackedSquare) => {
      const squareCounts = counts.get(attackedSquare) || { w: 0, b: 0 };
      squareCounts[piece.color] += 1;
      counts.set(attackedSquare, squareCounts);
    });
  });

  return counts;
}

function updateShaderControls() {
  shaderButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.shaderMode === shaderMode);
  });
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
  if (!canHumanMove()) return;

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
  if (!canHumanMove() || !piece || piece.color !== game.turn()) {
    return;
  }

  selectedSquare = square;
  legalMoves = game.moves({ square, verbose: true });
  render();
}

function movePiece(move) {
  const promotion = move.flags.includes("p") ? choosePromotion(move.color) : undefined;
  applyMoveToTree({
    from: move.from,
    to: move.to,
    promotion,
  }, { requestEngine: true });
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

function getCurrentNode() {
  return moveTree.nodes[currentNodeId];
}

function getNodePly(nodeId) {
  let ply = 0;
  let node = moveTree.nodes[nodeId];

  while (node && node.parentId) {
    ply += 1;
    node = moveTree.nodes[node.parentId];
  }

  return ply;
}

function getActivePath() {
  const path = [];
  let node = moveTree.nodes[moveTree.rootId];

  while (node && node.mainlineChildId) {
    const child = moveTree.nodes[node.mainlineChildId];
    if (!child) break;
    path.push(child);
    node = child;
  }

  return path;
}

function isNodeOnLine(nodeId, path) {
  return nodeId === moveTree.rootId || path.some((node) => node.id === nodeId);
}

function setActiveLineToNode(nodeId) {
  let node = moveTree.nodes[nodeId];

  while (node && node.parentId) {
    const parent = moveTree.nodes[node.parentId];
    parent.mainlineChildId = node.id;
    node = parent;
  }
}

function navigateToNode(nodeId, options = {}) {
  const node = moveTree.nodes[nodeId];
  if (!node) return;

  if (options.stopEngine !== false) {
    stopEngineSearch();
  }
  if (options.stopPlayback !== false) {
    stopPlayback();
  }
  setActiveLineToNode(nodeId);
  currentNodeId = nodeId;
  game = new window.Chess();
  game.load(node.fen);
  clearSelection();
  render();

  if (options.requestEngine) {
    requestEngineMoveIfNeeded();
  }
}

function getPreviousNodeId() {
  return getCurrentNode().parentId;
}

function getNextNodeId() {
  return getCurrentNode().mainlineChildId;
}

function stepToPreviousMove() {
  const previousNodeId = getPreviousNodeId();
  if (!previousNodeId) return false;
  navigateToNode(previousNodeId);
  return true;
}

function stepToNextMove(options = {}) {
  const nextNodeId = getNextNodeId();
  if (!nextNodeId) return false;
  navigateToNode(nextNodeId, options);
  return true;
}

function togglePlayback() {
  if (isPlayingLine) {
    stopPlayback();
    render();
    return;
  }

  if (!getNextNodeId()) return;

  stopEngineSearch();
  isPlayingLine = true;
  updatePlaybackControls();
  playbackTimer = window.setInterval(() => {
    if (!stepToNextMove({ stopEngine: false, stopPlayback: false })) {
      stopPlayback();
      render();
    }
  }, 850);
}

function stopPlayback() {
  if (playbackTimer) {
    window.clearInterval(playbackTimer);
    playbackTimer = null;
  }
  isPlayingLine = false;
}

function updatePlaybackControls() {
  moveBackButton.disabled = !getPreviousNodeId();
  moveNextButton.disabled = !getNextNodeId();
  movePlayButton.disabled = !getNextNodeId() && !isPlayingLine;
  movePlayButton.textContent = isPlayingLine ? "Ⅱ" : "▶";
  movePlayButton.setAttribute("aria-label", isPlayingLine ? "Pause moves" : "Play moves");
  movePlayButton.title = isPlayingLine ? "Pause moves" : "Play moves";
}

function findMatchingChild(parentNode, move) {
  return parentNode.children
    .map((childId) => moveTree.nodes[childId])
    .find((child) => {
      const samePromotion = (child.promotion || "") === (move.promotion || "");
      return child.from === move.from && child.to === move.to && samePromotion;
    });
}

function applyMoveToTree(move, options = {}) {
  stopPlayback();
  const parentNode = getCurrentNode();
  const matchingChild = findMatchingChild(parentNode, move);

  if (matchingChild) {
    if (options.render === false) {
      setActiveLineToNode(matchingChild.id);
      currentNodeId = matchingChild.id;
      game.load(matchingChild.fen);
      clearSelection();
    } else {
      navigateToNode(matchingChild.id, { stopEngine: false });
    }
    if (options.requestEngine) {
      requestEngineMoveIfNeeded();
    }
    return matchingChild;
  }

  const moveResult = game.move(move);
  if (!moveResult) return null;

  const node = createMoveNode(parentNode, moveResult);
  moveTree.nodes[node.id] = node;
  parentNode.children.push(node.id);
  parentNode.mainlineChildId = node.id;
  currentNodeId = node.id;
  clearSelection();
  if (options.render !== false) {
    render();
  }

  if (options.requestEngine) {
    requestEngineMoveIfNeeded();
  }

  return node;
}

function createMoveNode(parentNode, moveResult) {
  return {
    id: `m${nextNodeId++}`,
    parentId: parentNode.id,
    children: [],
    mainlineChildId: null,
    fen: game.fen(),
    san: moveResult.san,
    from: moveResult.from,
    to: moveResult.to,
    promotion: moveResult.promotion || null,
    color: moveResult.color,
    moveNumber: getMoveNumberFromFen(parentNode.fen),
  };
}

function getMoveNumberFromFen(fen) {
  return Number(fen.split(" ")[5]) || 1;
}

function canHumanMove() {
  return gameMode === "human" || (!engineThinking && game.turn() === humanColor);
}

function isGameOver() {
  return game.in_checkmate() || game.in_stalemate() || game.in_draw();
}

function initEngine() {
  if (engine || gameMode !== "stockfish") return;

  engineReady = false;
  engineThinking = false;
  engineStatus = "Loading";
  updateOpponentControls();

  try {
    engine = new Worker("vendor/stockfish/stockfish-18-lite-single.js");
  } catch (error) {
    engine = null;
    engineStatus = "Unavailable";
    updateOpponentControls();
    return;
  }

  engine.onmessage = (event) => handleEngineMessage(String(event.data));
  engine.onerror = () => {
    engineReady = false;
    engineThinking = false;
    engineStatus = "Unavailable";
    updateOpponentControls();
  };

  sendEngineCommand("uci");
  sendEngineCommand(`setoption name Skill Level value ${stockfishLevel}`);
  sendEngineCommand("isready");
}

function handleEngineMessage(message) {
  if (message === "readyok") {
    engineReady = true;
    engineStatus = "Ready";
    sendEngineCommand("ucinewgame");
    updateOpponentControls();
    requestEngineMoveIfNeeded();
    return;
  }

  if (!message.startsWith("bestmove ")) return;

  const requestId = activeEngineRequestId;
  const searchedFen = activeEngineFen;
  const bestMove = message.split(/\s+/)[1];
  engineThinking = false;
  activeEngineFen = null;
  engineStatus = engineReady ? "Ready" : "Loading";
  updateOpponentControls();

  if (
    requestId !== engineMoveRequestId ||
    searchedFen !== game.fen() ||
    gameMode !== "stockfish" ||
    !bestMove ||
    bestMove === "(none)"
  ) {
    return;
  }

  const move = parseEngineMove(bestMove);
  if (move) {
    applyMoveToTree(move);
  }
}

function requestEngineMoveIfNeeded() {
  if (gameMode !== "stockfish" || !engineReady || engineThinking || isGameOver()) return;
  if (game.turn() === humanColor) return;

  engineThinking = true;
  engineStatus = "Thinking";
  activeEngineRequestId = ++engineMoveRequestId;
  activeEngineFen = game.fen();
  clearSelection();
  render();

  sendEngineCommand(`position fen ${activeEngineFen}`);
  sendEngineCommand(`go movetime ${getEngineMoveTime()}`);
}

function parseEngineMove(bestMove) {
  const from = bestMove.slice(0, 2);
  const to = bestMove.slice(2, 4);
  const promotion = bestMove.slice(4, 5) || undefined;
  const move = { from, to };

  if (promotion) {
    move.promotion = promotion;
  }

  return move;
}

function getEngineMoveTime() {
  return Math.min(1800, 250 + stockfishLevel * 80);
}

function sendEngineCommand(command) {
  if (engine) {
    engine.postMessage(command);
  }
}

function stopEngineSearch() {
  engineMoveRequestId += 1;
  activeEngineRequestId = engineMoveRequestId;
  activeEngineFen = null;
  if (engineThinking) {
    sendEngineCommand("stop");
  }
  engineThinking = false;
  engineStatus = engineReady ? "Ready" : gameMode === "stockfish" ? "Loading" : "Human";
}

function updateOpponentControls() {
  opponentButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.gameMode === gameMode);
  });

  sideButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.humanColor === humanColor);
  });

  engineOptionsEl.hidden = gameMode !== "stockfish";
  engineStateEl.textContent = gameMode === "human" ? "Human" : engineStatus;
  stockfishLevelValueEl.textContent = stockfishLevel;
  stockfishLevelInput.value = String(stockfishLevel);
}

function importPgn(pgnText) {
  const trimmedPgn = pgnText.trim();

  if (!trimmedPgn) {
    pgnStatus = "Empty";
    updatePgnStatus();
    return;
  }

  const importedGame = new window.Chess();
  const loaded = importedGame.load_pgn(trimmedPgn, { sloppy: true });

  if (!loaded) {
    pgnStatus = "Invalid";
    updatePgnStatus();
    return;
  }

  stopEngineSearch();
  stopPlayback();
  moveTree = createMoveTree(getPgnStartingFen(trimmedPgn));
  nextNodeId = 1;
  currentNodeId = moveTree.rootId;
  game = new window.Chess();
  game.load(getCurrentNode().fen);
  importedGame.history({ verbose: true }).forEach((move) => {
    applyMoveToTree(
      {
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      },
      { render: false },
    );
  });
  if (engineReady) {
    sendEngineCommand("ucinewgame");
  }
  clearSelection();
  pgnStatus = "Imported";
  render();
}

function getPgnStartingFen(pgnText) {
  const match = pgnText.match(/\[FEN\s+"([^"]+)"\]/i);
  return match ? match[1] : null;
}

function updatePgnStatus() {
  pgnStateEl.textContent = pgnStatus;
  pgnStateEl.classList.toggle("error-state", pgnStatus === "Invalid" || pgnStatus === "Empty");
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
  const activePath = getActivePath();
  const currentPly = getNodePly(currentNodeId);
  moveCountEl.textContent = activePath.length;
  moveListEl.innerHTML = "";

  for (let i = 0; i < activePath.length; i += 2) {
    const row = document.createElement("li");
    row.className = "move-row";
    row.appendChild(createMoveNumberCell(i / 2 + 1));
    row.appendChild(createMoveCell(activePath[i], i + 1, currentPly, activePath));
    row.appendChild(createMoveCell(activePath[i + 1], i + 2, currentPly, activePath));
    moveListEl.appendChild(row);
  }

}

function createMoveNumberCell(moveNumber) {
  const cell = document.createElement("span");
  cell.textContent = `${moveNumber}.`;
  return cell;
}

function createMoveCell(node, ply, currentPly, activePath) {
  const cell = document.createElement("div");
  cell.className = "move-cell";

  if (!node) return cell;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "move-button";
  button.textContent = node.san;
  button.title = `${node.from}${node.to}${node.promotion || ""}`;
  button.classList.toggle("active", node.id === currentNodeId);
  button.classList.toggle("future", ply > currentPly);
  button.addEventListener("click", () => navigateToNode(node.id));
  cell.appendChild(button);

  const branches = createBranchChoices(node, activePath);
  if (branches) {
    cell.appendChild(branches);
  }

  return cell;
}

function createBranchChoices(node, activePath) {
  const parent = moveTree.nodes[node.parentId];
  if (!parent || parent.children.length < 2) return null;

  const branches = document.createElement("div");
  branches.className = "branch-choices";

  parent.children.forEach((childId, index) => {
    const child = moveTree.nodes[childId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "branch-choice";
    button.textContent = child.san;
    button.title = `${child.from}${child.to}${child.promotion || ""}`;
    button.classList.toggle("active", isNodeOnLine(child.id, activePath));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      navigateToNode(child.id);
    });
    branches.appendChild(button);

    if (index < parent.children.length - 1) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      branches.appendChild(separator);
    }
  });

  return branches;
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
  const wasEngineThinking = engineThinking;
  stopEngineSearch();
  const steps = gameMode === "stockfish" && !wasEngineThinking ? 2 : 1;
  let targetNode = getCurrentNode();

  for (let i = 0; i < steps && targetNode.parentId; i += 1) {
    targetNode = moveTree.nodes[targetNode.parentId];
  }

  navigateToNode(targetNode.id, { stopEngine: false });
});

resetButton.addEventListener("click", () => {
  stopEngineSearch();
  stopPlayback();
  if (engineReady) {
    sendEngineCommand("ucinewgame");
  }
  navigateToNode(moveTree.rootId, { stopEngine: false });
});

shaderButtons.forEach((button) => {
  button.addEventListener("click", () => {
    shaderMode = shaderMode === button.dataset.shaderMode ? "off" : button.dataset.shaderMode;
    render();
  });
});

opponentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stopEngineSearch();
    stopPlayback();
    gameMode = button.dataset.gameMode;
    engineStatus = gameMode === "human" ? "Human" : engineReady ? "Ready" : "Loading";
    clearSelection();
    render();
    initEngine();
    requestEngineMoveIfNeeded();
  });
});

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stopEngineSearch();
    stopPlayback();
    humanColor = button.dataset.humanColor;
    clearSelection();
    render();
    requestEngineMoveIfNeeded();
  });
});

stockfishLevelInput.addEventListener("input", () => {
  stockfishLevel = Number(stockfishLevelInput.value);
  stockfishLevelValueEl.textContent = stockfishLevel;
  sendEngineCommand(`setoption name Skill Level value ${stockfishLevel}`);
});

importPgnButton.addEventListener("click", () => {
  importPgn(pgnInputEl.value);
});

pgnInputEl.addEventListener("input", () => {
  if (pgnStatus !== "Ready") {
    pgnStatus = "Ready";
    updatePgnStatus();
  }
});

pgnFileInput.addEventListener("change", () => {
  const file = pgnFileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  pgnStatus = "Loading";
  updatePgnStatus();

  reader.addEventListener("load", () => {
    pgnInputEl.value = String(reader.result || "");
    importPgn(pgnInputEl.value);
    pgnFileInput.value = "";
  });

  reader.addEventListener("error", () => {
    pgnStatus = "Invalid";
    updatePgnStatus();
    pgnFileInput.value = "";
  });

  reader.readAsText(file);
});

moveBackButton.addEventListener("click", () => {
  stepToPreviousMove();
});

moveNextButton.addEventListener("click", () => {
  stepToNextMove();
});

movePlayButton.addEventListener("click", () => {
  togglePlayback();
});

waitForChess();
