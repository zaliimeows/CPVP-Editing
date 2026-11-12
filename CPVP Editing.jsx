// CPVP Editing  v3.0  -  one-click edit presets for crystal pvp edits in After Effects
// made by zalii
//
// Copyright (c) 2026 zalii. All rights reserved. See LICENSE.
// You may use this panel for your own edits. Do not re-upload, sell or share
// modified copies without permission from zalii.
//
// INSTALL: put this file in  Scripts/ScriptUI Panels/  and restart After Effects,
//          then open it from the Window menu.
//
// USE
//   Park the playhead on the hit / beat / cut, pick a category, pick a preset, Apply
//   (or double-click the preset).
//   "New adjustment layer" builds the preset on a short adjustment layer.
//   "Selected layers" puts it straight on the selected layers.
//   Length = how long the animation runs, in frames ("auto" picks a sensible length).
//
//   EVERYTHING THAT MOVES IS KEYFRAMES. Select the layer, press U, open the Graph
//   Editor and reshape any curve. No hidden expressions.
//
//   Shakes / FX start at the playhead and settle. Transitions peak on the playhead,
//   so park it exactly on the cut. Build-ups end on the playhead, so park it on the drop.
//
// PLUGINS
//   Plugin-first: Sapphire, Deep Glow, Twitch, Continuum. The panel checks what is
//   installed when it starts and falls back to built-in effects where it can.
//   Presets that cannot work without a plugin are marked in the list.

(function (thisObj) {

    // ---- CPVP Editing by zalii ---- identity
    var NAME = "CPVP Editing";
    var VER = "3.0";
    var AUTHOR = "zalii";
    var CREDIT = NAME + " by " + AUTHOR;

    var TEST = ($.global.CPVP_TEST === true);
    var NOPLUG = ($.global.CPVP_NOPLUG === true);

    var log = [];
    var ui = {};
    var opt = { sel: false, len: "auto" };

    // ================================================================ core helpers

    function lc(s) { return String(s).toLowerCase(); }

    function warn(msg) {
        if (TEST) log.push("ALERT: " + msg); else alert(msg, NAME);
    }

    function deepFind(group, names, depth) {
        if (depth > 4) return null;
        var n = 0;
        try { n = group.numProperties; } catch (e) { return null; }
        for (var i = 1; i <= n; i++) {
            var p = null;
            try { p = group.property(i); } catch (e2) { p = null; }
            if (!p) continue;
            for (var j = 0; j < names.length; j++) {
                if (lc(p.name) === lc(names[j]) || lc(p.matchName) === lc(names[j])) return p;
            }
            var isGroup = false;
            try { isGroup = (p.propertyType !== PropertyType.PROPERTY); } catch (e3) {}
            if (isGroup) {
                var r = deepFind(p, names, depth + 1);
                if (r) return r;
            }
        }
        return null;
    }

    function findProp(group, names) {
        if (!(names instanceof Array)) names = [names];
        for (var i = 0; i < names.length; i++) {
            var p = null;
            try { p = group.property(names[i]); } catch (e) { p = null; }
            if (p) return p;
        }
        return deepFind(group, names, 0);
    }

    function getP(fx, names) {
        if (!fx) return null;
        if (!(names instanceof Array)) names = [names];
        var p = findProp(fx, names);
        if (!p) log.push("MISSING PARAM: " + fx.name + " > " + names[names.length - 1]);
        return p;
    }

    function setP(fx, names, val) {
        var p = getP(fx, names);
        if (!p) return false;
        try { p.setValue(val); } catch (e) {
            log.push("VALUE FAILED: " + fx.name + " > " + (names instanceof Array ? names[names.length - 1] : names));
        }
        return true;
    }

    // ---- CPVP Editing by zalii ---- plugin detection

    var HAS = {};
    (function () {
        try {
            var e = app.effects;
            for (var i = 0; i < e.length; i++) HAS[e[i].matchName] = true;
        } catch (x) {}
    })();

    function builtin(mn) {
        return mn.indexOf("ADBE") === 0 || mn.indexOf("CC ") === 0 || mn.indexOf("CS ") === 0;
    }

    function has(mn) {
        if (NOPLUG && !builtin(mn)) return false;
        return HAS[mn] === true;
    }

    function fam(mn) {
        if (mn.indexOf("S_") === 0) return "Sapphire";
        if (mn.indexOf("BCC") === 0) return "Continuum";
        if (mn === "PEDG") return "Deep Glow";
        if (mn.indexOf("Videocopilot") === 0) return "Twitch";
        if (mn.indexOf("OLM") === 0) return "OLM";
        if (mn.indexOf("MB ") === 0) return "Magic Bullet Looks";
        return mn;
    }

    function addFx(layer, cands, quiet) {
        var g = layer.property("ADBE Effect Parade");
        for (var i = 0; i < cands.length; i++) {
            if (!has(cands[i])) continue;
            try {
                if (g.canAddProperty(cands[i])) return g.addProperty(cands[i]);
            } catch (e) {}
        }
        if (!quiet) log.push("skipped, " + fam(cands[0]) + " is not installed (" + cands[0] + ")");
        return null;
    }

    function fxIs(fx, start) {
        try { return lc(fx.matchName).indexOf(lc(start)) === 0; } catch (e) { return false; }
    }

    // ---------------------------------------------------------------- keyframes
    // pts = [[u, value, seg], ...]   u = 0..1 across the animation length
    // seg shapes the curve from this key to the next. Each shape is
    // [out speed x average, out influence %, in speed x average, in influence %]:
    //   "hit"    instant start, very long soft tail      (impacts)
    //   "snap"   fast start, shorter landing
    //   "out"    fast start, long soft landing
    //   "coast"  quick start, easy landing               (coming out of a cut)
    //   "in"     slow start, fast finish                 (going into a cut)
    //   "rush"   long slow start, whips at the very end  (zoom / whip into a cut)
    //   "spin"   long flat handles both ends, speed packed in the middle
    //   "smooth" ease both ends      "soft" light ease both ends
    //   "hold"   stepped             default linear

    var SHP = {
        hit: [8, 3, 0, 92],
        snap: [5, 5, 0, 70],
        out: [3, 10, 0, 85],
        coast: [2.2, 20, 0, 75],
        "in": [0, 85, 3, 10],
        rush: [0, 95, 6, 4],
        spin: [0, 88, 0, 88],
        smooth: [0, 60, 0, 60],
        soft: [0, 33, 0, 33]
    };

    function dimsOf(prop) {
        var vt = prop.propertyValueType;
        if (vt === PropertyValueType.TwoD) return 2;
        if (vt === PropertyValueType.ThreeD) return 3;
        return 1;
    }

    function isSpatial(prop) {
        var vt = prop.propertyValueType;
        return vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL;
    }

    // average speed of one segment, per dimension
    function segSpeed(a, b, dt, dims, spatial) {
        var out = [], d;
        if (dt <= 0) { for (d = 0; d < dims; d++) out.push(0); return out; }
        if (spatial) {
            var sum = 0;
            for (d = 0; d < a.length; d++) sum += (b[d] - a[d]) * (b[d] - a[d]);
            return [Math.sqrt(sum) / dt];
        }
        for (d = 0; d < dims; d++) {
            var x = (a instanceof Array) ? a[d] : a, y = (b instanceof Array) ? b[d] : b;
            out.push((y - x) / dt);
        }
        return out;
    }

    function animate(prop, c, pts) {
        var times = [], i, d;
        for (i = 0; i < pts.length; i++) {
            var t = c.t0 + pts[i][0] * c.D;
            prop.setValueAtTime(t, pts[i][1]);
            times.push(t);
        }
        try {
            var dims = dimsOf(prop), spatial = isSpatial(prop);
            var last = pts.length - 1;
            for (i = 0; i <= last; i++) {
                var k = prop.nearestKeyIndex(times[i]);
                var segIn = (i > 0) ? (pts[i - 1][2] || "linear") : "linear";
                var segOut = (i < last) ? (pts[i][2] || "linear") : "linear";
                var sIn = (i > 0) ? segSpeed(pts[i - 1][1], pts[i][1], times[i] - times[i - 1], dims, spatial) : null;
                var sOut = (i < last) ? segSpeed(pts[i][1], pts[i + 1][1], times[i + 1] - times[i], dims, spatial) : null;
                var shIn = SHP[segIn], shOut = SHP[segOut];
                var a = [], b = [];
                for (d = 0; d < dims; d++) {
                    a.push(shIn ? new KeyframeEase(sIn[d] * shIn[2], shIn[3]) : new KeyframeEase(sIn ? sIn[d] : 0, 16.667));
                    b.push(shOut ? new KeyframeEase(sOut[d] * shOut[0], shOut[1]) : new KeyframeEase(sOut ? sOut[d] : 0, 16.667));
                }
                prop.setTemporalEaseAtKey(k, a, b);
                var tIn = shIn ? KeyframeInterpolationType.BEZIER : KeyframeInterpolationType.LINEAR;
                var tOut = shOut ? KeyframeInterpolationType.BEZIER : KeyframeInterpolationType.LINEAR;
                if (segOut === "hold") tOut = KeyframeInterpolationType.HOLD;
                if (!shIn || !shOut || segOut === "hold") prop.setInterpolationTypeAtKey(k, tIn, tOut);
            }
        } catch (e) {
            log.push("EASING FAILED: " + prop.name + " (" + e.toString() + ")");
        }
    }

    function animP(fx, names, c, pts) {
        var p = getP(fx, names);
        if (!p) return false;
        try { animate(p, c, pts); } catch (e) {
            log.push("KEYS FAILED: " + fx.name + " > " + (names instanceof Array ? names[names.length - 1] : names) + " (" + e.toString() + ")");
        }
        return true;
    }

    function tr(l, name) { return l.property("ADBE Transform Group").property(name); }

    // ---------------------------------------------------------------- envelopes
    // made by zalii: impacts land on frame one and settle, cuts peak in the middle

    var HIT = function (v) { return [[0, v, "hit"], [1, 0]]; };
    var SNAP = function (v) { return [[0, v, "snap"], [1, 0]]; };
    var SOFT = function (v) { return [[0, v, "out"], [1, 0]]; };
    var BUMP = function (v) { return [[0, 0, "in"], [0.5, v, "out"], [1, 0]]; };
    var CUT = function (v) { return [[0, 0, "rush"], [0.5, v, "hit"], [1, 0]]; };
    var RISE = function (v) { return [[0, 0, "in"], [1, v]]; };
    var SWELL = function (v) { return [[0, 0, "rush"], [1, v]]; };
    var SUSTAIN = function (v) { return [[0, 0, "snap"], [0.12, v, "soft"], [0.7, v, "out"], [1, 0]]; };
    var DOUBLE = function (v) { return [[0, v, "hit"], [0.46, 0], [0.5, v * 0.8, "hit"], [1, 0]]; };
    var TRIPLE = function (v) { return [[0, v, "snap"], [0.3, 0], [0.33, v * 0.85, "snap"], [0.63, 0], [0.66, v * 0.7, "hit"], [1, 0]]; };

    // same shape as an envelope, but resting on "rest" instead of 0 (for scale / z dist)
    function rest(pts, peak, base) {
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            var f = (peak === 0) ? 0 : pts[i][1] / peak;
            out.push([pts[i][0], base + (peak - base) * f, pts[i][2]]);
        }
        return out;
    }

    // rough value of an envelope at u, only used to bake fallback shakes
    function envAt(pts, u) {
        for (var i = 0; i < pts.length - 1; i++) {
            var a = pts[i], b = pts[i + 1];
            if (u >= a[0] && u <= b[0]) {
                var t = (b[0] === a[0]) ? 0 : (u - a[0]) / (b[0] - a[0]);
                var s = a[2];
                if (s === "hit" || s === "snap" || s === "out" || s === "coast") t = 1 - Math.pow(1 - t, 3);
                else if (s === "in" || s === "rush") t = Math.pow(t, 3);
                else if (s === "hold") t = 0;
                return a[1] + (b[1] - a[1]) * t;
            }
        }
        return pts[pts.length - 1][1];
    }

    // ---------------------------------------------------------------- building blocks
    // CPVP Editing by zalii. Lengths are given for a 1920 wide comp and scaled by c.sc.

    function deepGlow(l, radius, exposure, c, pts) {
        var fx = addFx(l, ["PEDG", "S_Glow", "ADBE Glo2"]);
        if (!fx) return null;
        var expNames = ["Exposure"];
        if (fxIs(fx, "ADBE Glo2")) {
            setP(fx, ["ADBE Glo2-0002"], 128);
            setP(fx, ["ADBE Glo2-0003"], radius / 4);
            expNames = ["ADBE Glo2-0004"];
        } else if (fxIs(fx, "s_glow")) {
            setP(fx, ["Glow Width"], radius / 3);
            expNames = ["Brightness"];
        } else {
            setP(fx, ["Radius"], radius);
        }
        if (pts) animP(fx, expNames, c, pts); else setP(fx, expNames, exposure);
        return fx;
    }

    // Transform effect. o = {s: scale % keys, r: rotation keys, p: [dx, dy] offset keys, mb: shutter angle}
    function geo(l, c, o) {
        var fx = addFx(l, ["ADBE Geometry2"]);
        if (!fx) return null;
        if (o.mb) {
            setP(fx, ["ADBE Geometry2-0009"], 0);
            setP(fx, ["ADBE Geometry2-0010"], o.mb);
        }
        if (o.s) animP(fx, ["ADBE Geometry2-0003"], c, o.s);
        if (o.r) animP(fx, ["ADBE Geometry2-0007"], c, o.r);
        if (o.p) {
            var p = getP(fx, ["ADBE Geometry2-0002"]);
            if (p) {
                var base = p.value, pts = [];
                for (var i = 0; i < o.p.length; i++) {
                    pts.push([o.p[i][0], [base[0] + o.p[i][1][0], base[1] + o.p[i][1][1]], o.p[i][2]]);
                }
                try { animate(p, c, pts); } catch (e) { log.push("KEYS FAILED: Transform > Position"); }
            }
        }
        return fx;
    }

    function mirror(l) {
        var fx = addFx(l, ["ADBE Tile"], true);
        if (!fx) return;
        setP(fx, ["ADBE Tile-0004"], 300);
        setP(fx, ["ADBE Tile-0005"], 300);
        setP(fx, ["ADBE Tile-0006"], 1);
    }

    function rnd(seed) {
        var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return (x - Math.floor(x)) * 2 - 1;
    }

    // no Sapphire: bake the shake as position / rotation keys on a Transform effect
    function bakeShake(l, c, o, pts) {
        mirror(l);
        var fx = addFx(l, ["ADBE Geometry2"]);
        if (!fx) return null;
        setP(fx, ["ADBE Geometry2-0009"], 0);
        setP(fx, ["ADBE Geometry2-0010"], 180);
        var pos = getP(fx, ["ADBE Geometry2-0002"]), rot = getP(fx, ["ADBE Geometry2-0007"]);
        if (!pos || !rot) return fx;
        var base = pos.value, n = Math.max(2, Math.round(c.D / c.fd)), step = 1;
        if (n > 90) step = Math.ceil(n / 90);
        for (var i = 0; i <= n; i += step) {
            var u = i / n, a = pts ? envAt(pts, u) : (o.amp || 1);
            if (i + step > n) a = pts ? pts[pts.length - 1][1] : a;
            var t = c.t0 + u * c.D;
            pos.setValueAtTime(t, [base[0] + rnd(i * 1.7 + 1) * o.x * a * c.sc, base[1] + rnd(i * 2.3 + 9) * o.y * a * c.sc]);
            rot.setValueAtTime(t, rnd(i * 3.1 + 5) * (o.tilt || 0) * a);
        }
        return fx;
    }

    // S_Shake. o = {amp, freq, x, y, z, tilt, rgb, style, mb}   x / y in pixels at 1920 wide
    function sShake(l, c, o, pts) {
        var fx = addFx(l, ["S_Shake"], true);
        if (!fx) return bakeShake(l, c, o, pts);
        if (o.style) setP(fx, ["Style"], o.style);
        setP(fx, ["Frequency"], o.freq);
        setP(fx, ["X Rand Amp"], o.x * c.sc);
        setP(fx, ["Y Rand Amp"], o.y * c.sc);
        setP(fx, ["Z Rand Amp"], o.z || 0);
        setP(fx, ["Tilt Rand Amp"], o.tilt || 0);
        if (o.xw) setP(fx, ["X Wave Amp"], o.xw * c.sc);
        if (o.yw) setP(fx, ["Y Wave Amp"], o.yw * c.sc);
        if (o.tw) setP(fx, ["Tilt Wave Amp"], o.tw);
        if (o.rgb) setP(fx, ["RGB Randomness"], o.rgb);
        setP(fx, ["Motion Blur"], 1);
        setP(fx, ["Mo Blur Length"], o.mb || 0.8);
        setP(fx, ["Wrap X"], 3);
        setP(fx, ["Wrap Y"], 3);
        if (pts) animP(fx, ["Amplitude"], c, pts); else setP(fx, ["Amplitude"], o.amp);
        return fx;
    }

    // S_BlurMoCurves: transforms AND motion-blurs from its own animated curves.
    // z / rot = keyframe lists, sx / sy = shift keyframe lists in pixels at 1920 wide.
    // Wrap is always Reflect so the frame never shows empty edges.
    function moCurves(l, c, z, rot, sx, sy, shutter) {
        var fx = addFx(l, ["S_BlurMoCurves"], true), i, pts;
        if (!fx) {
            mirror(l);
            var o = { mb: 300 };
            if (z) { o.s = []; for (i = 0; i < z.length; i++) o.s.push([z[i][0], 100 / z[i][1], z[i][2]]); }
            if (rot) o.r = rot;
            if (sx || sy) {
                var m = sx || sy;
                o.p = [];
                for (i = 0; i < m.length; i++) o.p.push([m[i][0], [sx ? sx[i][1] * c.sc : 0, sy ? sy[i][1] * c.sc : 0], m[i][2]]);
            }
            return geo(l, c, o);
        }
        setP(fx, ["Wrap X"], 3);
        setP(fx, ["Wrap Y"], 3);
        if (shutter) setP(fx, ["Shutter Duration"], shutter);
        if (z) animP(fx, ["Z Dist"], c, z);
        if (rot) animP(fx, ["Rotate"], c, rot);
        if (sx) {
            pts = [];
            for (i = 0; i < sx.length; i++) pts.push([sx[i][0], sx[i][1] * c.sc, sx[i][2]]);
            animP(fx, ["Shift X"], c, pts);
        }
        if (sy) {
            pts = [];
            for (i = 0; i < sy.length; i++) pts.push([sy[i][0], sy[i][1] * c.sc, sy[i][2]]);
            animP(fx, ["Shift Y"], c, pts);
        }
        return fx;
    }

    function chroma(l, c, amount, pts) {
        var fx = addFx(l, ["S_WarpChroma", "BCC_CHROMATICABERRATION"]);
        if (!fx) return null;
        if (fxIs(fx, "BCC")) {
            if (pts) {
                var p2 = [];
                for (var i = 0; i < pts.length; i++) p2.push([pts[i][0], pts[i][1] * 100, pts[i][2]]);
                animP(fx, ["Intensity"], c, p2);
            } else setP(fx, ["Intensity"], amount * 100);
            return fx;
        }
        if (pts) animP(fx, ["Warp Amount"], c, pts); else setP(fx, ["Warp Amount"], amount);
        return fx;
    }

    function zoomBlur(l, c, strength, pts) {
        var fx = addFx(l, ["S_BlurMotion", "CC Radial Fast Blur"]);
        if (!fx) return null;
        var e = pts || HIT(strength);
        if (fxIs(fx, "cc ")) {
            var p2 = [];
            for (var i = 0; i < e.length; i++) p2.push([e[i][0], e[i][1] * 100, e[i][2]]);
            animP(fx, ["CC Radial Fast Blur-0002"], c, p2);
        } else {
            setP(fx, ["From Z Dist"], 1);
            setP(fx, ["Wrap X"], 3);
            setP(fx, ["Wrap Y"], 3);
            animP(fx, ["To Z Dist"], c, rest(e, Math.max(0.05, 1 - strength), 1));
        }
        return fx;
    }

    function blurFx(l, c, pts) {
        var fx = addFx(l, ["S_Blur", "ADBE Gaussian Blur 2"]), p2 = [], i;
        if (!fx) return null;
        for (i = 0; i < pts.length; i++) p2.push([pts[i][0], pts[i][1] * c.sc, pts[i][2]]);
        if (fxIs(fx, "ADBE Gaussian")) {
            setP(fx, ["ADBE Gaussian Blur 2-0003"], 1);
            animP(fx, ["ADBE Gaussian Blur 2-0001"], c, p2);
        } else animP(fx, ["Blur Amount"], c, p2);
        return fx;
    }

    function expo(l, c, pts) {
        var fx = addFx(l, ["ADBE Exposure2"]);
        animP(fx, ["ADBE Exposure2-0003"], c, pts);
        return fx;
    }

    // Twitch, driven by its real parameters. o = {sp, blur, light, slide, scale, color,
    // la: light amount, ba: blur amount, sa: slide amount, sca: scale amount, rgb, dir, spread}
    function twitch(l, c, o, pts) {
        var fx = addFx(l, ["Videocopilot Twitch"]);
        if (!fx) return null;
        setP(fx, ["speed"], o.sp || 60);
        setP(fx, ["Blur"], o.blur ? 1 : 0);
        setP(fx, ["Color"], o.color ? 1 : 0);
        setP(fx, ["Light"], o.light ? 1 : 0);
        setP(fx, ["Scale"], o.scale ? 1 : 0);
        setP(fx, ["Slide"], o.slide ? 1 : 0);
        setP(fx, ["Time"], 0);
        if (o.ba) setP(fx, ["Blur Amount"], o.ba);
        if (o.la) setP(fx, ["Light Amount"], o.la);
        if (o.sa) setP(fx, ["Slide Amount"], o.sa);
        if (o.sca) setP(fx, ["Scale Amount"], o.sca);
        if (o.rgb) setP(fx, ["Slide RGB Split"], o.rgb);
        if (o.dir !== undefined) setP(fx, ["Slide Direction"], o.dir);
        if (o.spread !== undefined) setP(fx, ["Slide Spread"], o.spread);
        animP(fx, ["Amount"], c, pts);
        return fx;
    }

    function vignette(l) {
        var fx = addFx(l, ["S_Vignette", "CC Vignette"]);
        return fx;
    }

    // ================================================================ run / layers

    function getComp() {
        var c = app.project.activeItem;
        if (!(c instanceof CompItem)) { warn("Open a comp first."); return null; }
        return c;
    }

    function lengthSeconds(comp, autoSec) {
        var n = parseInt(opt.len, 10);
        if (isNaN(n) || n < 1) return autoSec;
        return n * comp.frameDuration;
    }

    function topOf(sel) {
        var best = null;
        for (var i = 0; i < sel.length; i++) {
            if (best === null || sel[i].index < best.index) best = sel[i];
        }
        return best;
    }

    // every layer the panel makes carries the credit in its Comment field
    function mark(l) {
        try { l.comment = CREDIT; } catch (e) {}
        return l;
    }

    function makeSolid(comp, sel, name, color, start, dur, w, h) {
        var d = Math.max(dur, comp.frameDuration);
        var l = comp.layers.addSolid(color, name, w || comp.width, h || comp.height, comp.pixelAspect, d);
        l.startTime = Math.max(0, start);
        var top = topOf(sel);
        if (top) { try { l.moveBefore(top); } catch (e) {} }
        return mark(l);
    }

    function makeAdj(comp, sel, name, start, dur, w, h) {
        var l = makeSolid(comp, sel, name, [1, 1, 1], start, dur, w, h);
        l.adjustmentLayer = true;
        try { l.label = 5; } catch (e) {}
        return l;
    }

    // hand keyboard focus back to the viewer so Space plays instead of re-clicking
    function releaseFocus() {
        try { if (app.activeViewer) app.activeViewer.setActive(); } catch (e) {}
    }

    function report(name) {
        var msg = name + "  applied";
        if (log.length) msg = name + ":  " + log[0] + (log.length > 1 ? "  (+" + (log.length - 1) + " more, see Tools)" : "");
        ui.last = name + "\n" + (log.length ? log.join("\n") : "no notes");
        try { ui.status.text = msg; ui.status.helpTip = ui.last; } catch (e) {}
    }

    // kind: "hit"   starts at playhead          fn(layer, c, comp)
    //       "trans" centred on playhead         fn(layer, c, comp)
    //       "pre"   ends on the playhead        fn(layer, c, comp)
    //       "look"  whole comp, no animation    fn(layer, c, comp)
    //       "self"  preset makes its own layers fn(comp, sel, c)
    //       "tool"  no comp needed              fn()
    var AUTO = { hit: 0.5, trans: 0.6, pre: 1.5, look: 0, self: 0.5 };

    function avail(def) {
        if (!def.req) return true;
        for (var i = 0; i < def.req.length; i++) if (has(def.req[i])) return true;
        return false;
    }

    function run(def) {
        log = [];
        if (def.k === "tool") {
            try { def.f(); } catch (e0) { log.push("ERROR: " + e0.toString()); }
            releaseFocus();
            return log;
        }
        var comp = getComp();
        if (!comp) { releaseFocus(); return log; }
        if (!avail(def)) {
            log.push("needs " + fam(def.req[0]) + ", which is not installed");
            report(def.n);
            releaseFocus();
            return log;
        }
        var sel = [], s = comp.selectedLayers, i;
        for (i = 0; i < s.length; i++) sel.push(s[i]);

        app.beginUndoGroup(NAME + ": " + def.n);
        try {
            var D = Math.max(lengthSeconds(comp, def.len || AUTO[def.k]), 4 * comp.frameDuration);
            var start = comp.time;
            if (def.k === "trans") start = Math.max(0, comp.time - D / 2);
            if (def.k === "pre") start = Math.max(0, comp.time - D);
            var c = { t0: start, D: D, fd: comp.frameDuration, sc: comp.width / 1920, comp: comp };
            if (def.k === "self") {
                def.f(comp, sel, c);
            } else if (opt.sel) {
                if (sel.length === 0) warn("Select a layer, or set Apply to = New adjustment layer.");
                for (i = 0; i < sel.length; i++) def.f(sel[i], c, comp);
            } else if (def.k === "look") {
                def.f(makeAdj(comp, sel, def.n, 0, comp.duration), c, comp);
            } else {
                def.f(makeAdj(comp, sel, def.n, start, D), c, comp);
            }
        } catch (err) {
            log.push("ERROR: " + err.toString() + (err.line ? " (line " + err.line + ")" : ""));
        }
        app.endUndoGroup();
        report(def.n);
        releaseFocus();
        return log;
    }

    // ================================================================ SHAKES
    // CPVP Editing by zalii. One builder stacks shake + zoom + blur + chroma + glow.
    // o.sh  = S_Shake settings     o.env = envelope function (HIT, SNAP, DOUBLE ...)
    // o.geo = Transform scale punch start %      o.mo = S_BlurMoCurves z punch start
    // o.zb  = zoom blur strength   o.tw = Twitch settings ({a: amount, ...})
    // o.ch  = chroma amount        o.gl = [radius, exposure]     o.ex = exposure flash
    // o.wv  = warp: {fx: "waves" | "bubble" | "puff", a: amount}

    function warpFx(l, c, w, env) {
        var fx;
        if (w.fx === "bubble") {
            fx = addFx(l, ["S_WarpBubble", "ADBE Turbulent Displace"]);
            if (fx && fxIs(fx, "ADBE Turb")) { setP(fx, ["ADBE Turbulent Displace-0003"], 120); animP(fx, ["ADBE Turbulent Displace-0002"], c, env(w.a * 400)); }
            else if (fx) { setP(fx, ["Frequency"], w.f || 6); animP(fx, ["Amplitude"], c, env(w.a)); }
        } else if (w.fx === "puff") {
            fx = addFx(l, ["S_WarpPuff", "ADBE Bulge"]);
            if (fx && fxIs(fx, "ADBE Bulge")) { setP(fx, ["ADBE Bulge-0001"], 600 * c.sc); setP(fx, ["ADBE Bulge-0002"], 600 * c.sc); animP(fx, ["ADBE Bulge-0004"], c, env(w.a * 2)); }
            else if (fx) animP(fx, ["Amount"], c, env(w.a));
        } else {
            fx = addFx(l, ["S_WarpWaves", "ADBE Turbulent Displace"]);
            if (fx && fxIs(fx, "ADBE Turb")) { setP(fx, ["ADBE Turbulent Displace-0003"], 200); animP(fx, ["ADBE Turbulent Displace-0002"], c, env(w.a * 500)); }
            else if (fx) { setP(fx, ["Frequency"], w.f || 3); setP(fx, ["Angle"], w.ang || 0); animP(fx, ["Amplitude"], c, env(w.a)); }
        }
    }

    function stack(o) {
        return function (l, c) {
            var env = o.env || HIT;
            if (o.geo) geo(l, c, { s: rest(env(1), o.geo, 100), mb: 180 });
            if (o.mo) moCurves(l, c, rest(env(1), o.mo, 1), null, null, null);
            if (o.sh) sShake(l, c, o.sh, env(o.sh.amp));
            if (o.wv) warpFx(l, c, o.wv, env);
            if (o.zb) zoomBlur(l, c, o.zb, env(o.zb));
            if (o.tw) twitch(l, c, o.tw, (o.twenv || SNAP)(o.tw.a));
            if (o.ch) chroma(l, c, 0, env(o.ch));
            if (o.gl) deepGlow(l, o.gl[0], 0, c, (o.glenv || SOFT)(o.gl[1]));
            if (o.ex) expo(l, c, HIT(o.ex));
        };
    }

    function tiltSwing(l, c) {
        moCurves(l, c,
            [[0, 0.86, "hit"], [1, 1]],
            [[0, 10, "snap"], [0.28, -5.5, "smooth"], [0.58, 2.5, "smooth"], [1, 0]],
            null, null);
    }

    var TW_HIT = { a: 100, sp: 80, blur: 1, light: 1, slide: 1, la: 300, sa: 60 };
    var TW_SLIDE = { a: 120, sp: 90, slide: 1, sa: 90, rgb: 40, spread: 0.3 };
    var TW_LIGHT = { a: 90, sp: 70, light: 1, la: 220 };
    var TW_SCALE = { a: 110, sp: 80, scale: 1, blur: 1, sca: 70, ba: 80 };

    // ================================================================ BUILD-UP
    // CPVP Editing by zalii. These end on the playhead: park it on the drop.

    function buRise(l, c) {
        sShake(l, c, { freq: 12, x: 30, y: 40, tilt: 2, z: 0.1 }, SWELL(3.5));
    }
    function buPush(l, c) {
        geo(l, c, { s: [[0, 100, "in"], [1, 122]], mb: 120 });
    }
    function buGlow(l, c) {
        deepGlow(l, 350, 0, c, RISE(1.6));
    }
    function buChroma(l, c) {
        chroma(l, c, 0, SWELL(0.9));
    }
    function buBlur(l, c) {
        zoomBlur(l, c, 0.35, SWELL(0.35));
    }
    function buFlicker(l, c) {
        var fx = addFx(l, ["S_Flicker"], true);
        if (fx) { setP(fx, ["Rand Freq"], 24); animP(fx, ["Amplitude"], c, RISE(1.2)); return; }
        var pts = [], n = 12;
        for (var i = 0; i < n; i++) pts.push([i / n, (i % 2 === 0) ? 0 : 1.6 * (i / n), "hold"]);
        pts.push([1, 0]);
        expo(l, c, pts);
    }
    function buTension(l, c) {
        geo(l, c, { s: [[0, 100, "rush"], [1, 114]], mb: 120 });
        var fx = addFx(l, ["S_Vignette", "CC Vignette"]);
        if (fx && fxIs(fx, "S_")) animP(fx, ["Radius"], c, [[0, 1.6, "in"], [1, 0.55]]);
        else if (fx) animP(fx, ["CS Vignette-0001"], c, RISE(160));
    }
    function buFull(l, c) {
        geo(l, c, { s: [[0, 100, "in"], [1, 118]], mb: 120 });
        sShake(l, c, { freq: 14, x: 26, y: 34, tilt: 2 }, SWELL(3));
        chroma(l, c, 0, SWELL(0.7));
        deepGlow(l, 320, 0, c, RISE(1.3));
    }
    // pumps that get closer together until the drop
    function buHeart(l, c) {
        var u = [0, 0.3, 0.52, 0.68, 0.8, 0.89, 0.95], pts = [];
        for (var i = 0; i < u.length; i++) {
            pts.push([u[i], 100 + 6 + i * 2, "out"]);
            pts.push([(i < u.length - 1 ? u[i + 1] : 1) - 0.004, 100]);
        }
        geo(l, c, { s: pts, mb: 120 });
        deepGlow(l, 250, 0, c, RISE(0.9));
    }
    function buTwitch(l, c) {
        twitch(l, c, { a: 100, sp: 60, slide: 1, light: 1, la: 160, sa: 50 }, SWELL(110));
    }

    // ================================================================ TRANSITIONS
    // CPVP Editing by zalii. The cut sits at u = 0.5: speed up into it, coast out of it.

    // slow start, fast through the cut, slow end: long flat handles on the outer keys
    function spin(dir) {
        return function (l, c) {
            moCurves(l, c,
                [[0, 1, "spin"], [0.5, 0.62, "spin"], [1, 1]],
                [[0, 0, "spin"], [1, 360 * dir]],
                null, null, 1.3);
        };
    }

    function pre(c) { return 0.5 - c.fd / c.D; }

    // zoom through the cut: clip A rushes toward the camera, clip B arrives from the
    // same direction and lands. a = z dist reached before the cut, b = z dist after it.
    function zoomThrough(a, b) {
        return function (l, c) {
            moCurves(l, c, [[0, 1, "rush"], [pre(c), a], [0.5, b, "hit"], [1, 1]], null, null, null, 1.2);
            chroma(l, c, 0, CUT(0.45));
        };
    }

    // dx / dy = direction the picture travels, in comp widths / heights
    function whip(dx, dy) {
        return function (l, c, comp) {
            var X = dx * 1920 * 0.95, Y = dy * 1920 * (comp.height / comp.width) * 0.95;
            var sx = dx ? [[0, 0, "rush"], [pre(c), X], [0.5, -X, "hit"], [1, 0]] : null;
            var sy = dy ? [[0, 0, "rush"], [pre(c), Y], [0.5, -Y, "hit"], [1, 0]] : null;
            moCurves(l, c, null, null, sx, sy, 1.4);
        };
    }

    function zoomSpin(l, c) {
        moCurves(l, c,
            [[0, 1, "rush"], [pre(c), 0.4], [0.5, 2.2, "hit"], [1, 1]],
            [[0, 0, "rush"], [pre(c), 50], [0.5, -50, "hit"], [1, 0]],
            null, null, 1.3);
    }

    function warpWave(l, c) {
        warpFx(l, c, { fx: "waves", a: 0.4, f: 2.5 }, CUT);
        moCurves(l, c, [[0, 1, "in"], [0.5, 0.78, "out"], [1, 1]], null, null, null);
    }

    function vortex(l, c) {
        var fx = addFx(l, ["S_WarpVortex", "ADBE Twirl"]);
        if (fx && fxIs(fx, "ADBE Twirl")) {
            setP(fx, ["ADBE Twirl-0002"], 80);
            animP(fx, ["ADBE Twirl-0001"], c, CUT(360));
        } else if (fx) {
            animP(fx, ["Vortex Start"], c, CUT(320));
        }
        chroma(l, c, 0, CUT(0.7));
    }

    function fisheye(l, c) {
        var fx = addFx(l, ["S_WarpFishEye", "ADBE Optics Compensation"]);
        if (fx && fxIs(fx, "ADBE Optics")) {
            setP(fx, ["ADBE Optics Compensation-0002"], 1);
            animP(fx, ["ADBE Optics Compensation-0001"], c, CUT(100));
        } else if (fx) {
            animP(fx, ["Amount"], c, CUT(2.2));
        }
        moCurves(l, c, [[0, 1, "in"], [0.5, 0.72, "out"], [1, 1]], null, null, null);
    }

    // blur ramps up into the cut and back down to zero
    function blurDip(l, c) {
        blurFx(l, c, [[0, 0, "in"], [0.5, 260, "out"], [1, 0]]);
    }

    function prismCut(l, c) {
        chroma(l, c, 0, CUT(1.5));
        blurFx(l, c, [[0, 0, "rush"], [0.5, 90, "hit"], [1, 0]]);
        deepGlow(l, 400, 0, c, CUT(1.8));
        expo(l, c, CUT(1.6));
    }

    function glitchCut(l, c) {
        var fx = addFx(l, ["S_DigitalDamage", "BCC_VIDEOGLITCH"]);
        if (fx && fxIs(fx, "S_")) animP(fx, ["Intensity"], c, CUT(1.4));
        twitch(l, c, TW_SLIDE, CUT(120));
        chroma(l, c, 0, CUT(0.9));
    }

    function flashCut(l, c) {
        expo(l, c, CUT(3.2));
        deepGlow(l, 450, 0, c, CUT(1.5));
    }

    function shakeCut(l, c) {
        sShake(l, c, { freq: 16, x: 70, y: 50, tilt: 4 }, CUT(4));
        zoomBlur(l, c, 0.3, CUT(0.3));
    }

    // ================================================================ FLASH

    function flash(name, color, strength, add, seg) {
        return function (comp, sel, c) {
            var s = makeSolid(comp, sel, name, color, c.t0, c.D);
            if (add) { try { s.blendingMode = BlendingMode.ADD; } catch (e) {} }
            animate(tr(s, "ADBE Opacity"), c, [[0, strength, seg || "hit"], [1, 0]]);
        };
    }

    function invertFlash(comp, sel, c) {
        var l = makeAdj(comp, sel, "Invert Flash", c.t0, 2 * c.fd);
        addFx(l, ["ADBE Invert"]);
    }

    function thresholdFlash(comp, sel, c) {
        var l = makeAdj(comp, sel, "Threshold Flash", c.t0, 3 * c.fd);
        addFx(l, ["S_Threshold", "ADBE Threshold2"]);
    }

    function blackStrobe(comp, sel, c) {
        var n = 6, cc = { t0: c.t0, D: n * c.fd, fd: c.fd };
        var s = makeSolid(comp, sel, "Black Strobe", [0, 0, 0], c.t0, cc.D);
        var pts = [];
        for (var i = 0; i < n; i++) pts.push([i / n, (i % 2 === 0) ? 100 : 0, "hold"]);
        animate(tr(s, "ADBE Opacity"), cc, pts);
    }

    function exposurePulse(l, c) {
        expo(l, c, HIT(2.2));
        deepGlow(l, 300, 0, c, SOFT(1));
    }

    function dipBlack(comp, sel, c) {
        var D = Math.max(c.D, 0.3), t0 = Math.max(0, comp.time - D / 2);
        var s = makeSolid(comp, sel, "Dip to Black", [0, 0, 0], t0, D);
        animate(tr(s, "ADBE Opacity"), { t0: t0, D: D, fd: c.fd }, [[0, 0, "in"], [0.5, 100, "coast"], [1, 0]]);
    }

    function fade(name, a, b, seg) {
        return function (comp, sel, c) {
            var D = Math.max(c.D, 0.5);
            var s = makeSolid(comp, sel, name, [0, 0, 0], c.t0, D);
            animate(tr(s, "ADBE Opacity"), { t0: c.t0, D: D, fd: c.fd }, [[0, a, seg], [1, b]]);
        };
    }

    // ================================================================ LIGHT + GLOW / FX

    function raysBurst(l, c) {
        var fx = addFx(l, ["S_Rays", "CC Light Rays"]);
        if (!fx) return;
        if (fxIs(fx, "cc ")) { animP(fx, ["CC Light Rays-0001"], c, HIT(300)); return; }
        setP(fx, ["Threshold"], 0.35);
        animP(fx, ["Rays Length"], c, [[0, 0.6, "out"], [1, 0.1]]);
        animP(fx, ["Rays Brightness"], c, HIT(8));
    }

    function godRays(l) {
        var fx = addFx(l, ["S_Rays", "CC Light Rays"]);
        if (!fx || fxIs(fx, "cc ")) return;
        setP(fx, ["Threshold"], 0.45);
        setP(fx, ["Rays Length"], 0.45);
        setP(fx, ["Rays Brightness"], 4);
    }

    function edgeRays(l) { addFx(l, ["S_EdgeRays", "S_Rays", "CC Light Rays"]); }

    function glowPulse(l, c) { deepGlow(l, 350, 0, c, HIT(2.5)); }

    function softGlow(l) { deepGlow(l, 220, 0.6, null, null); }

    function chromaHit(l, c) { chroma(l, c, 0, HIT(1.2)); }

    function zoomBlurHit(l, c) { zoomBlur(l, c, 0.5); }

    function glitch(l, c) {
        var fx = addFx(l, ["S_DigitalDamage", "BCC_VIDEOGLITCH"]);
        if (fx && fxIs(fx, "S_")) animP(fx, ["Intensity"], c, SNAP(1.5));
        chroma(l, c, 0, HIT(0.8));
    }

    function crt(l) {
        addFx(l, ["S_TVDamage", "BCC4Damaged TV"]);
        chroma(l, null, 0.15, null);
        vignette(l);
    }

    function trails(l) {
        var fx = addFx(l, ["S_Trails", "ADBE Echo"]);
        if (fx && fxIs(fx, "ADBE Echo")) {
            setP(fx, ["ADBE Echo-0001"], -0.033);
            setP(fx, ["ADBE Echo-0002"], 6);
            setP(fx, ["ADBE Echo-0004"], 0.7);
        }
    }

    function neon(l) {
        var fx = addFx(l, ["S_GlowEdges", "S_EdgeDetect", "ADBE Find Edges"]);
        if (fx && fxIs(fx, "ADBE Find Edges")) setP(fx, ["ADBE Find Edges-0001"], 1);
        chroma(l, null, 0.3, null);
        deepGlow(l, 150, 0.8, null, null);
    }

    function haze(l) {
        addFx(l, ["S_SoftFocus", "S_Diffuse", "ADBE Gaussian Blur 2"]);
        deepGlow(l, 400, 0.6, null, null);
    }

    // S_LensFlare, with the built-in Lens Flare as fallback
    function lensFlare(l) { addFx(l, ["S_LensFlare", "BCC_LENSFLARE", "ADBE Lens Flare"]); }

    function flareBurst(l, c) {
        var fx = addFx(l, ["S_LensFlare", "ADBE Lens Flare"]);
        if (fx && fxIs(fx, "ADBE")) animP(fx, ["ADBE Lens Flare-0002"], c, HIT(160));
        else if (fx) animP(fx, ["Brightness"], c, HIT(2.6));
    }

    function simple(cands) { return function (l) { addFx(l, cands); }; }

    var fxGlint = simple(["S_Glint", "S_GlintRainbow", "S_Sparkles"]);
    var fxStreaks = simple(["S_Streaks", "S_Glare"]);
    var fxGlare = simple(["S_Glare", "S_Glint"]);
    var fxLightLeak = simple(["S_LightLeak", "BCC_LIGHTLEAKS"]);
    var fxLightning = simple(["S_Zap", "S_UltraZap", "ADBE Lightning 2"]);
    var fxPrismBlur = simple(["S_DefocusPrism", "S_BlurChroma", "BCC_PRISMBLUR"]);
    var fxPixelSort = simple(["S_PixelSort"]);
    var fxJpeg = simple(["S_JpegDamage", "S_DigitalDamage"]);
    var fxHalftone = simple(["S_HalfTone", "S_HalfToneColor"]);
    var fxBleach = simple(["S_BleachBypass", "BCC_BLEACHBYPASS"]);
    var fxKira = simple(["OLM OLM Kira Kira", "S_Glint"]);

    function channelChange(l, c) {
        var fx = addFx(l, ["S_TVDamage", "BCC4Damaged TV"]);
        if (fx && fxIs(fx, "S_")) animP(fx, ["Reception Master"], c, SNAP(2.5));
    }

    // hue rotation as real keys. Color Balance (HLS) is the one built-in hue that keys.
    function hueKeys(l, c, pts) {
        var fx = addFx(l, ["ADBE Color Balance (HLS)"]);
        animP(fx, ["ADBE Color Balance (HLS)-0001", "Hue"], c, pts);
        return fx;
    }

    // smooth hue rotation through the whole rainbow
    function rainbowCycle(l, c) {
        hueKeys(l, c, [[0, 0], [1, 360]]);
    }

    // hard colour steps: red > pink > purple > blue > green (the totem / anchor look)
    function rainbowSteps(l, c) {
        var fx = addFx(l, ["ADBE HUE SATURATION"]);
        setP(fx, ["ADBE HUE SATURATION-0007", "Colorize"], 1);
        setP(fx, ["ADBE HUE SATURATION-0009", "Colorize Saturation"], 90);
        var hues = [0, 320, 275, 215, 120], pts = [];
        for (var i = 0; i < hues.length; i++) pts.push([i / hues.length, hues[i], "hold"]);
        animP(fx, ["ADBE HUE SATURATION-0008", "Colorize Hue"], c, pts);
        deepGlow(l, 250, 1, null, null);
    }

    function rainbowGlow(l, c) {
        addFx(l, ["S_GlowRainbow", "S_GlintRainbow"], true);
        rainbowCycle(l, c);
    }

    function floatingCard(comp, sel, c) {
        if (sel.length === 0) { warn("Select the layer to turn into a floating card."); return; }
        for (var i = 0; i < sel.length; i++) {
            var l = sel[i];
            l.threeDLayer = true;
            tr(l, "ADBE Scale").setValue([65, 65, 100]);
            var cc = { t0: c.t0, D: Math.max(c.D, 1.5), fd: c.fd };
            animate(tr(l, "ADBE Rotate Y"), cc, [[0, -28, "smooth"], [1, 28]]);
            animate(tr(l, "ADBE Rotate X"), cc, [[0, 8, "smooth"], [1, -8]]);
        }
    }

    function rectMask(l, x0, y0, x1, y1, feather) {
        var m = l.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        var sh = new Shape();
        sh.vertices = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        sh.closed = true;
        m.property("ADBE Mask Shape").setValue(sh);
        if (feather) m.property("ADBE Mask Feather").setValue([feather, feather]);
        return m;
    }

    function letterbox(comp, sel) {
        var s = makeSolid(comp, sel, "Letterbox", [0, 0, 0], 0, comp.duration);
        var w = comp.width, h = comp.height, bar = h * 0.12;
        rectMask(s, 0, bar, w, h - bar, 0).maskMode = MaskMode.SUBTRACT;
    }

    // small mosaic patch in the middle of the screen: drag it over a nametag / chat / scoreboard
    function blurNames(comp, sel, c) {
        var w = Math.round(comp.width * 0.24), h = Math.round(comp.height * 0.09);
        var l = makeAdj(comp, sel, "Blur Names", c.t0, Math.max(comp.duration - c.t0, c.fd), w, h);
        rectMask(l, 0, 0, w, h, 4);
        var fx = addFx(l, ["ADBE Mosaic"]);
        setP(fx, ["ADBE Mosaic-0001"], 16);
        setP(fx, ["ADBE Mosaic-0002"], 6);
        setP(fx, ["ADBE Mosaic-0003"], 1);
    }

    // ================================================================ CC
    // CPVP Editing by zalii. A script cannot pick a look inside Magic Bullet Looks,
    // so the grades are built from Lumetri / Sapphire / Deep Glow.

    var LUM = {
        "Temperature": "ADBE Lumetri-0007", "Tint": "ADBE Lumetri-0008", "Saturation": "ADBE Lumetri-0020",
        "Exposure": "ADBE Lumetri-0011", "Contrast": "ADBE Lumetri-0012", "Highlights": "ADBE Lumetri-0013",
        "Shadows": "ADBE Lumetri-0014"
    };

    function lumetri(l, o) {
        var fx = addFx(l, ["ADBE Lumetri"]);
        if (!fx) return null;
        for (var k in o) {
            if (o.hasOwnProperty(k)) setP(fx, [LUM[k], k], o[k]);
        }
        return fx;
    }

    function tintFx(l, black, white, amount) {
        var fx = addFx(l, ["ADBE Tint"]);
        setP(fx, ["ADBE Tint-0001"], black);
        setP(fx, ["ADBE Tint-0002"], white);
        setP(fx, ["ADBE Tint-0003"], amount);
    }

    function sharpen(l) { addFx(l, ["S_Sharpen", "ADBE Unsharp Mask2", "ADBE Sharpen"]); }

    function ccPurpleNight(l) {
        lumetri(l, { "Temperature": -15, "Tint": 25, "Contrast": 30, "Shadows": -20, "Saturation": 115 });
        tintFx(l, [0.07, 0, 0.16, 1], [1, 0.86, 1, 1], 35);
        vignette(l);
        deepGlow(l, 180, 0.4, null, null);
    }
    function ccColdSteel(l) {
        lumetri(l, { "Temperature": -40, "Contrast": 35, "Highlights": 15, "Shadows": -25, "Saturation": 55 });
        vignette(l);
        deepGlow(l, 250, 0.5, null, null);
    }
    function ccTealMoody(l) {
        lumetri(l, { "Temperature": -30, "Tint": -15, "Exposure": -0.4, "Contrast": 40, "Shadows": -30, "Saturation": 90 });
        tintFx(l, [0, 0.07, 0.11, 1], [0.85, 1, 1, 1], 25);
        vignette(l);
    }
    function ccPinkBloom(l) {
        lumetri(l, { "Temperature": 15, "Tint": 30, "Exposure": 0.3, "Contrast": 15, "Highlights": 20, "Saturation": 120 });
        haze(l);
    }
    function ccDarkPunch(l) {
        lumetri(l, { "Exposure": -0.2, "Contrast": 55, "Highlights": 20, "Shadows": -35, "Saturation": 125 });
        sharpen(l);
        vignette(l);
        deepGlow(l, 150, 0.35, null, null);
    }
    function ccBlackWhite(l) {
        lumetri(l, { "Contrast": 60, "Highlights": 20, "Shadows": -30, "Saturation": 0 });
        vignette(l);
    }
    function ccVibrant(l) {
        lumetri(l, { "Contrast": 30, "Shadows": -10, "Saturation": 150 });
        sharpen(l);
        deepGlow(l, 120, 0.3, null, null);
    }
    function ccDarkGlow(l) {
        lumetri(l, { "Exposure": -1.6, "Contrast": 45, "Temperature": -25, "Saturation": 110 });
        var g = deepGlow(l, 400, 2, null, null);
        if (g && fxIs(g, "PEDG")) setP(g, ["Threshold"], 75);
        vignette(l);
    }
    function ccGoldHour(l) {
        lumetri(l, { "Temperature": 35, "Tint": 8, "Contrast": 25, "Highlights": 10, "Shadows": -15, "Saturation": 115 });
        tintFx(l, [0.1, 0.04, 0, 1], [1, 0.95, 0.8, 1], 20);
        deepGlow(l, 260, 0.45, null, null);
    }
    function ccCrystal(l) {
        lumetri(l, { "Temperature": -10, "Tint": 35, "Contrast": 40, "Highlights": 25, "Shadows": -25, "Saturation": 130 });
        sharpen(l);
        deepGlow(l, 200, 0.5, null, null);
    }
    function ccMagicBullet(l) { addFx(l, ["MB LookSuite3"]); }
    function ccFilm(l) { addFx(l, ["S_FilmEffect", "S_Grain", "ADBE Noise"]); }

    // ================================================================ TIME REMAP (selected layers)

    function remapOf(l) {
        try {
            if (!l.canSetTimeRemapEnabled) { log.push(l.name + ": cannot be time remapped (use footage or a precomp)"); return null; }
            if (!l.timeRemapEnabled) l.timeRemapEnabled = true;
            try { l.frameBlendingType = FrameBlendingType.PIXEL_MOTION; } catch (e0) {}
            return l.property("ADBE Time Remapping");
        } catch (e) { log.push(l.name + ": time remap failed"); return null; }
    }

    function ke(speed, infl) { return [new KeyframeEase(speed, infl)]; }

    // One ramp on the time remap value graph, from T to T+N, covering M seconds of footage.
    // shape "kill":  instantly fast, then a long slow landing (steep short handle on the
    //                first key, long flat handle on the second) - the cpvp after-kill curve
    // shape "into":  mirror of that - slow, then snaps fast right at the end
    function rampAt(p, T, N, M, shape, sharp, flat, fd) {
        var later = [], k;
        var vT = p.valueAtTime(T, false), top = 100000;
        try { if (p.hasMax) top = p.maxValue; } catch (e0) {}
        for (k = p.numKeys; k >= 1; k--) {
            if (p.keyTime(k) > T + fd / 2) { later.push([p.keyTime(k), p.keyValue(k)]); p.removeKey(k); }
        }
        M = Math.min(M, top - vT);
        p.setValueAtTime(T, vT);
        p.setValueAtTime(T + N, vT + M);
        for (k = 0; k < later.length; k++) {
            if (later[k][0] > T + N + fd / 2) p.setValueAtTime(later[k][0], Math.min(top, Math.max(0, later[k][1] + (M - N))));
        }
        var k1 = p.nearestKeyIndex(T), k2 = p.nearestKeyIndex(T + N);
        var avg = M / N;
        var steep = ke(sharp * avg, 8), soft = ke(0.18 * avg, flat), lin = ke(1, 0.1);
        if (shape === "kill") {
            p.setTemporalEaseAtKey(k1, lin, steep);
            p.setTemporalEaseAtKey(k2, soft, lin);
        } else {
            p.setTemporalEaseAtKey(k1, lin, soft);
            p.setTemporalEaseAtKey(k2, steep, lin);
        }
    }

    // mult = how much footage the ramp eats compared with normal speed (1 = stays in sync)
    // back = true: the ramp ends on the playhead instead of starting there
    function ramp(shape, mult, sharp, flat, repeats, back) {
        return function (comp, sel, c) {
            if (sel.length === 0) { warn("Select the clip to time remap."); return; }
            var all = lengthSeconds(comp, 1.0), N = all / repeats;
            var T0 = back ? Math.max(0, comp.time - all) : comp.time;
            for (var i = 0; i < sel.length; i++) {
                var p = remapOf(sel[i]);
                if (!p) continue;
                for (var r = 0; r < repeats; r++) {
                    try { rampAt(p, T0 + r * N, N, N * mult, shape, sharp, flat, c.fd); }
                    catch (e) { log.push(sel[i].name + ": " + e.toString()); }
                }
            }
        };
    }

    // changes speed for the window, then carries on at normal speed
    function speedChange(factor) {
        return function (comp, sel, c) {
            if (sel.length === 0) { warn("Select the clip to time remap."); return; }
            for (var i = 0; i < sel.length; i++) {
                var l = sel[i], p = remapOf(l);
                if (!p) continue;
                var T = comp.time, N = lengthSeconds(comp, 1.0), later = [], k;
                var vT = p.valueAtTime(T, false);
                for (k = p.numKeys; k >= 1; k--) {
                    if (p.keyTime(k) > T) { later.push([p.keyTime(k), p.keyValue(k)]); p.removeKey(k); }
                }
                var shift = N * (1 - factor);
                p.setValueAtTime(T, vT);
                p.setValueAtTime(T + N, vT + N * factor);
                for (k = 0; k < later.length; k++) {
                    if (later[k][0] > T + N + c.fd) p.setValueAtTime(later[k][0], Math.max(0, later[k][1] - shift));
                }
                try {
                    var k1 = p.nearestKeyIndex(T), k2 = p.nearestKeyIndex(T + N);
                    p.setTemporalEaseAtKey(k1, ke(1, 0.1), ke(factor, 45));
                    p.setTemporalEaseAtKey(k2, ke(factor, 45), ke(1, 0.1));
                } catch (e) {}
            }
        };
    }

    // footage eases from normal speed down to a stop and holds there
    function slowStop(comp, sel, c) {
        if (sel.length === 0) { warn("Select the clip to slow down."); return; }
        for (var i = 0; i < sel.length; i++) {
            var p = remapOf(sel[i]);
            if (!p) continue;
            var T = comp.time, N = lengthSeconds(comp, 1.5), k;
            var vT = p.valueAtTime(T, false);
            for (k = p.numKeys; k >= 1; k--) { if (p.keyTime(k) > T) p.removeKey(k); }
            p.setValueAtTime(T, vT);
            p.setValueAtTime(T + N, vT + N * 0.42);
            try {
                var k1 = p.nearestKeyIndex(T), k2 = p.nearestKeyIndex(T + N);
                p.setTemporalEaseAtKey(k1, ke(1, 0.1), ke(1, 25));
                p.setTemporalEaseAtKey(k2, ke(0, 90), ke(0, 0.1));
            } catch (e) { log.push(sel[i].name + ": " + e.toString()); }
        }
    }

    // ================================================================ BEAT MARKERS

    function markersOf(l) { return l.property("ADBE Marker"); }

    // sens: higher = fewer markers (only the hardest hits)
    function beatMarkers(sens) {
        return function (comp, sel, c) {
            if (sel.length === 0) { warn("Select the song layer first."); return; }
            var song = sel[0];
            var id = 0;
            try { id = app.findMenuCommandId("Convert Audio to Keyframes"); } catch (e) {}
            if (!id) { log.push("Convert Audio to Keyframes not found (AE must be in English)"); return; }
            var before = comp.numLayers;
            try { comp.openInViewer(); } catch (e1) {}
            app.executeCommand(id);
            if (comp.numLayers === before) { log.push("no audio found to analyse"); return; }
            var amp = comp.layer(1);
            var slider = null;
            try { slider = amp.property("ADBE Effect Parade").property("Both Channels").property("ADBE Slider Control-0001"); } catch (e2) {}
            if (!slider) {
                try { slider = amp.property("ADBE Effect Parade").property(3).property(1); } catch (e3) {}
            }
            if (!slider) { log.push("could not read the audio keyframes"); return; }

            var fd = comp.frameDuration;
            var t0 = Math.max(song.inPoint, 0), t1 = Math.min(song.outPoint, comp.duration);
            var n = Math.floor((t1 - t0) / fd), a = [], i;
            for (i = 0; i < n; i++) a.push(slider.valueAtTime(t0 + i * fd, false));
            try { amp.remove(); } catch (e4) {}

            // onset strength = how much louder this frame is than the average of the last few
            var on = [], back = Math.max(2, Math.round(0.08 / fd));
            for (i = 0; i < n; i++) {
                var sum = 0, cnt = 0;
                for (var j = Math.max(0, i - back); j < i; j++) { sum += a[j]; cnt++; }
                on.push(cnt ? Math.max(0, a[i] - sum / cnt) : 0);
            }
            var mean = 0, sd = 0;
            for (i = 0; i < n; i++) mean += on[i];
            mean = n ? mean / n : 0;
            for (i = 0; i < n; i++) sd += (on[i] - mean) * (on[i] - mean);
            sd = n ? Math.sqrt(sd / n) : 0;
            var thr = mean + sens * sd;
            var gap = Math.max(1, Math.round(0.18 / fd)), lastI = -9999, count = 0;
            var mk = markersOf(song);
            for (i = 1; i < n - 1; i++) {
                if (on[i] > thr && on[i] >= on[i - 1] && on[i] >= on[i + 1] && i - lastI >= gap) {
                    mk.setValueAtTime(t0 + i * fd, new MarkerValue(""));
                    lastI = i;
                    count++;
                }
            }
            log.push(count + " markers added to " + song.name);
        };
    }

    function clearMarkers(comp, sel) {
        if (sel.length === 0) { warn("Select the layer to clear."); return; }
        for (var i = 0; i < sel.length; i++) {
            var mk = markersOf(sel[i]);
            for (var k = mk.numKeys; k >= 1; k--) mk.removeKey(k);
        }
    }

    // ================================================================ TEXT
    // CPVP Editing by zalii. New text always starts from a clean style: centred,
    // white, no stroke, tracking 0, so nothing carries over from the last text you made.

    var FONT_WANT = "TropiLandRegular";
    var FONT_BACK = "Arial-BoldMT";
    var fontName = null;

    function pickFont() {
        if (fontName) return fontName;
        fontName = FONT_BACK;
        try {
            var f = app.fonts.getFontsByPostScriptName(FONT_WANT);
            if (f && f.length > 0) fontName = FONT_WANT;
        } catch (e) {}
        return fontName;
    }

    function newText(comp, str, size, at, dur) {
        var t = comp.layers.addText(str);
        var tp = t.property("ADBE Text Properties").property("ADBE Text Document");
        var d = tp.value;
        d.font = pickFont();
        d.fontSize = size || 120;
        d.applyFill = true;
        d.fillColor = [1, 1, 1];
        d.applyStroke = false;
        d.tracking = 0;
        d.justification = ParagraphJustification.CENTER_JUSTIFY;
        var off = ["fauxBold", "fauxItalic", "allCaps", "smallCaps", "superscript", "subscript"], zero = ["baselineShift", "tsume"], one = ["horizontalScale", "verticalScale"], q;
        for (q = 0; q < off.length; q++) { try { d[off[q]] = false; } catch (e0) {} }
        for (q = 0; q < zero.length; q++) { try { d[zero[q]] = 0; } catch (e1) {} }
        for (q = 0; q < one.length; q++) { try { d[one[q]] = 1; } catch (e3) {} }
        tp.setValue(d);
        try {
            var r = t.sourceRectAtTime(at, false);
            tr(t, "ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
        } catch (e2) {}
        tr(t, "ADBE Position").setValue([comp.width / 2, comp.height / 2]);
        t.inPoint = at;
        t.outPoint = dur ? Math.min(comp.duration, at + dur) : comp.duration;
        return mark(t);
    }

    function textLayers(comp, sel) {
        var out = [];
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] instanceof TextLayer) out.push(sel[i]);
        }
        if (out.length === 0) out.push(newText(comp, "TEXT", 120, comp.time, 0));
        return out;
    }

    function eachText(fn, minLen) {
        return function (comp, sel, c) {
            var ls = textLayers(comp, sel);
            var cc = { t0: c.t0, D: Math.max(c.D, minLen || 0.5), fd: c.fd, sc: c.sc, comp: comp };
            for (var i = 0; i < ls.length; i++) fn(ls[i], cc, comp);
        };
    }

    // text animator: props = [[matchName, value], ...]
    // sweep = shape used to key the range selector start 0 > 100. When the sweep is
    // done nothing is selected any more, so the text always ends sharp and fully visible.
    function animator(l, c, name, props, sweep, smooth) {
        var anims = l.property("ADBE Text Properties").property("ADBE Text Animators");
        var a = anims.addProperty("ADBE Text Animator");
        a.name = name;
        for (var i = 0; i < props.length; i++) {
            a = anims.property(name);
            a.property("ADBE Text Animator Properties").addProperty(props[i][0]).setValue(props[i][1]);
        }
        a = anims.property(name);
        var s = a.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        animate(s.property("ADBE Text Percent Start"), c, [[0, 0, sweep], [1, 100]]);
        try { s.property("ADBE Text Range Advanced").property("ADBE Text Selector Smoothness").setValue(smooth === undefined ? 100 : smooth); } catch (e) {}
    }

    // a window that travels through the letters again and again, keyed on the range
    // selector offset: every letter moves in turn, with real keys and no wiggle selector
    function wave(l, c, name, props, period, phase, width) {
        var anims = l.property("ADBE Text Properties").property("ADBE Text Animators");
        var a = anims.addProperty("ADBE Text Animator");
        a.name = name;
        for (var i = 0; i < props.length; i++) {
            a = anims.property(name);
            a.property("ADBE Text Animator Properties").addProperty(props[i][0]).setValue(props[i][1]);
        }
        a = anims.property(name);
        var s = a.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        s.property("ADBE Text Percent Start").setValue(0);
        s.property("ADBE Text Percent End").setValue(width);
        try { s.property("ADBE Text Range Advanced").property("ADBE Text Range Shape").setValue(6); } catch (e) {}
        var off = s.property("ADBE Text Percent Offset");
        var end = Math.min(l.outPoint, c.t0 + 30), t = c.t0 - phase * period, n = 0;
        while (t < end && n < 40) {
            off.setValueAtTime(t, -width);
            off.setValueAtTime(t + period - c.fd, 100);
            t += period;
            n++;
        }
    }

    function textBlur(l, c, from, seg) {
        var b = addFx(l, ["ADBE Gaussian Blur 2"]);
        animP(b, ["ADBE Gaussian Blur 2-0001"], c, [[0, from * c.sc, seg || "hit"], [1, 0]]);
    }

    var txTypewriter = eachText(function (l, c) {
        animator(l, c, "Typewriter", [["ADBE Text Opacity", 0]], "soft", 0);
    }, 0.6);

    var txScramble = eachText(function (l, c) {
        animator(l, c, "Scramble", [["ADBE Text Character Offset", 17], ["ADBE Text Position 3D", [0, 34, 0]], ["ADBE Text Opacity", 0]], "coast");
    }, 0.7);

    var txSlideUp = eachText(function (l, c) {
        animator(l, c, "Slide Up", [["ADBE Text Position 3D", [0, 90, 0]], ["ADBE Text Opacity", 0]], "out");
    }, 0.6);

    var txDropIn = eachText(function (l, c) {
        animator(l, c, "Drop In", [["ADBE Text Position 3D", [0, -140, 0]], ["ADBE Text Rotation", -12], ["ADBE Text Opacity", 0]], "snap");
    }, 0.6);

    var txBlurIn = eachText(function (l, c) {
        animator(l, c, "Blur In", [["ADBE Text Blur", [38, 38]], ["ADBE Text Opacity", 0]], "coast");
    }, 0.7);

    var txPop = eachText(function (l, c) {
        animate(tr(l, "ADBE Scale"), c, [[0, [165, 165, 100], "hit"], [1, [100, 100, 100]]]);
        textBlur(l, c, 60, "hit");
        animate(tr(l, "ADBE Opacity"), c, [[0, 0, "snap"], [0.25, 100]]);
    });

    var txZoomPunch = eachText(function (l, c) {
        animate(tr(l, "ADBE Scale"), c, [[0, [40, 40, 100], "snap"], [0.35, [112, 112, 100], "smooth"], [1, [100, 100, 100]]]);
        animate(tr(l, "ADBE Opacity"), c, [[0, 0, "snap"], [0.2, 100]]);
        deepGlow(l, 220, 0, c, SOFT(1.4));
    });

    var txFlicker = eachText(function (l, c) {
        var v = [0, 100, 0, 45, 0, 100, 25, 100], pts = [];
        for (var i = 0; i < v.length; i++) pts.push([i / v.length, v[i], "hold"]);
        pts.push([1, 100]);
        animate(tr(l, "ADBE Opacity"), c, pts);
    });

    var txTracking = eachText(function (l, c) {
        var anims = l.property("ADBE Text Properties").property("ADBE Text Animators");
        var a = anims.addProperty("ADBE Text Animator");
        a.name = "Tracking";
        var p = a.property("ADBE Text Animator Properties").addProperty("ADBE Text Tracking Amount");
        animate(p, c, [[0, 110, "out"], [1, 0]]);
        animate(tr(l, "ADBE Opacity"), c, [[0, 0, "coast"], [0.45, 100]]);
    }, 0.8);

    var txGlitchIn = eachText(function (l, c) {
        twitch(l, c, { a: 150, sp: 90, slide: 1, light: 1, sa: 80, la: 200, rgb: 50, spread: 0.2 }, SNAP(150));
        animate(tr(l, "ADBE Opacity"), c, [[0, 0, "hold"], [0.08, 100, "hold"], [0.16, 30, "hold"], [0.24, 100]]);
    });

    var txWavy = eachText(function (l, c) {
        wave(l, c, "Wavy", [["ADBE Text Position 3D", [0, -26, 0]], ["ADBE Text Rotation", 8]], 1.2, 0, 40);
    });

    // ================================================================ TEXT FX

    var tfGlow = eachText(function (l) { deepGlow(l, 250, 1.2, null, null); });

    var tfRays = eachText(function (l) {
        var fx = addFx(l, ["S_Rays", "CC Light Rays"]);
        if (!fx || fxIs(fx, "cc ")) return;
        setP(fx, ["Threshold"], 0.2);
        setP(fx, ["Rays Length"], 0.5);
        setP(fx, ["Rays Brightness"], 5);
    });

    var tfRainbow = eachText(function (l) {
        addFx(l, ["ADBE 4ColorGradient"]);
        deepGlow(l, 250, 1, null, null);
    });

    // colours cycle for the whole layer, each letter bobs and tilts in turn, with glow
    var tfRainbowWave = eachText(function (l, c) {
        addFx(l, ["ADBE 4ColorGradient"]);
        var len = Math.max(1, Math.min(l.outPoint, c.t0 + 30) - c.t0);
        hueKeys(l, { t0: c.t0, D: len, fd: c.fd }, [[0, 0], [1, 360 * Math.max(1, Math.round(len / 2))]]);
        wave(l, c, "Bob", [["ADBE Text Position 3D", [0, -30, 0]]], 1.1, 0, 38);
        wave(l, c, "Tilt", [["ADBE Text Rotation", 11]], 1.7, 0.4, 30);
        deepGlow(l, 260, 1.1, null, null);
    });

    var tfChroma = eachText(function (l) { chroma(l, null, 0.35, null); });

    var tfShake = eachText(function (l, c) {
        sShake(l, c, { freq: 12, x: 26, y: 26, tilt: 3 }, HIT(3));
    });

    var tf3DTilt = eachText(function (l) {
        l.threeDLayer = true;
        tr(l, "ADBE Rotate Y").setValue(-28);
        tr(l, "ADBE Rotate X").setValue(10);
    });

    var tf3DSwing = eachText(function (l, c) {
        l.threeDLayer = true;
        animate(tr(l, "ADBE Rotate Y"), c, [[0, -35, "smooth"], [1, 35]]);
    }, 2);

    var tf3DFlip = eachText(function (l, c) {
        l.threeDLayer = true;
        try { l.threeDPerChar = true; } catch (e) { log.push("per-character 3D not available"); }
        animator(l, c, "3D Flip", [["ADBE Text Rotation X", 90], ["ADBE Text Opacity", 0]], "out");
    }, 0.7);

    // fake depth: a stack of hard shadows, one layer, no renderer change
    var tf3DExtrude = eachText(function (l) {
        for (var i = 1; i <= 10; i++) {
            var fx = addFx(l, ["ADBE Drop Shadow"]);
            if (!fx) break;
            var g = 0.55 - i * 0.04;
            setP(fx, ["ADBE Drop Shadow-0001"], [g, g, g, 1]);
            setP(fx, ["ADBE Drop Shadow-0002"], 255);
            setP(fx, ["ADBE Drop Shadow-0003"], 135);
            setP(fx, ["ADBE Drop Shadow-0004"], i * 1.5);
            setP(fx, ["ADBE Drop Shadow-0005"], 0);
        }
    });

    var tfMoBlur = eachText(function (l, c, comp) {
        l.motionBlur = true;
        comp.motionBlur = true;
    });

    // ================================================================ INTROS + OUTROS
    // CPVP Editing by zalii. Openers start on the playhead, endings start on the playhead too.

    var TITLE_TXT = "edited by you";
    var END_TXT = "thanks for watching";

    function inFade(comp, sel, c) {
        var D = Math.max(c.D, 1);
        var s = makeSolid(comp, sel, "Fade In Start", [0, 0, 0], c.t0, D);
        animate(tr(s, "ADBE Opacity"), { t0: c.t0, D: D, fd: c.fd }, [[0, 100, "coast"], [1, 0]]);
    }
    function inZoom(l, c) {
        geo(l, c, { s: [[0, 135, "out"], [1, 100]], mb: 180 });
        blurFx(l, c, [[0, 70, "out"], [1, 0]]);
        expo(l, c, [[0, -4, "coast"], [0.6, 0]]);
    }
    function inBlur(l, c) {
        blurFx(l, c, [[0, 160, "out"], [1, 0]]);
        expo(l, c, [[0, -3, "coast"], [0.7, 0]]);
    }
    function inFlash(l, c) {
        expo(l, c, [[0, 5, "out"], [1, 0]]);
        deepGlow(l, 450, 0, c, SOFT(2));
        chroma(l, c, 0, SOFT(0.6));
    }

    // random letters scramble into the title, with glow and a slight chroma hit
    function titleReveal(comp, sel, c) {
        var ls = [], i;
        for (i = 0; i < sel.length; i++) if (sel[i] instanceof TextLayer) ls.push(sel[i]);
        if (ls.length === 0) ls.push(newText(comp, TITLE_TXT, 110, comp.time, 4));
        var cc = { t0: c.t0, D: Math.max(c.D, 1.2), fd: c.fd, sc: c.sc, comp: comp };
        for (i = 0; i < ls.length; i++) {
            var l = ls[i];
            animator(l, cc, "Scramble", [["ADBE Text Character Offset", 40]], "coast", 0);
            animator(l, { t0: cc.t0, D: cc.D * 0.75, fd: cc.fd }, "Reveal", [["ADBE Text Opacity", 0]], "soft", 100);
            chroma(l, cc, 0, SOFT(0.5));
            deepGlow(l, 240, 0, cc, [[0, 2.2, "out"], [1, 0.7]]);
        }
    }

    function outFade(comp, sel, c) {
        var D = Math.max(c.D, 1);
        var s = makeSolid(comp, sel, "Fade Out End", [0, 0, 0], c.t0, Math.max(D, comp.duration - c.t0));
        animate(tr(s, "ADBE Opacity"), { t0: c.t0, D: D, fd: c.fd }, [[0, 0, "in"], [1, 100]]);
    }
    function outZoom(l, c) {
        geo(l, c, { s: [[0, 100, "in"], [1, 118]], mb: 120 });
        blurFx(l, c, [[0, 0, "in"], [1, 90]]);
        expo(l, c, [[0.3, 0, "in"], [1, -6]]);
    }
    function outBlur(l, c) {
        blurFx(l, c, [[0, 0, "in"], [1, 200]]);
        expo(l, c, [[0.35, 0, "in"], [1, -6]]);
    }
    function outSlow(comp, sel, c) {
        slowStop(comp, sel, c);
        var D = lengthSeconds(comp, 1.5);
        var s = makeSolid(comp, sel, "Slow-Down Fade", [0, 0, 0], comp.time + D * 0.4, D * 0.6);
        animate(tr(s, "ADBE Opacity"), { t0: comp.time + D * 0.4, D: D * 0.6, fd: c.fd }, [[0, 0, "in"], [1, 100]]);
    }
    function endCard(comp, sel, c) {
        var D = Math.max(lengthSeconds(comp, 3), 1.5);
        var s = makeSolid(comp, sel, "End Card", [0.02, 0.02, 0.03], c.t0, D);
        animate(tr(s, "ADBE Opacity"), { t0: c.t0, D: 0.5, fd: c.fd }, [[0, 0, "coast"], [1, 100]]);
        var t = newText(comp, END_TXT, 96, c.t0 + 0.3, D - 0.3);
        try { t.moveBefore(s); } catch (e) {}
        var cc = { t0: c.t0 + 0.3, D: 0.9, fd: c.fd, sc: c.sc, comp: comp };
        animator(t, cc, "Reveal", [["ADBE Text Opacity", 0], ["ADBE Text Position 3D", [0, 30, 0]]], "coast");
        deepGlow(t, 240, 0.8, null, null);
    }

    // ================================================================ TOOLS

    function dumpGroup(g, indent, out, depth) {
        if (depth > 4) return;
        var n = 0;
        try { n = g.numProperties; } catch (e) { return; }
        for (var i = 1; i <= n; i++) {
            var p = g.property(i);
            out.push(indent + p.name + "   [" + p.matchName + "]");
            var isGroup = false;
            try { isGroup = (p.propertyType !== PropertyType.PROPERTY); } catch (e2) {}
            if (isGroup) dumpGroup(p, indent + "    ", out, depth + 1);
        }
    }

    function textBox(title, txt) {
        if (TEST) return;
        var d = new Window("dialog", title);
        d.alignChildren = ["fill", "fill"];
        var box = d.add("edittext", undefined, txt, { multiline: true, scrolling: true });
        box.preferredSize = [520, 420];
        d.add("button", undefined, "Close", { name: "ok" });
        d.show();
    }

    function listParams() {
        var comp = getComp();
        if (!comp) return;
        if (comp.selectedLayers.length === 0) { warn("Select a layer that has the effect on it."); return; }
        var fxGroup = comp.selectedLayers[0].property("ADBE Effect Parade");
        var out = [], picked = [], i;
        for (i = 1; i <= fxGroup.numProperties; i++) {
            if (fxGroup.property(i).selected) picked.push(fxGroup.property(i));
        }
        if (picked.length === 0) {
            for (i = 1; i <= fxGroup.numProperties; i++) picked.push(fxGroup.property(i));
        }
        for (i = 0; i < picked.length; i++) {
            out.push(picked[i].name + "   [" + picked[i].matchName + "]");
            dumpGroup(picked[i], "    ", out, 0);
            out.push("");
        }
        textBox("Effect params (copy all and send)", out.join("\n"));
    }

    var PLUGS = [
        ["Sapphire", "S_Shake"], ["Deep Glow", "PEDG"], ["Twitch", "Videocopilot Twitch"],
        ["Continuum", "BCC_CHROMATICABERRATION"], ["OLM KiraKira", "OLM OLM Kira Kira"]
    ];

    function plugLines() {
        var out = [];
        for (var i = 0; i < PLUGS.length; i++) out.push((has(PLUGS[i][1]) ? "found      " : "missing    ") + PLUGS[i][0]);
        return out;
    }

    function plugCheck() {
        textBox(NAME + " - plugin check", plugLines().join("\n") + "\n\ntext font: " + pickFont());
    }

    function lastNotes() {
        textBox(NAME + " - last notes", ui.last || "nothing applied yet");
    }

    // ================================================================ PRESET TABLE
    // CPVP Editing by zalii
    // P(name, kind, fn, description, {len: auto seconds, req: [needs one of], lin: 1})

    function P(n, k, f, d, o) {
        var def = { n: n, k: k, f: f, d: d };
        if (o) { def.len = o.len; def.req = o.req; def.lin = o.lin; }
        return def;
    }

    var R_TW = ["Videocopilot Twitch"];
    var R_CH = ["S_WarpChroma", "BCC_CHROMATICABERRATION"];

    var GROUPS = [
        ["Shakes", [
            P("Heavy Hit", "hit", stack({ sh: { amp: 5, freq: 12, x: 34, y: 26, z: 0.1, tilt: 2.5 }, zb: 0.35, ch: 0.6, gl: [300, 1.5] }), "Big stacked hit: shake, zoom blur, chroma and glow.", { len: 0.55 }),
            P("Mega Hit", "hit", stack({ geo: 172, sh: { amp: 8, freq: 14, x: 40, y: 46, z: 0.15, tilt: 5, rgb: 0.6 }, tw: TW_HIT, ch: 1, gl: [420, 2.4], ex: 2.2 }), "The biggest one: hard shake, zoom punch, twitch, flash and glow.", { len: 0.7 }),
            P("Impact", "hit", stack({ sh: { amp: 6.5, freq: 10, x: 22, y: 64, tilt: 3.5, mb: 1 }, tw: { a: 90, sp: 80, slide: 1, sa: 50 }, ex: 0.9 }), "Hard impact shake that slams on frame one and settles.", { len: 0.5 }),
            P("Impact Punch", "hit", stack({ mo: 0.78, sh: { amp: 4.5, freq: 12, x: 30, y: 30, z: 0.1, tilt: 3 } }), "Shake with a quick zoom punch.", { len: 0.45 }),
            P("Impact Zoom Shake", "hit", stack({ geo: 180, sh: { amp: 6, freq: 12, x: 30, y: 52, tilt: 4 }, zb: 0.3, ch: 0.7, gl: [320, 1.4] }), "Full shake with a 180% zoom punch, blur, chroma and glow.", { len: 0.6 }),
            P("Impact Crush", "hit", stack({ mo: 0.7, sh: { amp: 7, freq: 9, x: 16, y: 80, tilt: 2 }, wv: { fx: "puff", a: 0.35 }, ch: 0.8 }), "Vertical crush: heavy drop with a lens puff and chroma.", { len: 0.55 }),
            P("Impact Flash", "hit", stack({ sh: { amp: 5, freq: 14, x: 36, y: 36, tilt: 3 }, ex: 2.6, gl: [380, 1.8] }), "Impact shake under a bright flash.", { len: 0.5 }),
            P("Crystal Pop", "hit", stack({ geo: 150, sh: { amp: 5.5, freq: 16, x: 30, y: 30, tilt: 6, rgb: 0.8 }, ch: 1.1, gl: [360, 2], ex: 1.4 }), "Crystal explosion hit: zoom punch, RGB rattle and glow.", { len: 0.55 }),
            P("Slam Down", "hit", stack({ mo: 0.85, sh: { amp: 5, freq: 10, x: 6, y: 90, tilt: 1 } }), "Straight down slam.", { len: 0.45 }),
            P("Slam Side", "hit", stack({ sh: { amp: 5, freq: 10, x: 95, y: 6, tilt: 1 } }), "Sideways slam.", { len: 0.45 }),
            P("Side Rattle", "hit", stack({ sh: { amp: 3.5, freq: 22, x: 60, y: 4, tilt: 0.5 }, tw: { a: 80, sp: 90, slide: 1, sa: 60, dir: 0, spread: 0 } }), "Fast left-right rattle.", { len: 0.4 }),
            P("Twist Shake", "hit", stack({ sh: { amp: 3.5, freq: 12, x: 12, y: 12, z: 0.1, tilt: 14 } }), "Mostly rotation.", { len: 0.5 }),
            P("Zoom Shake", "hit", stack({ geo: 180, sh: { amp: 4, freq: 14, x: 14, y: 14, z: 0.3, tilt: 1.5 }, zb: 0.25 }), "Zoom punch from 180% with a tight shake.", { len: 0.5 }),
            P("Zoom Slam", "hit", stack({ geo: 200, sh: { amp: 6, freq: 10, x: 20, y: 60, tilt: 3 }, zb: 0.45, ch: 0.8, gl: [340, 1.6] }), "Huge zoom punch slamming back to normal.", { len: 0.6 }),
            P("Zoom Rattle", "hit", stack({ geo: 160, sh: { amp: 3, freq: 24, x: 24, y: 24, z: 0.4, tilt: 2 }, env: SNAP }), "Quick zoom with a buzzing rattle.", { len: 0.4 }),
            P("Zoom Pulse Shake", "hit", stack({ geo: 140, sh: { amp: 4, freq: 12, x: 26, y: 26, tilt: 2 }, gl: [300, 1.2], env: DOUBLE }), "Two zoom hits back to back.", { len: 0.7 }),
            P("Warp Shake", "hit", stack({ sh: { amp: 5, freq: 12, x: 26, y: 50, tilt: 3 }, wv: { fx: "waves", a: 0.3, f: 2 }, ch: 0.6 }), "Shake with a wave warp that flattens out.", { len: 0.6 }),
            P("Warp Bubble Shake", "hit", stack({ sh: { amp: 4, freq: 14, x: 30, y: 30, tilt: 2 }, wv: { fx: "bubble", a: 0.3, f: 5 }, gl: [280, 1] }), "Shake with a wobbly bubble warp.", { len: 0.6 }),
            P("Warp Puff Hit", "hit", stack({ geo: 130, sh: { amp: 4, freq: 12, x: 24, y: 24, tilt: 2 }, wv: { fx: "puff", a: 0.6 }, ch: 0.9 }), "Lens puffs out on the hit and snaps back.", { len: 0.5 }),
            P("RGB Shake", "hit", stack({ sh: { amp: 4.5, freq: 16, x: 36, y: 28, z: 0.1, tilt: 2, rgb: 1.6 }, ch: 0.5 }), "Shake with the colours pulled apart.", { len: 0.5 }),
            P("Blur Shake", "hit", function (l, c) { stack({ sh: { amp: 4, freq: 12, x: 34, y: 34, tilt: 2, mb: 1.4 } })(l, c); blurFx(l, c, HIT(60)); }, "Shake under a blur that clears.", { len: 0.5 }),
            P("Beat Shake", "hit", stack({ sh: { amp: 2.6, freq: 14, x: 30, y: 24, z: 0.05, tilt: 1.5 } }), "Light shake for every beat.", { len: 0.35 }),
            P("Beat Hit Soft", "hit", stack({ mo: 0.94, sh: { amp: 2, freq: 12, x: 22, y: 22, tilt: 1 }, gl: [240, 0.6], env: SOFT }), "Soft beat hit with a touch of glow.", { len: 0.4 }),
            P("Beat Hit Hard", "hit", stack({ mo: 0.86, sh: { amp: 4, freq: 14, x: 30, y: 36, tilt: 2.5 }, ch: 0.5, gl: [300, 1.1] }), "Harder beat hit: shake, punch, chroma, glow.", { len: 0.45 }),
            P("Beat Bounce", "hit", stack({ sh: { amp: 3, freq: 8, x: 4, y: 20, yw: 40, tilt: 0.5 }, mo: 0.92, env: SOFT }), "Bouncy up-down beat.", { len: 0.5 }),
            P("Beat Glow Shake", "hit", stack({ sh: { amp: 2.8, freq: 14, x: 26, y: 26, tilt: 1.5 }, gl: [340, 1.6], ex: 0.6 }), "Beat shake under a glow burst.", { len: 0.45 }),
            P("Double Hit", "hit", stack({ sh: { amp: 5, freq: 12, x: 30, y: 44, tilt: 3 }, zb: 0.3, ch: 0.6, env: DOUBLE }), "Two hits in one preset.", { len: 0.7 }),
            P("Triple Tap", "hit", stack({ sh: { amp: 4, freq: 14, x: 28, y: 34, tilt: 2 }, mo: 0.88, env: TRIPLE }), "Three quick taps, the last one rings out.", { len: 0.8 }),
            P("Bass Rumble", "hit", stack({ sh: { amp: 2.2, freq: 5, x: 30, y: 50, z: 0.1, tilt: 1 }, env: SUSTAIN }), "Low slow rumble.", { len: 0.9 }),
            P("Jumpy Shake", "hit", stack({ sh: { amp: 3.5, freq: 14, x: 40, y: 34, z: 0.1, tilt: 3, style: 3 } }), "Jumps between positions.", { len: 0.5 }),
            P("Twitchy Shake", "hit", stack({ sh: { amp: 4, freq: 18, x: 40, y: 34, z: 0.1, tilt: 3, style: 2 }, tw: TW_SLIDE, env: SUSTAIN, twenv: SUSTAIN }), "Nervous twitching that holds, then lets go.", { len: 0.7 }),
            P("Earthquake", "hit", stack({ sh: { amp: 3.2, freq: 9, x: 44, y: 52, z: 0.1, tilt: 2 }, env: SUSTAIN }), "Long rolling shake.", { len: 1.2 }),
            P("Tilt Swing", "hit", tiltSwing, "Camera tilts over and swings back.", { len: 0.6 }),
            P("Twitch Burst", "hit", stack({ tw: TW_HIT }), "Twitch only: blur, light and slide burst.", { len: 0.4, req: R_TW }),
            P("Twitch Slam", "hit", stack({ geo: 140, sh: { amp: 4, freq: 12, x: 26, y: 40, tilt: 2 }, tw: TW_SCALE }), "Zoom punch with a Twitch scale and blur burst.", { len: 0.5 }),
            P("Twitch RGB", "hit", stack({ tw: TW_SLIDE, ch: 0.8 }), "Twitch slide with RGB split.", { len: 0.4, req: R_TW }),
            P("Glitch Shake", "hit", function (l, c) { stack({ sh: { amp: 3.5, freq: 20, x: 46, y: 10, tilt: 1 }, tw: TW_SLIDE })(l, c); glitch(l, c); }, "Shake with digital damage.", { len: 0.45 })
        ]],
        ["Beat Pumps", [
            P("Beat Pump", "hit", stack({ mo: 0.92, gl: [220, 0.5], env: SOFT }), "Clean zoom pump with glow, no rattle.", { len: 0.4 }),
            P("Beat Pump Soft", "hit", stack({ mo: 0.96, gl: [200, 0.3], env: SOFT }), "Barely there pump for quiet beats.", { len: 0.45 }),
            P("Beat Pump Hard", "hit", stack({ mo: 0.84, gl: [280, 0.9] }), "Strong pump for the loud beats.", { len: 0.4 }),
            P("Punch Pump", "hit", stack({ geo: 125, gl: [240, 0.6] }), "Scale pump from 125% without motion blur streaks.", { len: 0.4 }),
            P("Glow Pump", "hit", stack({ mo: 0.95, gl: [380, 1.6], env: SOFT }), "Small pump, big glow.", { len: 0.45 }),
            P("Chroma Pump", "hit", stack({ mo: 0.92, ch: 0.8, env: SOFT }), "Pump with a chroma pulse.", { len: 0.4 }),
            P("Flash Pump", "hit", stack({ mo: 0.9, ex: 1.2, gl: [300, 0.8] }), "Pump with a quick exposure flash.", { len: 0.4 }),
            P("Bass Pump", "hit", stack({ mo: 0.88, gl: [260, 0.7], env: function (v) { return [[0, v, "coast"], [1, 0]]; } }), "Slower, heavier pump for bass hits.", { len: 0.7 }),
            P("Double Pump", "hit", stack({ mo: 0.9, gl: [240, 0.6], env: DOUBLE }), "Two pumps in a row.", { len: 0.6 }),
            P("Blur Pump", "hit", stack({ mo: 0.93, zb: 0.25, env: SOFT }), "Pump with a zoom blur pulse.", { len: 0.4 }),
            P("Tilt Pump", "hit", function (l, c) { moCurves(l, c, [[0, 0.92, "out"], [1, 1]], [[0, 3, "out"], [1, 0]], null, null); }, "Pump with a small tilt.", { len: 0.45 })
        ]],
        ["Build-Up", [
            P("Full Build-Up", "pre", buFull, "Push in, rising shake, chroma and glow into the drop.", { len: 1.5 }),
            P("Rising Shake", "pre", buRise, "Shake that grows until the drop.", { len: 1.5 }),
            P("Slow Push In", "pre", buPush, "Slow zoom in that speeds up at the end.", { len: 2 }),
            P("Growing Glow", "pre", buGlow, "Glow swelling into the drop.", { len: 1.5 }),
            P("Rising Chroma", "pre", buChroma, "Colours split more and more.", { len: 1.5, req: R_CH }),
            P("Riser Blur", "pre", buBlur, "Zoom blur building up.", { len: 1.2 }),
            P("Flicker Build", "pre", buFlicker, "Flicker that gets stronger.", { len: 1.2, lin: 1 }),
            P("Tension Zoom", "pre", buTension, "Push in while the edges close in.", { len: 2 }),
            P("Heartbeat Pumps", "pre", buHeart, "Pumps that get closer together until the drop.", { len: 2 }),
            P("Twitch Build", "pre", buTwitch, "Twitching that ramps up.", { len: 1.2, req: R_TW }),
            P("Speed-Up Ramp", "self", ramp("into", 1.6, 9, 90, 1, true), "Selected clip: slow, then races into the drop.", { len: 1 })
        ]],
        ["Transitions", [
            P("Spin Right", "trans", spin(1), "Full spin over the cut, slow-fast-slow.", { len: 0.8 }),
            P("Spin Left", "trans", spin(-1), "Full spin the other way.", { len: 0.8 }),
            P("Zoom In", "trans", zoomThrough(0.28, 2.6), "Zoom through the cut, forward.", { len: 0.6 }),
            P("Zoom Out", "trans", zoomThrough(2.6, 0.28), "Zoom through the cut, pulling back.", { len: 0.6 }),
            P("Zoom Spin", "trans", zoomSpin, "Zoom through with a twist.", { len: 0.6 }),
            P("Whip Left", "trans", whip(-1, 0), "Whip pan to the left.", { len: 0.5 }),
            P("Whip Right", "trans", whip(1, 0), "Whip pan to the right.", { len: 0.5 }),
            P("Whip Up", "trans", whip(0, -1), "Whip pan up.", { len: 0.5 }),
            P("Whip Down", "trans", whip(0, 1), "Whip pan down.", { len: 0.5 }),
            P("Warp Wave", "trans", warpWave, "Wave warp peaking on the cut.", { len: 0.6 }),
            P("Vortex Twist", "trans", vortex, "Picture twists into the cut.", { len: 0.6 }),
            P("Fisheye Zoom", "trans", fisheye, "Fisheye bulge over the cut.", { len: 0.6 }),
            P("Blur Dip", "trans", blurDip, "Blur ramps up into the cut and back to sharp.", { len: 0.6 }),
            P("Prism Flash", "trans", prismCut, "Chroma, glow and flash peaking on the cut.", { len: 0.5 }),
            P("Flash Cut", "trans", flashCut, "White-out on the cut.", { len: 0.4 }),
            P("Shake Cut", "trans", shakeCut, "Shake that peaks on the cut.", { len: 0.5 }),
            P("Glitch Cut", "trans", glitchCut, "Digital glitch over the cut.", { len: 0.4, req: ["S_DigitalDamage", "BCC_VIDEOGLITCH", "Videocopilot Twitch", "S_WarpChroma"] })
        ]],
        ["Flash", [
            P("White Flash", "self", flash("White Flash", [1, 1, 1], 90, true), "White flash that fades fast.", { len: 0.35 }),
            P("Pink Flash", "self", flash("Pink Flash", [1, 0.35, 0.8], 80, true), "Pink flash.", { len: 0.35 }),
            P("Red Flash", "self", flash("Red Flash", [1, 0.05, 0.12], 75, true), "Red flash.", { len: 0.35 }),
            P("Gold Flash", "self", flash("Gold Flash", [1, 0.8, 0.2], 80, true), "Gold flash.", { len: 0.35 }),
            P("Purple Flash", "self", flash("Purple Flash", [0.6, 0.15, 1], 80, true), "Purple flash.", { len: 0.35 }),
            P("Soft White Flash", "self", flash("Soft White Flash", [1, 1, 1], 60, true, "coast"), "Slower, softer white flash.", { len: 0.6 }),
            P("Exposure Pulse", "hit", exposurePulse, "Exposure and glow pulse.", { len: 0.4 }),
            P("Invert Flash", "self", invertFlash, "Two frames of inverted colours.", { lin: 1 }),
            P("Threshold Flash", "self", thresholdFlash, "Three frames of black and white.", { lin: 1 }),
            P("Black Strobe", "self", blackStrobe, "Black frames strobing.", { lin: 1 }),
            P("Dip to Black", "self", dipBlack, "Dips to black around the playhead.", { len: 0.5 }),
            P("Fade In", "self", fade("Fade In", 100, 0, "coast"), "Fade in from black.", { len: 0.6 }),
            P("Fade Out", "self", fade("Fade Out", 0, 100, "in"), "Fade out to black.", { len: 0.6 })
        ]],
        ["Light + Glow", [
            P("Rays Burst", "hit", raysBurst, "Light rays bursting out and fading.", { len: 0.5 }),
            P("God Rays", "look", godRays, "Steady light rays."),
            P("Edge Rays", "look", edgeRays, "Rays from the edges of things."),
            P("Glow Pulse", "hit", glowPulse, "Glow burst that fades.", { len: 0.5 }),
            P("Soft Glow", "look", softGlow, "Light steady glow."),
            P("Rainbow Glow", "hit", rainbowGlow, "Rainbow glow with a hue cycle.", { len: 1, lin: 1 }),
            P("Glint Sparkle", "look", fxGlint, "Star glints on bright spots.", { req: ["S_Glint", "S_GlintRainbow", "S_Sparkles"] }),
            P("KiraKira Sparkle", "look", fxKira, "Anime style sparkle streaks.", { req: ["OLM OLM Kira Kira", "S_Glint"] }),
            P("Streaks", "look", fxStreaks, "Light streaks.", { req: ["S_Streaks", "S_Glare"] }),
            P("Glare", "look", fxGlare, "Glare on highlights.", { req: ["S_Glare", "S_Glint"] }),
            P("Light Leak", "hit", fxLightLeak, "Film light leak.", { lin: 1, req: ["S_LightLeak", "BCC_LIGHTLEAKS"] }),
            P("Lens Flare", "look", lensFlare, "Lens flare you can move around."),
            P("Flare Burst", "hit", flareBurst, "Lens flare that flashes and fades.", { len: 0.6 }),
            P("Lightning", "hit", fxLightning, "Lightning bolt.", { lin: 1 })
        ]],
        ["FX", [
            P("Blur Names", "self", blurNames, "Mosaic patch to drag over a nametag, chat or scoreboard.", { lin: 1 }),
            P("Chroma Hit", "hit", chromaHit, "Colours split and snap back.", { len: 0.45, req: R_CH }),
            P("Zoom Blur Hit", "hit", zoomBlurHit, "Zoom blur burst.", { len: 0.45 }),
            P("Glitch", "hit", glitch, "Digital damage burst.", { len: 0.4, req: ["S_DigitalDamage", "BCC_VIDEOGLITCH", "S_WarpChroma"] }),
            P("Pixel Sort", "hit", fxPixelSort, "Pixel sorting.", { lin: 1, req: ["S_PixelSort"] }),
            P("JPEG Damage", "hit", fxJpeg, "Crunchy compression damage.", { lin: 1, req: ["S_JpegDamage", "S_DigitalDamage"] }),
            P("Channel Change", "hit", channelChange, "Old TV losing signal for a moment.", { len: 0.4, req: ["S_TVDamage", "BCC4Damaged TV"] }),
            P("Prism Blur", "hit", fxPrismBlur, "Prism defocus.", { lin: 1, req: ["S_DefocusPrism", "S_BlurChroma", "BCC_PRISMBLUR"] }),
            P("Rainbow Cycle", "hit", rainbowCycle, "Hue runs once around the rainbow.", { len: 1, lin: 1 }),
            P("Rainbow Steps", "hit", rainbowSteps, "Hard colour steps with glow.", { len: 0.6, lin: 1 }),
            P("Echo Trails", "hit", trails, "Ghost trails behind movement.", { lin: 1 }),
            P("Neon Edges", "hit", neon, "Glowing outlines.", { lin: 1 }),
            P("Dream Haze", "hit", haze, "Soft dreamy haze.", { lin: 1 }),
            P("Halftone", "hit", fxHalftone, "Comic dots.", { lin: 1, req: ["S_HalfTone", "S_HalfToneColor"] }),
            P("CRT Screen", "look", crt, "Old TV look with chroma and vignette.", { req: ["S_TVDamage", "BCC4Damaged TV"] }),
            P("Floating Card (3D)", "self", floatingCard, "Selected layer floats and turns in 3D.", { len: 1.5 }),
            P("Letterbox", "self", letterbox, "Cinema bars.", { lin: 1 })
        ]],
        ["CC", [
            P("Purple Night", "look", ccPurpleNight, "Cool purple grade with glow."),
            P("Cold Steel", "look", ccColdSteel, "Cold, low saturation."),
            P("Teal Moody", "look", ccTealMoody, "Dark teal."),
            P("Pink Bloom", "look", ccPinkBloom, "Warm pink haze."),
            P("Crystal Pink", "look", ccCrystal, "Punchy magenta, sharp, light glow."),
            P("Gold Hour", "look", ccGoldHour, "Warm gold."),
            P("Dark Punch", "look", ccDarkPunch, "Dark and contrasty."),
            P("Vibrant Pop", "look", ccVibrant, "Saturated and sharp."),
            P("Dark + Glow", "look", ccDarkGlow, "Dark picture, glowing highlights."),
            P("Black & White", "look", ccBlackWhite, "Contrasty black and white."),
            P("Bleach Bypass", "look", fxBleach, "Washed, gritty film look.", { req: ["S_BleachBypass", "BCC_BLEACHBYPASS"] }),
            P("Vignette", "look", function (l) { vignette(l); }, "Dark edges."),
            P("Sharpen", "look", sharpen, "Sharpen."),
            P("Film Grain", "look", ccFilm, "Film look with grain."),
            P("Magic Bullet Looks", "look", ccMagicBullet, "Adds Looks so you can pick a look yourself.", { req: ["MB LookSuite3"] })
        ]],
        ["Time Remap", [
            P("Kill Ramp", "self", ramp("kill", 1, 9, 90, 1), "Selected clip: instantly fast, then slows right down.", { len: 1 }),
            P("Kill Ramp Hard", "self", ramp("kill", 1.6, 11, 94, 1), "Faster burst, longer slow landing.", { len: 1 }),
            P("Kill Ramp Soft", "self", ramp("kill", 1, 5, 80, 1), "Gentler version.", { len: 1 }),
            P("Double Ramp", "self", ramp("kill", 1, 9, 90, 2), "Two kill ramps in the length.", { len: 1 }),
            P("Triple Ramp", "self", ramp("kill", 1, 9, 90, 3), "Three kill ramps in the length.", { len: 1 }),
            P("Into Hit (slow > fast)", "self", ramp("into", 1, 9, 90, 1), "Slow, then snaps fast at the end.", { len: 1 }),
            P("Slow-Mo (25%)", "self", speedChange(0.25), "Quarter speed for the length.", { len: 1 }),
            P("Slow-Mo (50%)", "self", speedChange(0.5), "Half speed for the length.", { len: 1 }),
            P("Freeze Frame", "self", speedChange(0), "Freezes for the length.", { len: 1 })
        ]],
        ["Beats", [
            P("Beat Markers (main hits)", "self", beatMarkers(1.6), "Markers on the hardest hits of the selected song.", { lin: 1 }),
            P("Beat Markers (normal)", "self", beatMarkers(0.8), "Markers on most beats.", { lin: 1 }),
            P("Beat Markers (every hit)", "self", beatMarkers(0.2), "Markers on every small hit.", { lin: 1 }),
            P("Clear Markers", "self", clearMarkers, "Removes the markers from the selected layers.", { lin: 1 })
        ]],
        ["Text", [
            P("Typewriter", "self", txTypewriter, "Letters appear one by one.", { len: 0.6 }),
            P("Scramble In", "self", txScramble, "Random letters settle into the text.", { len: 0.7 }),
            P("Slide Up", "self", txSlideUp, "Letters slide up into place.", { len: 0.6 }),
            P("Drop In", "self", txDropIn, "Letters drop in from above.", { len: 0.6 }),
            P("Blur In", "self", txBlurIn, "Letters come out of a blur, ending sharp.", { len: 0.7 }),
            P("Pop In", "self", txPop, "Whole text punches in and lands sharp.", { len: 0.5 }),
            P("Zoom Punch In", "self", txZoomPunch, "Grows past full size and settles, with glow.", { len: 0.5 }),
            P("Flicker In", "self", txFlicker, "Flickers on like a bad light.", { len: 0.5, lin: 1 }),
            P("Tracking In", "self", txTracking, "Letters close in from wide spacing.", { len: 0.8 }),
            P("Glitch In", "self", txGlitchIn, "Twitches in.", { len: 0.5, req: R_TW }),
            P("Wavy", "self", txWavy, "A wave keeps running through the letters.", { lin: 1 })
        ]],
        ["Text FX", [
            P("Glow", "self", tfGlow, "Glow on the text.", { lin: 1 }),
            P("Light Rays", "self", tfRays, "Rays from the text.", { lin: 1 }),
            P("Rainbow", "self", tfRainbow, "Rainbow gradient with glow.", { lin: 1 }),
            P("Rainbow Wave", "self", tfRainbowWave, "Colours cycle, letters bob and tilt, with glow.", { lin: 1 }),
            P("Chroma Split", "self", tfChroma, "Colour fringes on the text.", { lin: 1 }),
            P("Shake", "self", tfShake, "Text shakes and settles.", { len: 0.5 }),
            P("3D Tilt", "self", tf3DTilt, "Tilts the text in 3D.", { lin: 1 }),
            P("3D Swing", "self", tf3DSwing, "Text swings side to side in 3D.", { len: 2 }),
            P("3D Flip In", "self", tf3DFlip, "Letters flip up into place.", { len: 0.7 }),
            P("3D Extrude", "self", tf3DExtrude, "Fake depth from stacked shadows.", { lin: 1 }),
            P("Motion Blur On", "self", tfMoBlur, "Turns on motion blur for the text.", { lin: 1 })
        ]],
        ["Intros + Outros", [
            P("Fade In Start", "self", inFade, "Opens from black.", { len: 1 }),
            P("Zoom In Start", "hit", inZoom, "Opens zoomed and blurred, lands sharp.", { len: 1 }),
            P("Blur In Start", "hit", inBlur, "Opens out of a blur.", { len: 1 }),
            P("Flash In Start", "hit", inFlash, "Opens out of a white flash.", { len: 0.8 }),
            P("Title Reveal", "self", titleReveal, "Random letters scramble into your title, with glow and chroma.", { len: 1.2 }),
            P("Fade Out End", "self", outFade, "Closes to black and stays black.", { len: 1 }),
            P("Zoom Out End", "hit", outZoom, "Pushes in, blurs and darkens to the end.", { len: 1.5 }),
            P("Blur Out End", "hit", outBlur, "Blurs away to black.", { len: 1.2 }),
            P("Slow-Down Ending", "self", outSlow, "Selected clip slows to a stop and fades out.", { len: 1.5 }),
            P("End Card", "self", endCard, "Dark card with a closing line.", { len: 3 })
        ]],
        ["Tools", [
            P("List effect params", "tool", listParams, "Lists every parameter of the selected effect."),
            P("Plugin check", "tool", plugCheck, "Shows which plugins the panel found."),
            P("Show last notes", "tool", lastNotes, "Shows the notes from the last preset you applied.")
        ]]
    ];

    // test hook: no UI, hand the preset table to the test script
    if (TEST) {
        $.global.CPVP_API = {
            groups: GROUPS,
            ver: VER,
            credit: CREDIT,
            avail: avail,
            font: pickFont,
            run: function (def, useSel, len) {
                opt.sel = useSel;
                opt.len = len || "auto";
                return run(def);
            }
        };
        return;
    }

    // ================================================================ UI
    // CPVP Editing by zalii

    var ACC = [0.93, 0.33, 0.67, 1];
    var DIM = [0.62, 0.62, 0.66, 1];

    function pen(el, col) {
        try { el.graphics.foregroundColor = el.graphics.newPen(el.graphics.PenType.SOLID_COLOR, col, 1); } catch (e) {}
    }

    function bold(el, size) {
        try { el.graphics.font = ScriptUI.newFont(el.graphics.font.name, "BOLD", size); } catch (e) {}
    }

    function aboutText() {
        return NAME + "  v" + VER + "\n" +
            "made by " + AUTHOR + "\n\n" +
            "One-click edit presets for crystal pvp edits.\n\n" +
            "HOW TO USE\n" +
            "1. Park the playhead on the hit, beat or cut.\n" +
            "2. Pick a category and a preset.\n" +
            "3. Press Apply, or double-click the preset.\n\n" +
            "Shakes and FX start on the playhead.\n" +
            "Transitions peak on the playhead: park it on the cut.\n" +
            "Build-ups end on the playhead: park it on the drop.\n" +
            "Text and Time Remap presets work on the selected layers.\n\n" +
            "Everything is keyframes. Press U on the layer and reshape any curve in the Graph Editor.\n\n" +
            "PLUGINS ON THIS PC\n" + plugLines().join("\n") + "\n\n" +
            "Missing plugins fall back to built-in effects where possible. Presets that cannot work are marked \"needs ...\" in the list.\n\n" +
            "Copyright " + AUTHOR + ". All rights reserved.\nDo not re-upload or sell.";
    }

    function build(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", NAME, undefined, { resizeable: true });
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 6;
        w.margins = 10;

        var hd = w.add("group");
        hd.orientation = "row";
        hd.alignChildren = ["left", "center"];
        hd.spacing = 6;
        var ttl = hd.add("statictext", undefined, "CPVP EDITING");
        bold(ttl, 14);
        pen(ttl, ACC);
        var by = hd.add("statictext", undefined, "v" + VER + "  by " + AUTHOR);
        pen(by, DIM);
        by.alignment = ["fill", "center"];
        ui.hlp = hd.add("button", undefined, "?");
        ui.hlp.preferredSize = [24, 20];
        ui.hlp.alignment = ["right", "center"];
        ui.hlp.helpTip = "About / help";

        var bar = w.add("group");
        bar.preferredSize = [-1, 2];
        bar.maximumSize = [10000, 2];
        try { bar.graphics.backgroundColor = bar.graphics.newBrush(bar.graphics.BrushType.SOLID_COLOR, ACC); } catch (e0) {}

        var body = w.add("group");
        body.orientation = "stack";
        body.alignment = ["fill", "fill"];
        body.alignChildren = ["fill", "fill"];

        var main = body.add("group");
        main.orientation = "column";
        main.alignChildren = ["fill", "top"];
        main.spacing = 6;

        var names = [], g, i;
        for (g = 0; g < GROUPS.length; g++) names.push(GROUPS[g][0] + "   (" + GROUPS[g][1].length + ")");
        ui.cat = main.add("dropdownlist", undefined, names);
        ui.cat.helpTip = "Category";

        ui.list = main.add("listbox", undefined, [], { multiselect: false });
        ui.list.alignment = ["fill", "fill"];
        ui.list.preferredSize = [230, 230];
        ui.list.minimumSize = [100, 60];

        ui.desc = main.add("statictext", undefined, " ", { multiline: true });
        ui.desc.alignment = ["fill", "bottom"];
        ui.desc.preferredSize = [230, 30];
        pen(ui.desc, DIM);

        ui.apply = main.add("button", undefined, "Apply");
        ui.apply.alignment = ["fill", "bottom"];
        ui.apply.preferredSize = [230, 28];
        ui.apply.helpTip = "Apply the selected preset (or double-click it)";

        var opts = main.add("group");
        opts.orientation = "row";
        opts.alignment = ["fill", "bottom"];
        opts.alignChildren = ["left", "center"];
        opts.spacing = 6;
        ui.target = opts.add("dropdownlist", undefined, ["New adjustment layer", "Selected layers"]);
        ui.target.selection = 0;
        ui.target.alignment = ["fill", "center"];
        ui.target.helpTip = "Where the preset goes";
        var ll = opts.add("statictext", undefined, "Len");
        ll.alignment = ["right", "center"];
        pen(ll, DIM);
        ui.len = opts.add("edittext", undefined, "auto");
        ui.len.characters = 4;
        ui.len.alignment = ["right", "center"];
        ui.len.helpTip = "Animation length in frames. \"auto\" lets each preset pick.";

        var about = body.add("group");
        about.orientation = "column";
        about.alignChildren = ["fill", "fill"];
        about.spacing = 6;
        var abt = about.add("edittext", undefined, aboutText(), { multiline: true, readonly: true, scrolling: true });
        abt.alignment = ["fill", "fill"];
        abt.preferredSize = [230, 300];
        var back = about.add("button", undefined, "Back");
        back.alignment = ["fill", "bottom"];
        about.visible = false;

        ui.status = w.add("statictext", undefined, "Ready.  " + CREDIT, { truncate: "end" });
        ui.status.alignment = ["fill", "bottom"];
        pen(ui.status, DIM);

        var cur = [];

        function label(def) {
            if (avail(def)) return def.n;
            return def.n + "   - needs " + fam(def.req[0]);
        }

        function showCat(n) {
            ui.list.removeAll();
            cur = GROUPS[n][1];
            for (var p = 0; p < cur.length; p++) {
                var it = ui.list.add("item", label(cur[p]));
                if (!avail(cur[p])) { try { it.enabled = false; } catch (e) {} }
            }
            ui.desc.text = GROUPS[n][0] + ": pick a preset.";
        }

        function picked() {
            if (!ui.list.selection) return null;
            return cur[ui.list.selection.index];
        }

        function applyNow() {
            var def = picked();
            if (!def) { ui.status.text = "Pick a preset first."; releaseFocus(); return; }
            opt.sel = (ui.target.selection && ui.target.selection.index === 1);
            opt.len = ui.len.text;
            run(def);
        }

        ui.cat.onChange = function () {
            if (ui.cat.selection) showCat(ui.cat.selection.index);
            releaseFocus();
        };
        ui.list.onChange = function () {
            var def = picked();
            if (!def) return;
            ui.desc.text = avail(def) ? def.d : def.d + "  Needs " + fam(def.req[0]) + ".";
        };
        ui.list.onDoubleClick = applyNow;
        ui.apply.onClick = applyNow;
        ui.target.onChange = function () { releaseFocus(); };
        ui.len.onChange = function () { releaseFocus(); };
        ui.hlp.onClick = function () {
            about.visible = !about.visible;
            main.visible = !about.visible;
            releaseFocus();
        };
        back.onClick = function () {
            about.visible = false;
            main.visible = true;
            releaseFocus();
        };

        ui.cat.selection = 0;
        showCat(0);

        w.layout.layout(true);
        w.onResizing = w.onResize = function () { this.layout.resize(); };
        return w;
    }

    var win = build(thisObj);
    if (win instanceof Window) { win.center(); win.show(); }

})(this);
