# App icons

Icon binaries are not committed. Generate them from a single 1024×1024 PNG:

```bash
npm run tauri icon path/to/logo.png
```

This creates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, and
`icon.ico` here, which `tauri.conf.json` references. `tauri build` fails until
these exist.
