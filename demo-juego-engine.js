(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AdalamPlay = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var ROWS = 6;
  var COLS = 7;
  var SOL = 0, GOTA = 1, HOJA = 2, ESTRELLA = 3, RAYO = 4, CORAZON = 5;

  function isPlay(cell) {
    return !!(cell && !cell.stone && !cell.heart);
  }

  function typeAt(grid, r, c) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    var cell = grid[r][c];
    if (!isPlay(cell)) return null;
    return cell.t;
  }

  function pickAvoid(grid, r, c, rand) {
    var banned = {};
    function banPair(a, b) {
      if (a !== null && a === b) banned[a] = true;
    }
    banPair(typeAt(grid, r, c - 1), typeAt(grid, r, c - 2));
    banPair(typeAt(grid, r, c + 1), typeAt(grid, r, c + 2));
    banPair(typeAt(grid, r, c - 1), typeAt(grid, r, c + 1));
    banPair(typeAt(grid, r - 1, c), typeAt(grid, r - 2, c));
    banPair(typeAt(grid, r + 1, c), typeAt(grid, r + 2, c));
    banPair(typeAt(grid, r - 1, c), typeAt(grid, r + 1, c));
    var t = 0;
    var i = 0;
    do {
      t = Math.floor(rand() * 6);
      i++;
    } while (banned[t] && i < 24);
    return t;
  }

  function findMatches(grid) {
    var hit = [];
    function take(run) {
      if (run.length >= 3) {
        for (var i = 0; i < run.length; i++) hit.push(run[i]);
      }
    }
    var r, c, run, cell;
    for (r = 0; r < ROWS; r++) {
      run = [];
      for (c = 0; c < COLS; c++) {
        cell = grid[r][c];
        if (isPlay(cell) && run.length && run[0].t === cell.t) run.push({ r: r, c: c, t: cell.t });
        else {
          take(run);
          run = isPlay(cell) ? [{ r: r, c: c, t: cell.t }] : [];
        }
      }
      take(run);
    }
    for (c = 0; c < COLS; c++) {
      run = [];
      for (r = 0; r < ROWS; r++) {
        cell = grid[r][c];
        if (isPlay(cell) && run.length && run[0].t === cell.t) run.push({ r: r, c: c, t: cell.t });
        else {
          take(run);
          run = isPlay(cell) ? [{ r: r, c: c, t: cell.t }] : [];
        }
      }
      take(run);
    }
    var uniq = [];
    var seen = {};
    for (var k = 0; k < hit.length; k++) {
      var key = hit[k].r + "," + hit[k].c;
      if (seen[key]) continue;
      seen[key] = true;
      uniq.push(hit[k]);
    }
    return uniq;
  }

  function swapCells(grid, r1, c1, r2, c2) {
    var tmp = grid[r1][c1];
    grid[r1][c1] = grid[r2][c2];
    grid[r2][c2] = tmp;
  }

  function hasMove(grid) {
    var dirs = [[0, 1], [1, 0]];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!isPlay(grid[r][c])) continue;
        for (var d = 0; d < dirs.length; d++) {
          var rr = r + dirs[d][0];
          var cc = c + dirs[d][1];
          if (rr >= ROWS || cc >= COLS || !isPlay(grid[rr][cc])) continue;
          swapCells(grid, r, c, rr, cc);
          var ok = findMatches(grid).length > 0;
          swapCells(grid, r, c, rr, cc);
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function findHint(grid) {
    var dirs = [[0, 1], [1, 0]];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (!isPlay(grid[r][c])) continue;
        for (var d = 0; d < dirs.length; d++) {
          var rr = r + dirs[d][0];
          var cc = c + dirs[d][1];
          if (rr >= ROWS || cc >= COLS || !isPlay(grid[rr][cc])) continue;
          swapCells(grid, r, c, rr, cc);
          var ok = findMatches(grid).length > 0;
          swapCells(grid, r, c, rr, cc);
          if (ok) return [{ r: r, c: c }, { r: rr, c: cc }];
        }
      }
    }
    return null;
  }

  function seedBoard(rand) {
    var guard = 0;
    while (guard++ < 30) {
      var grid = [];
      for (var r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (var c = 0; c < COLS; c++) grid[r][c] = null;
      }
      for (r = 0; r < ROWS; r++) {
        for (c = 0; c < COLS; c++) grid[r][c] = { t: pickAvoid(grid, r, c, rand) };
      }
      if (!findMatches(grid).length && hasMove(grid)) return grid;
    }
    return grid;
  }

  function collapse(grid) {
    for (var c = 0; c < COLS; c++) {
      var segStart = 0;
      for (var r = 0; r <= ROWS; r++) {
        var blocker = r < ROWS && grid[r][c] && (grid[r][c].stone || grid[r][c].heart);
        if (r === ROWS || blocker) {
          var tiles = [];
          for (var i = segStart; i < r; i++) {
            if (isPlay(grid[i][c])) tiles.push(grid[i][c]);
          }
          var empties = (r - segStart) - tiles.length;
          for (i = 0; i < empties; i++) grid[segStart + i][c] = null;
          for (i = 0; i < tiles.length; i++) grid[segStart + empties + i][c] = tiles[i];
          segStart = r + 1;
        }
      }
    }
  }

  function fillHoles(grid, rand) {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (grid[r][c] == null) grid[r][c] = { t: pickAvoid(grid, r, c, rand) };
      }
    }
  }

  function reshuffle(grid, rand) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var spots = [];
      var types = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (isPlay(grid[r][c])) {
            spots.push([r, c]);
            types.push(grid[r][c].t);
          }
        }
      }
      for (var i = types.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = types[i];
        types[i] = types[j];
        types[j] = tmp;
      }
      for (i = 0; i < spots.length; i++) grid[spots[i][0]][spots[i][1]] = { t: types[i] };
      if (!findMatches(grid).length && hasMove(grid)) return true;
    }
    return false;
  }

  function near(grid, r, c, pred) {
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var rr = r + dr;
        var cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
        if (pred(grid[rr][cc])) return true;
      }
    }
    return false;
  }

  function judgeRebuild(grid, cleared) {
    var touching = [];
    for (var i = 0; i < cleared.length; i++) {
      if (near(grid, cleared[i].r, cleared[i].c, function (n) { return n && n.stone; })) touching.push(cleared[i]);
    }
    if (!touching.length) return null;
    for (i = 0; i < touching.length; i++) if (touching[i].t === ESTRELLA) return { pts: 3 };
    return { pts: 2 };
  }

  function judgeHeart(grid, cleared) {
    for (var i = 0; i < cleared.length; i++) {
      if (near(grid, cleared[i].r, cleared[i].c, function (n) { return n && n.heart; })) return { pts: 3 };
    }
    for (i = 0; i < cleared.length; i++) if (cleared[i].t === CORAZON) return { pts: 2 };
    return null;
  }

  function judgePlan(cleared, situation) {
    var need = situation.need[situation.step];
    var hit = false;
    for (var i = 0; i < cleared.length; i++) if (cleared[i].t === need) hit = true;
    if (hit) return { pts: situation.partial ? 2 : 3, advance: true };
    if (!situation.partial) return { arm: true };
    return { pts: 1, advance: true };
  }

  return {
    ROWS: ROWS,
    COLS: COLS,
    SOL: SOL,
    GOTA: GOTA,
    HOJA: HOJA,
    ESTRELLA: ESTRELLA,
    RAYO: RAYO,
    CORAZON: CORAZON,
    isPlay: isPlay,
    findMatches: findMatches,
    swapCells: swapCells,
    hasMove: hasMove,
    findHint: findHint,
    seedBoard: seedBoard,
    collapse: collapse,
    fillHoles: fillHoles,
    reshuffle: reshuffle,
    judgeRebuild: judgeRebuild,
    judgeHeart: judgeHeart,
    judgePlan: judgePlan
  };
});
