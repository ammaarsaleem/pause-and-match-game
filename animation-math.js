/* Pause & Match — deterministic animation math.
   Pure functions only: no DOM, no canvas, no Math.random(). */
(function (global) {
  'use strict';

  function wrap01(t) {
    return ((t % 1) + 1) % 1;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function angDist(ang) {
    var a = Math.abs(((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    if (a > Math.PI) a = Math.PI * 2 - a;
    return a;
  }

  function emptyPose() {
    return { ang: 0, dx: 0, dy: 0, scale: 1, wrap: undefined, alpha: 1 };
  }

  function poseOf(ang, dx, dy, scale, wrap, alpha) {
    return {
      ang: ang || 0,
      dx: dx || 0,
      dy: dy || 0,
      scale: scale === undefined ? 1 : scale,
      wrap: wrap,
      alpha: alpha === undefined ? 1 : alpha
    };
  }

  /* Mulberry32 — same seed always yields the same stream. */
  function seededRandom(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashAnimationConfig(parts) {
    var str = (parts || []).join('|');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* 0 at t=0 and t=1, 1 at t=0.5. Integer cycles keep the loop seamless. */
  function cosineLoop(t) {
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function identity(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return a;
  }

  function shuffleInPlace(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function randomPerm(n, rng) {
    return shuffleInPlace(identity(n), rng);
  }

  /* ---- existing six poses (numeric; formulas copied from the studio) ---- */

  function poseRotate(t, k, dir) {
    return poseOf(dir * t * Math.PI * 2 * k, 0, 0, 1);
  }

  function poseSwing(t, k, dir, travel) {
    return poseOf(dir * travel * Math.PI * Math.sin(t * Math.PI * 2 * k), 0, 0, 1);
  }

  function poseOrbit(t, k, dir, r) {
    var th = dir * t * Math.PI * 2 * k;
    return poseOf(0, r - r * Math.cos(th), -r * Math.sin(th) * 0.55, 1);
  }

  function poseSweep(t, k, dir, Dx, Dy) {
    var u = wrap01(dir * t * k);
    var dx = u * Dx;
    var dy = u * Dy;
    return poseOf(0, dx, dy, 1, { dx: dx - Dx, dy: dy - Dy });
  }

  function poseCarousel(t, k, dir, vx, vy) {
    var th = dir * t * Math.PI * 2 * k;
    var cs = Math.cos(th), sn = Math.sin(th);
    return poseOf(th, vx * cs - vy * sn - vx, vx * sn + vy * cs - vy, 1);
  }

  function posePulse(t, k, travel) {
    return poseOf(0, 0, 0, 1 + travel * Math.abs(Math.sin(Math.PI * t * k)));
  }

  /* ---- new object motions ---- */

  /* Slide: cosine excursion along an axis, rest at both loop ends. */
  function poseSlide(t, k, dir, dist, axis) {
    var p = cosineLoop(t * k) * dir * dist;
    if (axis === 'y') return poseOf(0, 0, p, 1);
    if (axis === 'diag') return poseOf(0, p * 0.75, p * 0.75, 1);
    return poseOf(0, p, 0, 1);
  }

  /* Drop: vertical cosine, optional gravity ease that is 0 at both ends.
     Outbound uses ease-in, inbound uses the complementary ease-out so
     the path is continuous and the loop does not pop. */
  function poseDrop(t, k, dir, dist, gravity) {
    var tau = wrap01(t * k);
    var p = cosineLoop(tau);
    if (gravity) {
      if (tau < 0.5) p = p * p;
      else p = 1 - Math.pow(1 - p, 2);
    }
    return poseOf(0, 0, p * dir * dist, 1);
  }

  /* Bounce: |sin| so the piece crosses rest twice per cycle. */
  function poseBounce(t, k, dir, dist) {
    return poseOf(0, 0, Math.abs(Math.sin(t * Math.PI * 2 * k)) * dir * dist, 1);
  }

  /* Cross: even indexes one way, odd the other. Cosine loop, rest at ends. */
  function poseCross(t, k, dir, dist, axis, index) {
    var sign = (index % 2 === 0 ? 1 : -1) * dir;
    var p = cosineLoop(t * k) * sign * dist;
    if (axis === 'y') return poseOf(0, 0, p, 1);
    if (axis === 'diag') return poseOf(0, p * 0.75, -p * 0.75, 1);
    return poseOf(0, p, 0, 1);
  }

  /* Wave: subtract sin(phase) so t=0/1 stay at rest despite index offsets. */
  function poseWave(t, k, amp, phase, axis) {
    var dy = (Math.sin(t * Math.PI * 2 * k + phase) - Math.sin(phase)) * amp;
    if (axis === 'x') return poseOf(0, dy, 0, 1);
    if (axis === 'diag') return poseOf(0, dy * 0.7, dy, 1);
    return poseOf(0, 0, dy, 1);
  }

  /* Conveyor: shared wrap travel plus a compensated index phase so t=0 is rest. */
  function poseConveyor(t, k, dir, Dx, Dy, index, spacing) {
    var u = wrap01(dir * t * k + index * spacing);
    var u0 = wrap01(index * spacing);
    var dx = (u - u0) * Dx;
    var dy = (u - u0) * Dy;
    return poseOf(0, dx, dy, 1, { dx: (u - 1 - u0) * Dx, dy: (u - 1 - u0) * Dy });
  }

  /* Elastic: damped sine, forced to 0 at t=0 and t=1 by an integer cycle count
     plus a (1-t) window so the tail cannot leak across the loop. */
  function elasticWindow(t) {
    t = wrap01(t);
    return Math.sin(2 * Math.PI * 3 * t) * Math.exp(-4 * t) * (1 - t);
  }

  function poseElastic(t, dist, axis) {
    var w = elasticWindow(t);
    var dx = 0, dy = 0;
    if (axis === 'y') dy = w * dist;
    else if (axis === 'diag') { dx = w * dist * 0.7; dy = w * dist * 0.7; }
    else dx = w * dist;
    return poseOf(w * 0.35, dx, dy, 1 + w * 0.12);
  }

  /* Blur Rush: leave and return with a steep |2t-1|^3 envelope — high speed
     near rest, lingering in the middle. */
  function poseBlurRush(t, k, dir, dist, axis) {
    var tau = wrap01(t * k);
    var p = 1 - Math.pow(Math.abs(2 * tau - 1), 3);
    p *= dir * dist;
    if (axis === 'y') return poseOf(0, 0, p, 1);
    if (axis === 'diag') return poseOf(0, p * 0.75, p * 0.75, 1);
    return poseOf(0, p, 0, 1);
  }

  /* Spotlight: the loop is split into `count` equal slots. Only `index` is
     visible in its slot. Everyone is staged at (cx, cy) so the viewer sees
     one object at a time from the list. */
  function spotlightSlot(t, k, count) {
    count = Math.max(1, count | 0);
    return Math.floor(wrap01(t * k) * count) % count;
  }

  function poseSpotlight(t, k, index, count, restX, restY, cx, cy) {
    var alpha = spotlightSlot(t, k, count) === index ? 1 : 0;
    return poseOf(0, (cx || 0) - (restX || 0), (cy || 0) - (restY || 0), 1, undefined, alpha);
  }

  /* Center run: equally spaced on a belt. `gap` is centre-to-centre in pixels.
     Track is at least one screen so wrapping never teleports across the frame.
     When gap * count > W the belt is longer than the screen and objects
     enter from one edge with that spacing intact. */
  function centerRunTrack(count, W, gap) {
    count = Math.max(1, count | 0);
    gap = gap > 0 ? gap : W / count;
    return Math.max(W, count * gap);
  }

  function centerRunX(t, k, dir, index, count, W, gap) {
    count = Math.max(1, count | 0);
    gap = gap > 0 ? gap : W / count;
    var track = centerRunTrack(count, W, gap);
    var x = index * gap + dir * wrap01(t) * k * track;
    return ((x % track) + track) % track;
  }

  function poseCenterRun(t, k, dir, index, count, restX, restY, W, H, gap) {
    var track = centerRunTrack(count, W, gap);
    var wrapped = centerRunX(t, k, dir, index, count, W, gap);
    var layoutY = H * 0.52;
    var dy = layoutY - restY;
    var behind = dir >= 0 ? wrapped - track : wrapped + track;
    return poseOf(0, wrapped - restX, dy, 1, { dx: behind - restX, dy: dy });
  }

  function centerRunCenterErr(x, W, track) {
    var mid = W / 2;
    track = track > 0 ? track : W;
    return Math.min(Math.abs(x - mid), Math.abs(x - track - mid), Math.abs(x + track - mid));
  }

  /* ---- formations ---- */

  function formationUnits(kind, n, rng) {
    var pts = [];
    var i, row, col, cols, rows;
    function push(x, y) { pts.push({ x: x, y: y }); }

    switch (kind) {
      case 'line':
        for (i = 0; i < n; i++) push(n === 1 ? 0 : (i / (n - 1)) * 2 - 1, 0);
        break;
      case 'v':
        for (i = 0; i < n; i++) {
          var u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          push(u, Math.abs(u));
        }
        break;
      case 'triangle':
        if (n === 1) push(0, 0);
        else if (n === 2) { push(-0.7, 0.5); push(0.7, 0.5); }
        else {
          push(0, -1);
          for (i = 1; i < n; i++) {
            var f = (i - 1) / Math.max(1, n - 2);
            push(-1 + 2 * f, 0.85);
          }
        }
        break;
      case 'diamond':
        if (n <= 1) push(0, 0);
        else if (n === 2) { push(0, -0.8); push(0, 0.8); }
        else if (n === 3) { push(0, -1); push(-0.9, 0.2); push(0.9, 0.2); }
        else if (n === 4) { push(0, -1); push(-1, 0); push(1, 0); push(0, 1); }
        else {
          push(0, -1);
          push(-1, 0);
          push(1, 0);
          push(0, 0.15);
          push(0, 1);
          for (i = 5; i < n; i++) push(((i % 2) ? -1 : 1) * (0.45 + (i - 5) * 0.15), 0.55);
        }
        break;
      case '23':
        cols = [2, 3];
        fillRows(cols, n, push);
        break;
      case '32':
        cols = [3, 2];
        fillRows(cols, n, push);
        break;
      case 'random':
        for (i = 0; i < n; i++) push(rng() * 2 - 1, rng() * 2 - 1);
        break;
      case 'custom':
        cols = Math.ceil(Math.sqrt(n));
        rows = Math.ceil(n / cols);
        for (i = 0; i < n; i++) {
          row = Math.floor(i / cols);
          col = i % cols;
          push(cols === 1 ? 0 : (col / (cols - 1)) * 2 - 1, rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1);
        }
        break;
      default:
        throw new Error('unknown formation ' + kind);
    }
    return pts;
  }

  function fillRows(cols, n, push) {
    var placed = 0, r, c, rows = cols.length;
    for (r = 0; r < rows && placed < n; r++) {
      var count = cols[r];
      for (c = 0; c < count && placed < n; c++, placed++) {
        var x = count === 1 ? 0 : (c / (count - 1)) * 2 - 1;
        var y = rows === 1 ? 0 : (r / (rows - 1)) * 2 - 1;
        push(x, y);
      }
    }
    while (placed < n) {
      push(((placed % 2) ? -1 : 1) * 0.4, 1.15);
      placed++;
    }
  }

  function formationTargets(kind, rests, seed, span) {
    var rng = seededRandom(seed || 1);
    var units = formationUnits(kind, rests.length, rng);
    var cx = 0, cy = 0, i;
    for (i = 0; i < rests.length; i++) { cx += rests[i].x; cy += rests[i].y; }
    cx /= rests.length || 1;
    cy /= rests.length || 1;
    var s = span || 280;
    return units.map(function (u) {
      return { x: cx + u.x * s, y: cy + u.y * s };
    });
  }

  function poseFormation(t, rest, target) {
    var p = cosineLoop(t);
    return poseOf(0, (target.x - rest.x) * p, (target.y - rest.y) * p, 1);
  }

  /* ---- shuffle / teleport sequences ---- */

  function permutationSequence(n, seed, steps) {
    var rng = seededRandom(seed || 1);
    var seq = [identity(n)];
    var extra = Math.max(1, (steps || 4) - 2);
    for (var s = 0; s < extra; s++) seq.push(randomPerm(n, rng));
    seq.push(identity(n));
    return seq;
  }

  function poseShuffle(t, index, rests, seq) {
    if (!rests.length) return emptyPose();
    var u = wrap01(t) * (seq.length - 1);
    var i = Math.min(seq.length - 2, Math.floor(u));
    var f = smoothstep(u - i);
    var rest = rests[index];
    var a = rests[seq[i][index]];
    var b = rests[seq[i + 1][index]];
    return poseOf(0, lerp(a.x, b.x, f) - rest.x, lerp(a.y, b.y, f) - rest.y, 1);
  }

  function poseTeleport(t, index, rests, seq, flash) {
    if (!rests.length) return emptyPose();
    flash = clamp(flash === undefined ? 0.06 : flash, 0.02, 0.35);
    var segs = seq.length - 1;
    var u = wrap01(t) * segs;
    var seg = Math.min(segs - 1, Math.floor(u));
    var local = u - seg;
    var from = seq[seg][index];
    var to = seq[seg + 1][index];
    var alpha = 1, scale = 1, posIdx = from;
    var hold = 1 - flash;
    if (local > hold) {
      var f = (local - hold) / flash;
      if (f < 0.5) {
        alpha = 1 - f * 2;
        posIdx = from;
        scale = 1 - f * 0.35;
      } else {
        alpha = (f - 0.5) * 2;
        posIdx = to;
        scale = 0.65 + (f - 0.5) * 2 * 0.35;
      }
    }
    var rest = rests[index];
    var dest = rests[posIdx];
    return poseOf(0, dest.x - rest.x, dest.y - rest.y, scale, undefined, alpha);
  }

  /* ---- phase remappers ---- */

  function remapSpeedRamp(t, intensity) {
    intensity = clamp(intensity === undefined ? 0 : intensity, 0, 1);
    t = wrap01(t);
    return t + intensity * (easeInOut(t) - t);
  }

  function remapReverse(t) {
    t = wrap01(t);
    return t < 0.5 ? t * 2 : 2 - t * 2;
  }

  /* Integrate a velocity that dips near `pos` so playback almost stops on a
     non-rest pose. The integral is normalized to 1 so t=0→0 and t=1→1. */
  function remapFakeStop(t, strength, pos) {
    t = wrap01(t);
    strength = clamp(strength === undefined ? 0.65 : strength, 0, 0.95);
    pos = clamp(pos === undefined ? 0.38 : pos, 0.12, 0.88);
    var width = 0.09;
    var samples = 48;
    var acc = 0;
    var target = t * samples;
    var total = 0;
    var i, u, v, bump, x;
    for (i = 0; i < samples; i++) {
      u = (i + 0.5) / samples;
      x = (u - pos) / width;
      bump = Math.exp(-x * x);
      v = 1 - strength * bump;
      if (v < 0.04) v = 0.04;
      total += v;
      if (i + 1 <= target) acc += v;
      else if (i < target) acc += v * (target - i);
    }
    return acc / total;
  }

  function buildAccelProfile(seed, segments) {
    var n = segments || 8;
    var rng = seededRandom(seed || 1);
    var speeds = [];
    var i;
    for (i = 0; i < n; i++) speeds.push(0.2 + rng() * 1.8);
    var cum = [0];
    for (i = 0; i < n; i++) cum.push(cum[i] + speeds[i]);
    var total = cum[n] || 1;
    return { cum: cum.map(function (x) { return x / total; }), n: n };
  }

  function sampleAccel(profile, t) {
    if (!profile || !profile.n) return wrap01(t);
    t = wrap01(t);
    var x = t * profile.n;
    var i = Math.min(profile.n - 1, Math.floor(x));
    var f = x - i;
    return lerp(profile.cum[i], profile.cum[i + 1], f);
  }

  function remapPhase(t, phaseMod, params) {
    params = params || {};
    var u = wrap01(t);
    var ramp = params.rampIntensity || 0;
    if (ramp > 0) u = remapSpeedRamp(u, ramp);
    switch (phaseMod) {
      case '':
      case undefined:
      case null:
        break;
      case 'speedRamp':
        if (ramp <= 0) u = remapSpeedRamp(u, params.intensity || 0.5);
        break;
      case 'reverse':
        u = remapReverse(u);
        break;
      case 'fakeStop':
        u = remapFakeStop(u, params.strength, params.position);
        break;
      case 'randomAccel':
        u = sampleAccel(params.profile, u);
        break;
      default:
        throw new Error('unknown phase ' + phaseMod);
    }
    return wrap01(u);
  }

  function baseLandings(mode) {
    switch (mode) {
      case 'swing':
      case 'bounce':
        return 2;
      case 'rotate':
      case 'orbit':
      case 'sweep':
      case 'carousel':
      case 'pulse':
      case 'slide':
      case 'drop':
      case 'cross':
      case 'shuffle':
      case 'formation':
      case 'wave':
      case 'conveyor':
      case 'elastic':
      case 'teleport':
      case 'blurRush':
      case 'spotlight':
      case 'centerRun':
        return 1;
      default:
        throw new Error('unknown mode ' + mode);
    }
  }

  function phaseLandings(phaseMod) {
    return phaseMod === 'reverse' ? 2 : 1;
  }

  var PMMath = {
    wrap01: wrap01,
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    angDist: angDist,
    emptyPose: emptyPose,
    poseOf: poseOf,
    seededRandom: seededRandom,
    hashAnimationConfig: hashAnimationConfig,
    cosineLoop: cosineLoop,
    easeInOut: easeInOut,
    poseRotate: poseRotate,
    poseSwing: poseSwing,
    poseOrbit: poseOrbit,
    poseSweep: poseSweep,
    poseCarousel: poseCarousel,
    posePulse: posePulse,
    poseSlide: poseSlide,
    poseDrop: poseDrop,
    poseBounce: poseBounce,
    poseCross: poseCross,
    poseWave: poseWave,
    poseConveyor: poseConveyor,
    elasticWindow: elasticWindow,
    poseElastic: poseElastic,
    poseBlurRush: poseBlurRush,
    spotlightSlot: spotlightSlot,
    poseSpotlight: poseSpotlight,
    centerRunTrack: centerRunTrack,
    centerRunX: centerRunX,
    poseCenterRun: poseCenterRun,
    centerRunCenterErr: centerRunCenterErr,
    formationUnits: formationUnits,
    formationTargets: formationTargets,
    poseFormation: poseFormation,
    permutationSequence: permutationSequence,
    poseShuffle: poseShuffle,
    poseTeleport: poseTeleport,
    remapSpeedRamp: remapSpeedRamp,
    remapReverse: remapReverse,
    remapFakeStop: remapFakeStop,
    buildAccelProfile: buildAccelProfile,
    sampleAccel: sampleAccel,
    remapPhase: remapPhase,
    baseLandings: baseLandings,
    phaseLandings: phaseLandings
  };

  global.PMMath = PMMath;
})(typeof window !== 'undefined' ? window : globalThis);
