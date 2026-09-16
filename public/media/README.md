# Media assets

The qualitative showcase in the root `index.html` embeds `qualitative_3d/index.html`.
The viewer uses the six-case manifest, the GLB results under `qualitative_3d/models/`,
and the Case 01 ground-truth OBJ parts under `qualitative_3d/case01_parts/`.

The embedded viewer supports model and case switching, orbit/zoom/pan controls,
camera presets, component selection, and exploded-assembly inspection.

The viewer also supports opening the homepage directly with `file://`.
`viewer-runtime.js` is the bundled Three.js runtime; `viewer-source.js` contains
the viewer source and manifest. In file mode, `local_payloads/` supplies each
selected model through a classic script because browsers block local fetches.
HTTP mode continues to read the original OBJ/GLB files.
After changing `app.js`, `app_runtime.js`, the manifest, or assets, regenerate
these files with `node scripts/build-qualitative-viewer.cjs <path-to-esbuild>`.
