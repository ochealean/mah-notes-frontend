// Apply the saved theme + accent before first paint (no flash).
//
// A separate file rather than an inline <script> on purpose: inline scripts
// force the Content Security Policy to allow either 'unsafe-inline' or a hash
// that silently breaks the moment this code is edited. Loaded from <head>
// WITHOUT defer or async, so it still runs before the first paint.
(function () {
    var dark = false;
    try {
        // There is no light/dark/system preference any more — the colour theme
        // decides. A dark PAPER colour means a dark ground. This mirrors
        // isDarkColor() in src/lib/palette.ts; keep the two in step.
        var t = JSON.parse(localStorage.getItem('mahnotes_theme_v2') || 'null');
        var paper = (t && t.paper) || '#f3f2f2';
        var m = /^#?([0-9a-f]{6})$/i.exec(String(paper).trim());
        if (m) {
            var n = parseInt(m[1], 16);
            // Relative luminance, byte-for-byte the same maths as luminance()
            // and isDarkColor() in palette.ts. An approximation here would
            // disagree on mid-tones and show the wrong ground for one frame.
            var ch = function (v) {
                var x = v / 255;
                return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
            };
            var lum = 0.2126 * ch((n >> 16) & 255)
                    + 0.7152 * ch((n >> 8) & 255)
                    + 0.0722 * ch(n & 255);
            dark = lum < 0.4;
        }
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch (e) {}
    try {
        // The theme is three colours, but the app derives ~30 variables from
        // them (src/lib/palette.ts). Rather than duplicate that maths here,
        // the app caches the computed map and this just replays it, so the
        // custom colours are on screen before React boots.
        var cached = JSON.parse(localStorage.getItem('mahnotes_theme_vars') || 'null');
        var vars = cached && (dark ? cached.dark : cached.light);
        if (vars) {
            var el = document.documentElement;
            for (var k in vars) el.style.setProperty(k, vars[k]);
        }
        var t = JSON.parse(localStorage.getItem('mahnotes_theme_v2') || 'null');
        if (t && t.ambient === false) document.documentElement.dataset.motion = 'off';
    } catch (e) {}
})();
