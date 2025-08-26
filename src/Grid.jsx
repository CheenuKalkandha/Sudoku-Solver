import React from "react";

export default function Grid({ grid, setCell, conflictCells, cages }) {
  // cages is optional - not used visually here (could be used to draw cage outlines)
  return (
    <div className="grid">
      {grid.map((row, rIdx) =>
        row.map((val, cIdx) => (
          <input
            key={`${rIdx}-${cIdx}`}
            className={`cell ${conflictCells.some(([ri, ci]) => ri === rIdx && ci === cIdx) ? "conflict" : ""}`}
            value={val === "." ? "" : val}
            onChange={(e) => setCell(rIdx, cIdx, e.target.value)}
            maxLength={1}
            inputMode="numeric"
          />
        ))
      )}
    </div>
  );
}
