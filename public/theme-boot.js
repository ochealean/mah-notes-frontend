// Apply the saved theme + accent before first paint (no flash).
//
// A separate file rather than an inline <script> on purpose: inline scripts
// force the Content Security Policy to allow either 'unsafe-inline' or a hash
// that silently breaks the moment this code is edited. Loaded from <head>
// WITHOUT defer or async, so it still runs before the first paint.
(function () {
    var dark = false;
    try {
        var p = localStorage.getItem('mahnotes_theme') || 'system';
        dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
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
