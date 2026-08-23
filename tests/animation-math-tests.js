/* Shared math tests — works in the browser (tests/animation-math.html) and Node. */
(function (global) {
  'use strict';
  var fails = [];
  var passes = 0;

  function near(a, b, eps) {
    eps = eps === undefined ? 1e-6 : eps;
    return Math.abs(a - b) <= eps;
  }

  function ok(cond, msg) {
    if (cond) passes++;
    else fails.push(msg);
  }

  function assertNear(a, b, msg, eps) {
    ok(near(a, b, eps), (msg || 'near') + ' expected ' + b + ' got ' + a);
  }

  function assertFinitePose(p, label) {
    ok(p && isFinite(p.ang) && isFinite(p.dx) && isFinite(p.dy) && isFinite(p.scale),
      label + ' must be finite');
    ok(p.alpha === undefined || isFinite(p.alpha), label + ' alpha finite');
  }

  function solved(p, label, eps) {
    eps = eps || 1e-5;
    assertNear(p.dx, 0, label + ' dx', eps);
    assertNear(p.dy, 0, label + ' dy', eps);
    assertNear(global.PMMath.angDist(p.ang), 0, label + ' ang', 1e-4);
    assertNear(p.scale, 1, label + ' scale', 1e-4);
    if (p.alpha !== undefined) assertNear(p.alpha, 1, label + ' alpha', 1e-4);
  }

  function runPoseSuite(name, fn, skipSeam) {
    var a = fn(0);
    var b = fn(1);
    var c = fn(global.PMMath.wrap01(1));
    assertFinitePose(a, name + ' t=0');
    assertFinitePose(b, name + ' t=1');
    solved(a, name + ' t=0');
    solved(c, name + ' wrap(1)');
    [0.25, 0.5, 0.75, 0.999].forEach(function (t) {
      assertFinitePose(fn(t), name + ' t=' + t);
    });
    if (!skipSeam) {
      var late = fn(1 - 1e-6);
      var d = Math.hypot(late.dx - a.dx, late.dy - a.dy);
      ok(d < 3 || global.PMMath.angDist(late.ang - a.ang) < 0.05 || Math.abs(late.scale - a.scale) < 0.05,
        name + ' seam should be small, dist=' + d);
    }
  }

  function run() {
    var M = global.PMMath;
    fails = [];
    passes = 0;
    if (!M) {
      return { passes: 0, fails: ['PMMath is not loaded'] };
    }

    /* Existing six — numeric snapshots of the studio formulas */
    assertNear(M.poseRotate(0.25, 1, 1).ang, Math.PI / 2, 'rotate 0.25');
    assertNear(M.poseSwing(0.25, 1, 1, 0.4).ang, 0.4 * Math.PI, 'swing 0.25');
    var orb = M.poseOrbit(0.25, 1, 1, 100);
    assertNear(orb.dx, 100, 'orbit dx');
    assertNear(orb.dy, -55, 'orbit dy');
    var sw = M.poseSweep(0.25, 1, 1, 1080, 0);
    assertNear(sw.dx, 270, 'sweep dx');
    assertNear(sw.wrap.dx, 270 - 1080, 'sweep wrap');
    var car = M.poseCarousel(0.25, 1, 1, 50, 0);
    assertNear(car.ang, Math.PI / 2, 'carousel ang');
    assertNear(car.dx, -50, 'carousel dx');
    assertNear(car.dy, 50, 'carousel dy');
    assertNear(M.posePulse(0.5, 1, 0.4).scale, 1.4, 'pulse mid');

    runPoseSuite('rotate', function (t) { return M.poseRotate(t, 1, 1); });
    runPoseSuite('swing', function (t) { return M.poseSwing(t, 1, 1, 0.4); });
    runPoseSuite('orbit', function (t) { return M.poseOrbit(t, 1, 1, 80); });
    runPoseSuite('sweep', function (t) { return M.poseSweep(t, 1, 1, 1080, 0); }, true);
    runPoseSuite('carousel', function (t) { return M.poseCarousel(t, 1, 1, 40, 10); });
    runPoseSuite('pulse', function (t) { return M.posePulse(t, 1, 0.4); });
    runPoseSuite('slide', function (t) { return M.poseSlide(t, 1, 1, 120, 'x'); });
    runPoseSuite('drop', function (t) { return M.poseDrop(t, 1, 1, 140, true); });
    runPoseSuite('bounce', function (t) { return M.poseBounce(t, 1, 1, 90); });
    runPoseSuite('cross-even', function (t) { return M.poseCross(t, 1, 1, 100, 'x', 0); });
    runPoseSuite('cross-odd', function (t) { return M.poseCross(t, 1, 1, 100, 'x', 1); });
    runPoseSuite('wave', function (t) { return M.poseWave(t, 1, 80, 0.7 * 2, 'y'); });
    runPoseSuite('conveyor', function (t) { return M.poseConveyor(t, 1, 1, 1080, 0, 2, 0.1); });
    runPoseSuite('elastic', function (t) { return M.poseElastic(t, 90, 'x'); });
    runPoseSuite('blurRush', function (t) { return M.poseBlurRush(t, 1, 1, 110, 'x'); });

    var rests = [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 500, y: 200 }, { x: 700, y: 200 }, { x: 900, y: 200 }];
    var shuf = M.permutationSequence(5, 7, 4);
    ok(shuf[0].join() === '0,1,2,3,4', 'shuffle starts as identity');
    ok(shuf[shuf.length - 1].join() === '0,1,2,3,4', 'shuffle ends as identity');
    runPoseSuite('shuffle-0', function (t) { return M.poseShuffle(t, 0, rests, shuf); });
    runPoseSuite('shuffle-3', function (t) { return M.poseShuffle(t, 3, rests, shuf); });

    var formT = M.formationTargets('diamond', rests, 3, 280);
    ok(formT.length === 5, 'diamond has 5 targets');
    runPoseSuite('formation-0', function (t) { return M.poseFormation(t, rests[0], formT[0]); });

    var tel = M.permutationSequence(5, 11, 3);
    var p0 = M.poseTeleport(0, 0, rests, tel, 0.06);
    solved(p0, 'teleport t=0');
    assertFinitePose(M.poseTeleport(0.5, 2, rests, tel, 0.06), 'teleport mid');
    var sameA = M.permutationSequence(4, 21, 4).map(function (r) { return r.join(); }).join('/');
    var sameB = M.permutationSequence(4, 21, 4).map(function (r) { return r.join(); }).join('/');
    ok(sameA === sameB, 'same seed same shuffle');
    ok(M.permutationSequence(4, 21, 4).map(function (r) { return r.join(); }).join('/') !==
      M.permutationSequence(4, 22, 4).map(function (r) { return r.join(); }).join('/'),
      'different seeds differ');

    /* remappers */
    assertNear(M.remapSpeedRamp(0, 0.8), 0, 'ramp 0');
    assertNear(M.remapSpeedRamp(1, 0.8), 0, 'ramp 1 wraps to 0 via wrap? wait — remapSpeedRamp(1) is wrap01(1)=0 then ease');
    /* wrap01(1) is 0, so remapSpeedRamp(1) === remapSpeedRamp(0). Call with 0.999 */
    assertNear(M.remapPhase(0, 'speedRamp', { intensity: 0.8 }), 0, 'phase ramp 0');
    assertNear(M.remapPhase(0, 'reverse', {}), 0, 'reverse 0');
    assertNear(M.remapReverse(0.5), 1, 'reverse mid is 1');
    assertNear(M.remapReverse(1), 0, 'reverse end');

    var fake = M.remapFakeStop(0.38, 0.85, 0.38);
    ok(fake > 0.05 && fake < 0.9, 'fake stop phase is not rest, got ' + fake);
    var slideAtFake = M.poseSlide(fake, 1, 1, 120, 'x');
    ok(Math.abs(slideAtFake.dx) > 4, 'fake stop is not a geometric win, dx=' + slideAtFake.dx);

    var prof = M.buildAccelProfile(5, 8);
    var s1 = M.sampleAccel(prof, 0.3);
    var s2 = M.sampleAccel(M.buildAccelProfile(5, 8), 0.3);
    assertNear(s1, s2, 'accel deterministic');
    assertNear(M.sampleAccel(prof, 0), 0, 'accel starts 0');
    assertNear(M.sampleAccel(prof, 1), 0, 'accel wrap 1 -> 0');
    ok(M.sampleAccel(prof, 0.999) > 0.9, 'accel near end near 1');

    var stacked = M.remapPhase(0.2, 'fakeStop', { rampIntensity: 0.6, strength: 0.7, position: 0.38 });
    ok(isFinite(stacked), 'stacked ramp+fakeStop finite');

    ok(M.baseLandings('swing') === 2 && M.baseLandings('bounce') === 2, 'double landings');
    ok(M.baseLandings('slide') === 1 && M.phaseLandings('reverse') === 2, 'reverse doubles');
    ok(M.baseLandings('spotlight') === 1 && M.baseLandings('centerRun') === 1, 'pick-mode landings');

    var vis = 0, i;
    for (i = 0; i < 5; i++) {
      var sp = M.poseSpotlight(0.12, 1, i, 5, 100, 200, 540, 960);
      assertFinitePose(sp, 'spotlight ' + i);
      if (sp.alpha > 0.5) vis++;
    }
    ok(vis === 1, 'spotlight shows exactly one object');
    ok(M.poseSpotlight(0, 1, 0, 5, 0, 0, 540, 960).alpha === 1, 'spotlight slot 0 at t=0');
    ok(M.poseSpotlight(0, 1, 1, 5, 0, 0, 540, 960).alpha === 0, 'others hidden at t=0');
    ok(M.spotlightSlot(0, 1, 5) === 0 && M.spotlightSlot(0.99, 1, 5) === 4, 'spotlight slots cover the list');

    var cr = M.poseCenterRun(0.3, 1, 1, 2, 5, 200, 900, 1080, 1920, 420);
    assertFinitePose(cr, 'centerRun');
    ok(cr.wrap && isFinite(cr.wrap.dx), 'centerRun wrap');
    var x0 = M.centerRunX(0, 1, 1, 0, 5, 1080, 420);
    var x1 = M.centerRunX(1, 1, 1, 0, 5, 1080, 420);
    assertNear(x0, x1, 'centerRun loops');
    var a = M.centerRunX(0, 1, 1, 0, 5, 1080, 420);
    var b = M.centerRunX(0, 1, 1, 1, 5, 1080, 420);
    assertNear(Math.abs(b - a), 420, 'centerRun respects gap');
    ok(M.centerRunTrack(5, 1080, 420) === 2100, 'belt longer than the frame when spaced out');
    ok(M.centerRunCenterErr(540, 1080, 2100) < 1, 'exact centre is a hit');
    ok(M.centerRunCenterErr(100, 1080, 2100) > 30, 'off-centre is not a hit');
    var threw = false;
    try { M.baseLandings('nope'); } catch (e) { threw = true; }
    ok(threw, 'unknown mode throws');

    var r1 = M.seededRandom(99)();
    var r2 = M.seededRandom(99)();
    assertNear(r1, r2, 'seededRandom stable');

    var forms = ['line', 'v', 'triangle', 'diamond', '23', '32', 'random', 'custom'];
    forms.forEach(function (k) {
      var u = M.formationUnits(k, 5, M.seededRandom(3));
      ok(u.length === 5, k + ' units for 5');
      u.forEach(function (pt, i) {
        ok(isFinite(pt.x) && isFinite(pt.y), k + ' unit ' + i);
      });
    });

    return { passes: passes, fails: fails };
  }

  global.runAnimationMathTests = run;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && require.main === module) {
  require('../animation-math.js');
  var res = globalThis.runAnimationMathTests();
  res.fails.forEach(function (f) { console.error('FAIL', f); });
  console.log(res.passes + ' passed, ' + res.fails.length + ' failed');
  if (res.fails.length) process.exit(1);
}
