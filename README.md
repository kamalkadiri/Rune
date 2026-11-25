# RUNE

Static site served by GitHub Pages from the `main` branch at https://runecapital.co (custom domain set in `CNAME`).

- `index.html`: landing page: RUNE and a small CAPITAL label over a blue line engraving of a harbour town, rendered in WebGL (`assets/engraving-scene.js`). The sky's engraved lines drift, the water ripples, and the cursor sends out etched ripple rings. `assets/rune-engraving-mask.png` marks where the sky (red) and water (green) move.
- `manifesto/index.html`: the RUNE manifesto at /manifesto/ (not linked from the landing page), set over the same live scene (`assets/manifesto.js`, `assets/manifesto.css`).
- `assets/`: images, exhibits, dithered historical photographs, scripts, and self-hosted fonts (Oswald and Archivo, SIL Open Font License).

No build step: edit the HTML and push.
