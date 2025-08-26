import React, { useEffect, useState, useRef } from "react";
import Grid from "./Grid";
import { VARIANTS, SAMPLE } from "./variants";
import { solveSudoku } from "./Solver";

const makeEmpty = () => Array.from({ length: 9 }, () => Array(9).fill("."));

function cloneGrid(g) {
  return g.map((r) => r.slice());
}

// shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate full valid solution by backtracking (randomized)
function generateFullSolution() {
  const grid = makeEmpty();
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);

  function canPlace(r, c, d) {
    const bit = 1 << d;
    const bidx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    if (rows[r] & bit) return false;
    if (cols[c] & bit) return false;
    if (boxes[bidx] & bit) return false;
    return true;
  }

  function helper(pos = 0) {
    if (pos === 81) return true;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    let nums = shuffle([...Array(9).keys()]);
    for (let d of nums) {
      if (canPlace(r, c, d)) {
        const bit = 1 << d;
        grid[r][c] = String(d + 1);
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)] |= bit;
        if (helper(pos + 1)) return true;
        grid[r][c] = ".";
        rows[r] ^= bit;
        cols[c] ^= bit;
        boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)] ^= bit;
      }
    }
    return false;
  }

  helper(0);
  return grid;
}

// remove numbers to produce puzzle with clueCount remaining
function makePuzzleFromSolution(solution, clueCount = 30) {
  const grid = cloneGrid(solution);
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
  shuffle(cells);
  const removeCount = 81 - clueCount;
  for (let i = 0; i < removeCount; i++) {
    const [r, c] = cells[i];
    grid[r][c] = ".";
  }
  return grid;
}

// generate cages for killer: greedily make contiguous cages where possible
function generateKillerCages(solution) {
  // simple greedy contiguous grouping
  const remaining = new Set();
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) remaining.add(r + "," + c);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const cages = [];

  while (remaining.size) {
    const arr = Array.from(remaining);
    const pick = arr[Math.floor(Math.random() * arr.length)];
    const [sr, sc] = pick.split(",").map(Number);
    // decide cage size 1..4
    const size = Math.max(1, Math.min(4, Math.floor(Math.random() * 4) + 1));
    const cageCells = [[sr, sc]];
    remaining.delete(pick);

    // expand by BFS from start
    const frontier = [[sr, sc]];
    while (cageCells.length < size && frontier.length) {
      // pick random frontier index
      const idx = Math.floor(Math.random() * frontier.length);
      const [fr, fc] = frontier[idx];
      // neighbors
      const neighbors = shuffle(dirs.map(([dr,dc]) => [fr+dr, fc+dc]).filter(([nr,nc]) => nr>=0 && nr<9 && nc>=0 && nc<9 && remaining.has(nr + "," + nc)));
      if (!neighbors.length) {
        frontier.splice(idx,1);
        continue;
      }
      const [nr,nc] = neighbors[0];
      cageCells.push([nr,nc]);
      frontier.push([nr,nc]);
      remaining.delete(nr + "," + nc);
    }

    // compute sum from solution
    let sum = 0;
    for (const [r,c] of cageCells) sum += parseInt(solution[r][c]);
    cages.push({ cells: cageCells, sum });
  }

  return cages;
}

export default function App() {
  const [variant, setVariant] = useState(VARIANTS.CLASSIC);
  const [grid, setGrid] = useState(makeEmpty());
  const [conflictCells, setConflictCells] = useState([]);
  const [timer, setTimer] = useState(0);
  const [running, setRunning] = useState(false);
  const [cages, setCages] = useState([]); // for Killer
  const stepsRef = useRef([]);
  const animRef = useRef(null);

  // timer
  useEffect(() => {
    let t = null;
    if (running) {
      t = setInterval(() => setTimer((s) => s + 1), 1000);
    }
    return () => clearInterval(t);
  }, [running]);

  // load a default puzzle on mount
  useEffect(() => {
    handleGenerate("Easy");
    // eslint-disable-next-line
  }, []);

  // Validate grid for conflicts (basic)
  useEffect(() => {
    validateGrid();
    // eslint-disable-next-line
  }, [grid, variant, cages]);

  function validateGrid() {
    const conflicts = [];
    // check rows, cols, boxes, diagonals (simple O(n^3) check okay)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = grid[r][c];
        if (val === ".") continue;
        // temporarily remove and check duplication
        const copy = cloneGrid(grid);
        copy[r][c] = ".";
        // reuse solver for validations is heavy — do local checks
        // row/col/box
        for (let k = 0; k < 9; k++) {
          if (copy[r][k] === val) { conflicts.push([r,c]); break; }
          if (copy[k][c] === val) { conflicts.push([r,c]); break; }
        }
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let i = br; i < br+3; i++) for (let j = bc; j < bc+3; j++) if (copy[i][j] === val) conflicts.push([r,c]);
        if (variant === VARIANTS.DIAGONAL) {
          if (r===c) for (let i=0;i<9;i++) if (copy[i][i]===val) conflicts.push([r,c]);
          if (r+c===8) for (let i=0;i<9;i++) if (copy[i][8-i]===val) conflicts.push([r,c]);
        }
        if (variant === VARIANTS.KILLER && cages.length) {
          // find cage and check duplicates and sums
          for (let idx=0; idx<cages.length; idx++){
            const cage = cages[idx];
            let inCage = cage.cells.some(([ri,ci])=>ri===r && ci===c);
            if (inCage) {
              // duplicate?
              const seen = new Set();
              for (const [ri,ci] of cage.cells) {
                const v = copy[ri][ci];
                if (v === ".") continue;
                if (seen.has(v)) conflicts.push([r,c]);
                seen.add(v);
              }
              // sum too big?
              let s = 0; let blanks=0;
              for (const [ri,ci] of cage.cells) {
                const v = copy[ri][ci];
                if (v === ".") blanks++;
                else s += parseInt(v);
              }
              if (s > cage.sum) conflicts.push([r,c]);
            }
          }
        }
      }
    }
    // dedupe conflicts
    const uniq = [];
    const set = new Set();
    for (const [a,b] of conflicts) {
      const key = `${a},${b}`;
      if (!set.has(key)) { set.add(key); uniq.push([a,b]); }
    }
    setConflictCells(uniq);
  }

  // handle cell input
  function setCell(r,c,val) {
    if (!(/^[1-9]?$/.test(val))) return;
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[r][c] = val === "" ? "." : val;
      return next;
    });
  }

  // animate a steps array (list of {row,col,val})
  async function animate(steps) {
    if (!steps || !steps.length) return;
    setRunning(true);
    // cancel previous animation
    if (animRef.current) { clearInterval(animRef.current); animRef.current = null; }
    let i = 0;
    animRef.current = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(animRef.current); animRef.current = null;
        setRunning(false);
        return;
      }
      const s = steps[i++];
      setGrid((prev) => {
        const g = cloneGrid(prev);
        g[s.row][s.col] = s.val;
        return g;
      });
    }, 40);
  }

  // handle Solve
  function handleSolve() {
    const working = cloneGrid(grid);
    const { solved, steps } = solveSudoku(working, variant, cages);
    if (!solved) {
      alert("No solution found (with current constraints).");
      return;
    }
    // steps is the sequence that solver used; animate it
    animate(steps);
  }

  // hint: fill one cell from solver's solution
  function handleHint() {
    const working = cloneGrid(grid);
    const { solved, steps } = solveSudoku(working, variant, cages);
    if (!solved) { alert("No solution available for hint."); return; }
    // find first step that fills an empty cell in current grid
    for (const s of steps) {
      if (grid[s.row][s.col] === ".") {
        setGrid((prev) => {
          const g = cloneGrid(prev);
          g[s.row][s.col] = s.val;
          return g;
        });
        return;
      }
    }
    alert("Nothing to hint — grid looks filled.");
  }

  // generate puzzle
  function handleGenerate(difficulty = "Easy") {
    // difficulty -> clue counts
    const clueMap = { Easy: 36, Medium: 30, Hard: 24 };
    const clues = clueMap[difficulty] || 30;

    // generate full solution
    const solution = generateFullSolution();
    let puzzle = makePuzzleFromSolution(solution, clues);

    // for killer variant create cages from solution and blank the grid
    if (variant === VARIANTS.KILLER) {
      const cagesGen = generateKillerCages(solution);
      setCages(cagesGen);
      // for killer puzzles, often all cells are blank in UI — but we'll remove per clues
      puzzle = makePuzzleFromSolution(solution, clues);
    } else {
      setCages([]);
    }
    setGrid(puzzle);
    setTimer(0);
  }

  function handleVariantChange(v) {
    setVariant(v);
    // reset cages if switching away
    setCages([]);
    handleGenerate("Easy");
  }

  function handleClear() {
    setGrid(makeEmpty());
    setCages([]);
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <h2>Sudoku Solver</h2>
          <div className="small">Bitmask solver • Diagonal & Killer variants • generator, hints, timer</div>
        </div>

        <div className="controls">
          <div className="info">
            <div className="small">Variant</div>
            <select value={variant} onChange={(e)=>handleVariantChange(e.target.value)}>
              {Object.values(VARIANTS).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <div className="small">Difficulty</div>
            <select onChange={(e)=>handleGenerate(e.target.value)}>
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
            <button onClick={handleSolve} disabled={running}>Solve</button>
            <button onClick={handleHint} disabled={running}>Hint</button>
            <button onClick={()=>handleGenerate("Easy")} disabled={running}>Random</button>
            <button onClick={handleClear} disabled={running}>Clear</button>
          </div>
        </div>
      </div>

      <div className="board-row">
        <div>
          <Grid grid={grid} setCell={setCell} conflictCells={conflictCells} cages={cages} />
        </div>

        <div className="side">
          <div className="panel">
            <div className="timer">Timer: {timer}s</div>
            <div className="small" style={{marginTop:8}}>
              Conflicts: {conflictCells.length}
            </div>
            <div style={{marginTop:8}} className="small">Killer cages: {cages.length}</div>
            <div style={{marginTop:10}} className="small">Notes:</div>
            <div className="small">• Cells accept 1–9 only. • Hint fills one cell. • Random generates puzzles based on difficulty.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
