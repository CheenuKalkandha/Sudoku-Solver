// solver.js
// grid uses '.' for empty
// variant: "Classic" | "Diagonal" | "Killer"
// cages: for Killer => array of { cells:[[r,c],...], sum: number }
// returns { solved: boolean, steps: Array<{row,col,val}> }

export function solveSudoku(grid, variant = "Classic", cages = []) {
  const N = 9;
  const FULLMASK = 0x1FF; // 9 bits

  // bitmasks
  const rows = new Array(N).fill(0);
  const cols = new Array(N).fill(0);
  const boxes = new Array(N).fill(0);
  const diag1 = { mask: 0 }; // main diag (r==c)
  const diag2 = { mask: 0 }; // anti diag (r+c==8)

  // Killer-specific helpers
  // cages: list of {cells: [[r,c]], sum}
  const cageIndexOf = Array.from({ length: N }, () => new Array(N).fill(-1));
  const cageUsedMask = []; // bitmask of digits used in each cage
  const cageSum = []; // current sum in each cage
  const cageTarget = []; // target sum

  for (let i = 0; i < cages.length; i++) {
    cageUsedMask[i] = 0;
    cageSum[i] = 0;
    cageTarget[i] = cages[i].sum;
    for (const [r, c] of cages[i].cells) {
      cageIndexOf[r][c] = i;
    }
  }

  const steps = [];

  // initialize masks from given grid
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = grid[r][c];
      if (v >= "1" && v <= "9") {
        const d = parseInt(v) - 1;
        const bit = 1 << d;
        const bidx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (rows[r] & bit) return { solved: false, steps: [] }; // invalid input duplicate
        rows[r] |= bit;
        if (cols[c] & bit) return { solved: false, steps: [] };
        cols[c] |= bit;
        if (boxes[bidx] & bit) return { solved: false, steps: [] };
        boxes[bidx] |= bit;
        if (variant === "Diagonal") {
          if (r === c) {
            if (diag1.mask & bit) return { solved: false, steps: [] };
            diag1.mask |= bit;
          }
          if (r + c === 8) {
            if (diag2.mask & bit) return { solved: false, steps: [] };
            diag2.mask |= bit;
          }
        }
        if (cageIndexOf[r][c] !== -1) {
          const ci = cageIndexOf[r][c];
          if (cageUsedMask[ci] & bit) return { solved: false, steps: [] };
          cageUsedMask[ci] |= bit;
          cageSum[ci] += d + 1;
        }
      }
    }
  }

  // helper: check if placing digit d (0..8) at (r,c) is allowed
  function canPlace(r, c, d) {
    const bit = 1 << d;
    const bidx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    if (rows[r] & bit) return false;
    if (cols[c] & bit) return false;
    if (boxes[bidx] & bit) return false;
    if (variant === "Diagonal") {
      if (r === c && (diag1.mask & bit)) return false;
      if (r + c === 8 && (diag2.mask & bit)) return false;
    }
    if (cageIndexOf[r][c] !== -1) {
      const ci = cageIndexOf[r][c];
      if (cageUsedMask[ci] & bit) return false; // duplicate inside cage
      const curSum = cageSum[ci];
      const target = cageTarget[ci];
      const remainingCells = cages[ci].cells.filter(([ri,ci2]) => grid[ri][ci2] === ".").length;
      // if placing last cell, sum must equal target
      if (remainingCells === 1) {
        if (curSum + (d + 1) !== target) return false;
      } else {
        // cannot exceed target
        if (curSum + (d + 1) >= target) {
          // if >= target and not last cell -> invalid (strict)
          return false;
        }
      }
    }
    return true;
  }

  // backtracking - simple row-major order (keeps your style)
  function backtrack(r = 0, c = 0) {
    if (r === N) return true;
    if (c === N) return backtrack(r + 1, 0);
    if (grid[r][c] !== ".") return backtrack(r, c + 1);

    const bidx = Math.floor(r / 3) * 3 + Math.floor(c / 3);

    for (let d = 0; d < 9; d++) {
      if (!canPlace(r, c, d)) continue;
      const bit = 1 << d;
      // place
      grid[r][c] = String(d + 1);
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[bidx] |= bit;
      if (variant === "Diagonal") {
        if (r === c) diag1.mask |= bit;
        if (r + c === 8) diag2.mask |= bit;
      }
      let ci = cageIndexOf[r][c];
      if (ci !== -1) {
        cageUsedMask[ci] |= bit;
        cageSum[ci] += d + 1;
      }
      steps.push({ row: r, col: c, val: String(d + 1) });

      if (backtrack(r, c + 1)) return true;

      // undo
      steps.push({ row: r, col: c, val: "." }); // for animation we can show undo as well
      grid[r][c] = ".";
      rows[r] ^= bit;
      cols[c] ^= bit;
      boxes[bidx] ^= bit;
      if (variant === "Diagonal") {
        if (r === c) diag1.mask ^= bit;
        if (r + c === 8) diag2.mask ^= bit;
      }
      if (ci !== -1) {
        cageUsedMask[ci] ^= bit;
        cageSum[ci] -= d + 1;
      }
    }
    return false;
  }

  const solved = backtrack();
  return { solved, steps };
}
