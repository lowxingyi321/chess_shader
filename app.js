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
const liveTutorMoveTime = 500;
const liveTutorDebounceMs = 180;

const startScreenEl = document.querySelector("#start-screen");
const appWorkspaceEl = document.querySelector("#app-workspace");
const choosePlayButton = document.querySelector("#choose-play");
const chooseAnalyseButton = document.querySelector("#choose-analyse");
const returnStartButton = document.querySelector("#return-start");
const modeLabelEl = document.querySelector("#mode-label");
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
const pressureCountsToggle = document.querySelector("#pressure-counts-toggle");
const opponentButtons = document.querySelectorAll(".opponent-option");
const sideButtons = document.querySelectorAll(".side-option");
const engineOptionsEl = document.querySelector("#engine-options");
const engineStateEl = document.querySelector("#engine-state");
const stockfishLevelInput = document.querySelector("#stockfish-level");
const stockfishLevelValueEl = document.querySelector("#stockfish-level-value");
const playSetupControlsEl = document.querySelector("#play-setup-controls");
const startPlayGameButton = document.querySelector("#start-play-game");
const cancelPlaySetupButton = document.querySelector("#cancel-play-setup");
const lockedGameSummaryEl = document.querySelector("#locked-game-summary");
const lockedGameTextEl = document.querySelector("#locked-game-text");
const copyPlayPgnButton = document.querySelector("#copy-play-pgn");
const analyseEndedGameButton = document.querySelector("#analyse-ended-game");
const pgnInputEl = document.querySelector("#pgn-input");
const pgnFileInput = document.querySelector("#pgn-file");
const importPgnButton = document.querySelector("#import-pgn");
const pgnStateEl = document.querySelector("#pgn-state");
const moveBackButton = document.querySelector("#move-back");
const movePlayButton = document.querySelector("#move-play");
const moveNextButton = document.querySelector("#move-next");
const chatPromptEl = document.querySelector("#chat-prompt");
const copyChatPromptButton = document.querySelector("#copy-chat-prompt");
const chatPromptStateEl = document.querySelector("#chat-prompt-state");

let game;
let selectedSquare = null;
let legalMoves = [];
let flipped = false;
let shaderMode = "both";
let showPressureCounts = false;
let appMode = "start";
let playGameStarted = false;
let setupGameMode = "human";
let setupHumanColor = "w";
let setupStockfishLevel = 8;
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
let chatPromptStatus = "Ready";
let liveTutorEngine = null;
let liveTutorReady = false;
let liveTutorStatus = "No engine";
let liveTutorTimer = null;
let liveTutorActiveRequest = null;
let liveTutorQueue = [];
let liveTutorRequestId = 0;
let liveTutorResults = new Map();

function waitForChess() {
  if (window.Chess) {
    game = new window.Chess();
    moveTree = createMoveTree();
    updateModeVisibility();
    render();
    return;
  }

  boardEl.className = "loading";
  boardEl.textContent = "Loading board...";
  setTimeout(() => {
    if (window.Chess) {
      game = new window.Chess();
      moveTree = createMoveTree();
      updateModeVisibility();
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

function resetBoardState(rootFen) {
  stopEngineSearch();
  stopPlayback();
  moveTree = createMoveTree(rootFen);
  nextNodeId = 1;
  currentNodeId = moveTree.rootId;
  game = new window.Chess();
  game.load(getCurrentNode().fen);
  clearSelection();
  resetChatPromptStatus();
}

function showStartScreen() {
  appMode = "start";
  playGameStarted = false;
  gameMode = "human";
  engineStatus = "Human";
  stopEngineSearch();
  stopPlayback();
  clearSelection();
  updateModeVisibility();
}

function showPlaySetup() {
  appMode = "play";
  playGameStarted = false;
  gameMode = "human";
  engineStatus = "Human";
  resetBoardState();
  updateModeVisibility();
  render();
}

function startPlayGame() {
  appMode = "play";
  playGameStarted = true;
  gameMode = setupGameMode;
  humanColor = setupHumanColor;
  stockfishLevel = setupStockfishLevel;
  resetBoardState();
  if (engineReady) {
    sendEngineCommand("ucinewgame");
    sendEngineCommand(`setoption name Skill Level value ${stockfishLevel}`);
  }
  engineStatus = gameMode === "human" ? "Human" : engineReady ? "Ready" : "Loading";
  updateModeVisibility();
  render();
  initEngine();
  requestEngineMoveIfNeeded();
}

function startAnalyseGame() {
  appMode = "analyse";
  playGameStarted = false;
  gameMode = "human";
  engineStatus = "Human";
  resetBoardState();
  pgnStatus = "Ready";
  updateModeVisibility();
  render();
}

function analyseCurrentGame() {
  if (!game || !getActivePath().length) return;

  stopEngineSearch();
  stopPlayback();
  appMode = "analyse";
  playGameStarted = false;
  gameMode = "human";
  engineStatus = "Human";
  clearSelection();
  pgnStatus = "Game";
  resetChatPromptStatus();
  updateModeVisibility();
  render();
}

function updateModeVisibility() {
  startScreenEl.hidden = appMode !== "start";
  appWorkspaceEl.hidden = appMode === "start";
  appWorkspaceEl.dataset.mode = appMode;
  appWorkspaceEl.dataset.started = String(playGameStarted);

  document.querySelectorAll(".play-only").forEach((el) => {
    el.hidden = appMode !== "play";
  });

  document.querySelectorAll(".analyse-only").forEach((el) => {
    el.hidden = appMode !== "analyse";
  });

  modeLabelEl.textContent =
    appMode === "play" ? "Play Game" : appMode === "analyse" ? "Analyse Game" : "Chess";
  resetButton.textContent = appMode === "play" ? "New" : "Reset";
  resetButton.title = appMode === "play" ? "New game" : "Reset analysis board";
  resetButton.setAttribute("aria-label", resetButton.title);

  updateSetupControls();
  updateLockedGameSummary();
}

function updateSetupControls() {
  opponentButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.gameMode === setupGameMode);
    button.disabled = playGameStarted;
  });

  sideButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.humanColor === setupHumanColor);
    button.disabled = playGameStarted;
  });

  engineOptionsEl.hidden = setupGameMode !== "stockfish";
  stockfishLevelValueEl.textContent = setupStockfishLevel;
  stockfishLevelInput.value = String(setupStockfishLevel);
  stockfishLevelInput.disabled = playGameStarted;
  startPlayGameButton.disabled = playGameStarted;
}

function updateLockedGameSummary() {
  playSetupControlsEl.hidden = appMode === "play" && playGameStarted;
  lockedGameSummaryEl.hidden = appMode !== "play" || !playGameStarted;
  lockedGameTextEl.textContent = getLockedGameLabel();
  analyseEndedGameButton.hidden = appMode !== "play" || !playGameStarted || !isGameOver();
}

function getLockedGameLabel() {
  if (gameMode !== "stockfish") return "Human vs human";
  const side = humanColor === "w" ? "White" : "Black";
  return `Stockfish level ${stockfishLevel}, human plays ${side}`;
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
  const currentNode = getCurrentNode();

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
    if (currentNode.parentId && square === currentNode.from) {
      button.classList.add("last-move-from");
    }
    if (currentNode.parentId && square === currentNode.to) {
      button.classList.add("last-move-to");
    }

    if (visibleAttacks.total) {
      button.classList.add("attacked");
      if (visibleAttacks.w) {
        button.classList.add("attack-white");
      }
      if (visibleAttacks.b) {
        button.classList.add("attack-black");
      }
      button.appendChild(createPressureWedges(visibleAttacks));
      if (showPressureCounts) {
        button.appendChild(createPressureCounts(visibleAttacks));
      }
      button.title = getAttackTitle(square, visibleAttacks);
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
  updateChatPrompt();
  scheduleLiveTutorAnalysis();
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

function createPressureWedges(attacks) {
  const wedges = document.createElement("span");
  wedges.className = "pressure-wedges";

  if (attacks.w) {
    wedges.appendChild(createPressureWedgeGroup("white", attacks.w));
  }
  if (attacks.b) {
    wedges.appendChild(createPressureWedgeGroup("black", attacks.b));
  }

  return wedges;
}

function createPressureWedgeGroup(color, count) {
  const group = document.createElement("span");
  const visibleCount = Math.min(8, count);
  group.className = `pressure-wedge-group ${color}-wedge-group`;
  group.setAttribute("aria-hidden", "true");
  group.style.setProperty("--wedge-count", String(visibleCount));

  for (let i = 0; i < visibleCount; i += 1) {
    const wedge = document.createElement("span");
    wedge.className = `pressure-wedge ${color}-wedge`;
    group.appendChild(wedge);
  }

  return group;
}

function createPressureCounts(attacks) {
  const counts = document.createElement("span");
  counts.className = "pressure-counts";

  if (attacks.w) {
    const whiteCount = document.createElement("span");
    whiteCount.className = "pressure-count white-count";
    whiteCount.textContent = `W${attacks.w}`;
    counts.appendChild(whiteCount);
  }

  if (attacks.b) {
    const blackCount = document.createElement("span");
    blackCount.className = "pressure-count black-count";
    blackCount.textContent = `B${attacks.b}`;
    counts.appendChild(blackCount);
  }

  return counts;
}

function getAttackTitle(square, attacks) {
  const labels = [];

  if (attacks.w) {
    labels.push(`White ${attacks.w}`);
  }
  if (attacks.b) {
    labels.push(`Black ${attacks.b}`);
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
  pressureCountsToggle.classList.toggle("active", showPressureCounts);
  pressureCountsToggle.textContent = showPressureCounts ? "Counts on" : "Counts off";
  pressureCountsToggle.setAttribute("aria-pressed", String(showPressureCounts));
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
  resetChatPromptStatus();
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
  resetChatPromptStatus();
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
  movePlayButton.textContent = isPlayingLine ? "Pause" : "Play";
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
  if (appMode === "analyse") return true;
  if (appMode !== "play" || !playGameStarted) return false;
  return gameMode === "human" || (!engineThinking && game.turn() === humanColor);
}

function isGameOver() {
  return game.in_checkmate() || game.in_stalemate() || game.in_draw();
}

function initEngine() {
  if (engine || appMode !== "play" || !playGameStarted || gameMode !== "stockfish") return;

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
  if (appMode !== "play" || !playGameStarted) return;
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
  updateSetupControls();
  updateLockedGameSummary();
  engineStateEl.textContent =
    appMode === "play" && playGameStarted && gameMode === "stockfish" ? engineStatus : "Human";
}

function initLiveTutorEngine() {
  if (liveTutorEngine) return;

  liveTutorStatus = "Analyzing";
  updateChatPrompt();

  try {
    liveTutorEngine = new Worker("vendor/stockfish/stockfish-18-lite-single.js");
  } catch (error) {
    liveTutorEngine = null;
    liveTutorReady = false;
    liveTutorStatus = "No engine";
    updateChatPrompt();
    return;
  }

  liveTutorEngine.onmessage = (event) => handleLiveTutorMessage(String(event.data));
  liveTutorEngine.onerror = () => {
    liveTutorReady = false;
    liveTutorStatus = "No engine";
    liveTutorActiveRequest = null;
    liveTutorQueue = [];
    updateChatPrompt();
  };

  sendLiveTutorCommand("uci");
  sendLiveTutorCommand("isready");
}

function handleLiveTutorMessage(message) {
  if (message === "readyok") {
    liveTutorReady = true;
    liveTutorStatus = "Ready";
    sendLiveTutorCommand("ucinewgame");
    scheduleLiveTutorAnalysis();
    updateChatPrompt();
    return;
  }

  if (!liveTutorActiveRequest) return;

  if (message.startsWith("info ")) {
    const parsedInfo = parseLiveTutorInfo(message, liveTutorActiveRequest.fen);
    if (parsedInfo) {
      liveTutorActiveRequest.info = {
        ...liveTutorActiveRequest.info,
        ...parsedInfo,
      };
    }
    return;
  }

  if (!message.startsWith("bestmove ")) return;

  const bestMove = message.split(/\s+/)[1];
  const request = liveTutorActiveRequest;
  liveTutorActiveRequest = null;

  if (request.id === liveTutorRequestId || liveTutorQueue.some((item) => item.id >= request.id)) {
    liveTutorResults.set(request.fen, {
      fen: request.fen,
      bestMove: bestMove && bestMove !== "(none)" ? bestMove : request.info.bestMove || null,
      depth: request.info.depth || null,
      pv: request.info.pv || [],
      score: request.info.score || null,
    });
  }

  processLiveTutorQueue();
  updateLiveTutorStatus();
  updateChatPrompt();
}

function parseLiveTutorInfo(message, fen) {
  const depthMatch = message.match(/\bdepth\s+(\d+)/);
  const pvMatch = message.match(/\bpv\s+(.+)$/);
  const scoreMatch = message.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const result = {};

  if (depthMatch) {
    result.depth = Number(depthMatch[1]);
  }

  if (pvMatch) {
    result.pv = pvMatch[1].trim().split(/\s+/).slice(0, 6);
    result.bestMove = result.pv[0] || null;
  }

  if (scoreMatch) {
    result.score = normalizeEngineScore(scoreMatch[1], Number(scoreMatch[2]), fen);
  }

  return Object.keys(result).length ? result : null;
}

function normalizeEngineScore(type, value, fen) {
  const sideToMove = getFenTurn(fen);
  const sideMultiplier = sideToMove === "w" ? 1 : -1;

  if (type === "mate") {
    return {
      type: "mate",
      value: value * sideMultiplier,
      label: formatMateScore(value * sideMultiplier),
      whiteCentipawns: value > 0 ? 100000 * sideMultiplier : -100000 * sideMultiplier,
    };
  }

  const whiteCentipawns = value * sideMultiplier;
  return {
    type: "cp",
    value: whiteCentipawns,
    label: formatCentipawnScore(whiteCentipawns),
    whiteCentipawns,
  };
}

function formatCentipawnScore(centipawns) {
  const pawns = Math.abs(centipawns) / 100;
  const sign = centipawns >= 0 ? "+" : "-";
  return `${sign}${pawns.toFixed(2)}`;
}

function formatMateScore(mateValue) {
  if (mateValue === 0) return "Mate";
  return mateValue > 0 ? `White mates in ${mateValue}` : `Black mates in ${Math.abs(mateValue)}`;
}

function getFenTurn(fen) {
  return fen.split(" ")[1] || "w";
}

function sendLiveTutorCommand(command) {
  if (liveTutorEngine) {
    liveTutorEngine.postMessage(command);
  }
}

function scheduleLiveTutorAnalysis() {
  if (!game || appMode === "start") return;

  window.clearTimeout(liveTutorTimer);
  updateLiveTutorStatus();
  updateChatPrompt();

  liveTutorTimer = window.setTimeout(() => {
    queueLiveTutorAnalysis();
  }, liveTutorDebounceMs);
}

function queueLiveTutorAnalysis() {
  if (!game) return;

  initLiveTutorEngine();
  const fens = getLiveTutorFens();
  const missingFens = fens.filter((fen) => fen && !liveTutorResults.has(fen));

  if (!liveTutorReady) {
    liveTutorStatus = liveTutorEngine ? "Analyzing" : "No engine";
    updateChatPrompt();
    return;
  }

  if (!missingFens.length) {
    updateLiveTutorStatus();
    updateChatPrompt();
    return;
  }

  liveTutorStatus = "Analyzing";
  missingFens.forEach((fen) => {
    if (liveTutorActiveRequest?.fen === fen || liveTutorQueue.some((request) => request.fen === fen)) return;
    liveTutorQueue.push({
      id: ++liveTutorRequestId,
      fen,
      info: {},
    });
  });

  processLiveTutorQueue();
  updateChatPrompt();
}

function getLiveTutorFens() {
  const currentNode = getCurrentNode();
  if (appMode === "analyse" && getActivePath().length) {
    const activePath = getActivePath();
    return [
      moveTree.nodes[moveTree.rootId].fen,
      ...activePath.map((node) => node.fen),
    ].filter((fen, index, allFens) => fen && allFens.indexOf(fen) === index);
  }

  const fens = [game.fen()];

  if (currentNode?.parentId) {
    const parentNode = moveTree.nodes[currentNode.parentId];
    if (parentNode?.fen) {
      fens.push(parentNode.fen);
    }
  }

  return fens;
}

function processLiveTutorQueue() {
  if (!liveTutorReady || liveTutorActiveRequest || !liveTutorQueue.length) return;

  liveTutorActiveRequest = liveTutorQueue.shift();
  liveTutorStatus = "Analyzing";
  sendLiveTutorCommand(`position fen ${liveTutorActiveRequest.fen}`);
  sendLiveTutorCommand(`go movetime ${liveTutorMoveTime}`);
}

function updateLiveTutorStatus() {
  if (!liveTutorEngine) {
    liveTutorStatus = "No engine";
    return;
  }

  if (!liveTutorReady) {
    liveTutorStatus = "Analyzing";
    return;
  }

  if (liveTutorActiveRequest || liveTutorQueue.length) {
    liveTutorStatus = "Analyzing";
    return;
  }

  if (game && getLiveTutorFens().some((fen) => fen && !liveTutorResults.has(fen))) {
    liveTutorStatus = "Analyzing";
    return;
  }

  liveTutorStatus = "Ready";
}

function getCurrentGameContextForChat() {
  const currentNode = getCurrentNode();
  const captures = getCapturedPieces();
  const parentNode = currentNode.parentId ? moveTree.nodes[currentNode.parentId] : null;
  const currentAnalysis = liveTutorResults.get(game.fen()) || null;
  const parentAnalysis = parentNode ? liveTutorResults.get(parentNode.fen) || null : null;
  const legalMoveList = game.moves();

  return {
    fen: game.fen(),
    playerPerspective: getPlayerColor() === "w" ? "White" : "Black",
    playerColor: getPlayerColor(),
    sideToMove: game.turn() === "w" ? "White" : "Black",
    activeLine: getActiveLinePgnForChat(),
    currentMove: currentNode.parentId
      ? `${currentNode.moveNumber}${currentNode.color === "b" ? "..." : "."} ${currentNode.san}`
      : "Starting position",
    lastMoveColor: currentNode.color,
    branchCount: currentNode.children.length,
    capturedWhite: captures.white.map((type) => pieces[`w${type}`]).join(" ") || "None",
    capturedBlack: captures.black.map((type) => pieces[`b${type}`]).join(" ") || "None",
    legalMoves: legalMoveList.length ? legalMoveList.join(", ") : "No legal moves",
    currentAnalysis,
    parentAnalysis,
    moveClassification: classifyCurrentMove(currentNode, parentAnalysis, currentAnalysis),
    opponent:
      appMode === "analyse"
        ? "Analysis review"
        : gameMode === "stockfish"
        ? `Stockfish level ${stockfishLevel}, human plays ${humanColor === "w" ? "White" : "Black"}`
        : "Human vs human",
  };
}

function getActiveLinePgnForChat() {
  const activePath = getActivePath();

  if (!activePath.length) return "No moves yet.";

  const parts = [];
  for (let i = 0; i < activePath.length; i += 1) {
    const node = activePath[i];
    if (node.color === "w") {
      parts.push(`${node.moveNumber}. ${node.san}`);
    } else if (parts.length) {
      parts[parts.length - 1] += ` ${node.san}`;
    } else {
      parts.push(`${node.moveNumber}... ${node.san}`);
    }
  }

  return parts.join(" ");
}

function classifyCurrentMove(currentNode, parentAnalysis, currentAnalysis) {
  if (!currentNode.parentId || !parentAnalysis?.score || !currentAnalysis?.score) {
    return null;
  }

  const moverColor = currentNode.color;
  const before = getScoreForColor(parentAnalysis.score, moverColor);
  const after = getScoreForColor(currentAnalysis.score, moverColor);
  const drop = Math.max(0, Math.round(before - after));
  let label = "Excellent / Best";

  if (drop > 150) {
    label = "Blunder";
  } else if (drop > 50) {
    label = "Mistake";
  } else if (drop > 20) {
    label = "Inaccuracy";
  }

  return {
    label,
    drop,
    before,
    after,
    mover: moverColor === "w" ? "White" : "Black",
  };
}

function getScoreForColor(score, color) {
  if (!score) return null;
  return color === "w" ? score.whiteCentipawns : -score.whiteCentipawns;
}

function formatPerspectiveScore(score, color) {
  if (!score) return "Engine analysis pending";

  if (score.type === "mate") {
    const perspectiveValue = color === "w" ? score.value : -score.value;
    if (perspectiveValue === 0) return "Mate";
    return perspectiveValue > 0
      ? `Winning by mate in ${perspectiveValue}`
      : `Getting mated in ${Math.abs(perspectiveValue)}`;
  }

  return formatCentipawnScore(getScoreForColor(score, color));
}

function formatWhiteScore(score) {
  return score ? score.label : "Engine analysis pending";
}

function formatPv(pv) {
  return pv?.length ? pv.join(" ") : "Engine line pending";
}

function formatBestMove(analysis) {
  return analysis?.bestMove || "Engine best move pending";
}

function formatMoveClassification(classification) {
  if (!classification) return "No previous move to classify yet.";

  return [
    `${classification.label}`,
    `mover: ${classification.mover}`,
    `eval drop: ${classification.drop} centipawns`,
    `before: ${formatCentipawnScore(classification.before)}`,
    `after: ${formatCentipawnScore(classification.after)}`,
  ].join("; ");
}

function getGameResultForChat() {
  if (game.in_checkmate()) {
    return `Checkmate, ${game.turn() === "w" ? "Black" : "White"} wins`;
  }

  if (game.in_stalemate()) return "Stalemate";
  if (game.in_draw()) return "Draw";
  return "Game in progress";
}

function getGameReviewHighlights() {
  const activePath = getActivePath();
  const highlights = [];

  activePath.forEach((node) => {
    const parentNode = moveTree.nodes[node.parentId];
    const parentAnalysis = parentNode ? liveTutorResults.get(parentNode.fen) || null : null;
    const currentAnalysis = liveTutorResults.get(node.fen) || null;
    const classification = classifyCurrentMove(node, parentAnalysis, currentAnalysis);

    if (!classification || classification.label === "Excellent / Best") return;

    highlights.push(
      `${node.moveNumber}${node.color === "b" ? "..." : "."} ${node.san}: ${classification.label}, ${classification.drop} cp drop (${formatCentipawnScore(classification.before)} to ${formatCentipawnScore(classification.after)} for ${classification.mover})`,
    );
  });

  return highlights.slice(0, 8);
}

function getGameReviewCoverage() {
  const activePath = getActivePath();
  if (!activePath.length) return "No moves available yet.";

  const analysedMoves = activePath.filter((node) => {
    const parentNode = moveTree.nodes[node.parentId];
    return parentNode && liveTutorResults.has(parentNode.fen) && liveTutorResults.has(node.fen);
  }).length;

  return `${analysedMoves} of ${activePath.length} moves have before/after engine context cached. Use available highlights only if review is still filling in.`;
}

function buildWholeGameCoachPrompt() {
  const context = getCurrentGameContextForChat();
  const highlights = getGameReviewHighlights();
  const currentEval = formatPerspectiveScore(context.currentAnalysis?.score, context.playerColor);
  const whiteEval = formatWhiteScore(context.currentAnalysis?.score);

  return [
    "You are an encouraging, insightful human chess coach around 2200 Elo.",
    "CRITICAL: Do not calculate moves yourself. Trust the engine data below. If engine review coverage is partial, say so briefly and focus only on the available evidence.",
    "Review the whole game, not just the currently selected position.",
    "Reply with 3-5 concise learning points, the biggest turning point, recurring themes, and one practical training takeaway.",
    "Avoid long variation trees. Use plain strategic and tactical language.",
    "",
    "[GAME REVIEW]",
    `Result/status: ${getGameResultForChat()}`,
    `Coach perspective: ${context.playerPerspective}`,
    `Opponent setting: ${context.opponent}`,
    `Full active-line PGN: ${context.activeLine}`,
    `Engine review coverage: ${getGameReviewCoverage()}`,
    "",
    "[KEY ENGINE HIGHLIGHTS]",
    highlights.length ? highlights.join("\n") : "No major engine-classified mistakes are cached yet.",
    "",
    "[CURRENT BOARD AS SECONDARY CONTEXT]",
    `Selected position FEN: ${context.fen}`,
    `Selected move/position: ${context.currentMove}`,
    `Current eval for coach perspective: ${currentEval}`,
    `Current eval from White perspective: ${whiteEval}`,
    `Engine best move in selected position: ${formatBestMove(context.currentAnalysis)}`,
    `Short engine line in selected position: ${formatPv(context.currentAnalysis?.pv)}`,
    "",
    "Give me a whole-game review focused on what I should learn and train next.",
  ].join("\n");
}

function buildCurrentPositionCoachPrompt() {
  const context = getCurrentGameContextForChat();
  const analysisReady = Boolean(context.currentAnalysis);
  const currentEval = formatPerspectiveScore(context.currentAnalysis?.score, context.playerColor);
  const whiteEval = formatWhiteScore(context.currentAnalysis?.score);
  const bestMove = formatBestMove(context.currentAnalysis);
  const pv = formatPv(context.currentAnalysis?.pv);

  return [
    "You are an encouraging, insightful human chess coach around 2200 Elo.",
    "CRITICAL: Do not calculate moves yourself. Trust the engine data below. If engine analysis is pending, say so and coach from only the provided FEN and legal moves.",
    "Explain concepts first: king safety, piece activity, pawn structure, open files, weak squares, tempo, threats, or tactical motifs.",
    "Use the prior moves as context, but focus your coaching on the current position and the best next plan.",
    "Do not spoil the exact engine best move unless I ask for it directly. You may hint at the idea behind it.",
    "Reply in exactly one short paragraph, no bullet points, no headings, and no long variation tree.",
    "",
    "[CURRENT POSITION]",
    `FEN: ${context.fen}`,
    `Coach me as: ${context.playerPerspective}`,
    `Side to move: ${context.sideToMove}`,
    `Legal moves: ${context.legalMoves}`,
    `Prior moves leading here: ${context.activeLine}`,
    `Current selected move/position: ${context.currentMove}`,
    `Branches from current position: ${context.branchCount}`,
    `Captured White pieces: ${context.capturedWhite}`,
    `Captured Black pieces: ${context.capturedBlack}`,
    `Opponent setting: ${context.opponent}`,
    "",
    "[ENGINE ANALYSIS]",
    `Analysis status: ${analysisReady ? "Ready" : "Engine analysis pending"}`,
    `Current eval for coach perspective: ${currentEval}`,
    `Current eval from White perspective: ${whiteEval}`,
    `Engine best move: ${bestMove}`,
    `Short engine line: ${pv}`,
    `Search depth: ${context.currentAnalysis?.depth || "Pending"}`,
    "",
    "[LAST MOVE REVIEW]",
    `Last move: ${context.currentMove}`,
    `Classification: ${formatMoveClassification(context.moveClassification)}`,
    "",
    "Give me one practical takeaway from this position. If the last move was a blunder or mistake, explain the human reason it failed and the tactical or strategic punishment without dumping a long line.",
  ].join("\n");
}

function buildChatGptCoachPrompt() {
  const hasGameMoves = getActivePath().length > 0;
  if (appMode === "analyse" && hasGameMoves) {
    return buildWholeGameCoachPrompt();
  }

  return buildCurrentPositionCoachPrompt();
}

function updateChatPrompt() {
  chatPromptEl.value = buildChatGptCoachPrompt();
  const displayStatus = chatPromptStatus === "Copied" || chatPromptStatus === "Select" ? chatPromptStatus : liveTutorStatus;
  chatPromptStateEl.textContent = displayStatus;
  chatPromptStateEl.classList.toggle("copied", displayStatus === "Copied");
  chatPromptStateEl.classList.toggle("analyzing", displayStatus === "Analyzing");
  chatPromptStateEl.classList.toggle("error-state", displayStatus === "No engine");
}

function resetChatPromptStatus() {
  if (chatPromptStatus !== "Ready") {
    chatPromptStatus = "Ready";
  }
}

async function copyChatPrompt() {
  const prompt = buildChatGptCoachPrompt();

  try {
    await copyTextToClipboard(prompt);
    chatPromptStatus = "Copied";
  } catch (error) {
    chatPromptEl.value = prompt;
    chatPromptEl.focus();
    chatPromptEl.select();
    chatPromptStatus = "Select";
  }

  updateChatPrompt();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

async function copyPlayPgn() {
  const pgn = buildExportPgn();
  const originalText = copyPlayPgnButton.textContent;

  try {
    await copyTextToClipboard(pgn);
    copyPlayPgnButton.textContent = "Copied";
  } catch (error) {
    window.prompt("Copy PGN", pgn);
    copyPlayPgnButton.textContent = "Select PGN";
  }

  window.setTimeout(() => {
    copyPlayPgnButton.textContent = originalText || "Copy PGN";
  }, 1400);
}

function buildExportPgn() {
  const result = getPgnResult();
  const rootFen = moveTree.nodes[moveTree.rootId].fen;
  const headers = [
    ["Event", appMode === "play" ? "Play Game" : "Analysis Game"],
    ["Site", "Chess Shader"],
    ["Date", getPgnDate()],
    ["Round", "-"],
    ["White", getPgnPlayerName("w")],
    ["Black", getPgnPlayerName("b")],
    ["Result", result],
  ];

  if (!isDefaultStartingFen(rootFen)) {
    headers.push(["SetUp", "1"], ["FEN", rootFen]);
  }

  const headerText = headers.map(([key, value]) => `[${key} "${value}"]`).join("\n");
  const moveText = getActiveLinePgnForChat();
  const body = moveText === "No moves yet." ? result : `${moveText} ${result}`;

  return `${headerText}\n\n${body}`;
}

function getPgnDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getPgnPlayerName(color) {
  if (appMode !== "play" || gameMode !== "stockfish") {
    return color === "w" ? "White" : "Black";
  }

  if (humanColor === color) return "Human";
  return `Stockfish Level ${stockfishLevel}`;
}

function getPgnResult() {
  if (game.in_checkmate()) {
    return game.turn() === "w" ? "0-1" : "1-0";
  }

  if (game.in_stalemate() || game.in_draw()) {
    return "1/2-1/2";
  }

  return "*";
}

function isDefaultStartingFen(fen) {
  const defaultGame = new window.Chess();
  return fen === defaultGame.fen();
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
  resetChatPromptStatus();
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
  if (appMode === "play" && !playGameStarted) {
    statusEl.textContent = "Set up your game";
    return;
  }

  if (appMode === "analyse" && !getActivePath().length) {
    statusEl.textContent = "Import a PGN or explore from the start";
    return;
  }

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
  if (appMode === "play") {
    showPlaySetup();
    return;
  }

  resetBoardState();
  pgnStatus = "Ready";
  render();
});

shaderButtons.forEach((button) => {
  button.addEventListener("click", () => {
    shaderMode = shaderMode === button.dataset.shaderMode ? "off" : button.dataset.shaderMode;
    render();
  });
});

pressureCountsToggle.addEventListener("click", () => {
  showPressureCounts = !showPressureCounts;
  render();
});

opponentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (playGameStarted) return;
    setupGameMode = button.dataset.gameMode;
    updateModeVisibility();
  });
});

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (playGameStarted) return;
    setupHumanColor = button.dataset.humanColor;
    updateModeVisibility();
  });
});

stockfishLevelInput.addEventListener("input", () => {
  if (playGameStarted) return;
  setupStockfishLevel = Number(stockfishLevelInput.value);
  stockfishLevelValueEl.textContent = setupStockfishLevel;
});

choosePlayButton.addEventListener("click", () => {
  showPlaySetup();
});

chooseAnalyseButton.addEventListener("click", () => {
  startAnalyseGame();
});

returnStartButton.addEventListener("click", () => {
  showStartScreen();
});

startPlayGameButton.addEventListener("click", () => {
  startPlayGame();
});

cancelPlaySetupButton.addEventListener("click", () => {
  showStartScreen();
});

analyseEndedGameButton.addEventListener("click", () => {
  analyseCurrentGame();
});

copyPlayPgnButton.addEventListener("click", () => {
  copyPlayPgn();
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

copyChatPromptButton.addEventListener("click", () => {
  copyChatPrompt();
});

waitForChess();
