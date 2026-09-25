# App icons

These icons are committed so `tauri build` works out of the box. To regenerate
them from a new 1024×1024 PNG:

```bash
npm run tauri icon path/to/logo.png
```

That rewrites `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
`icon.ico`, and the Windows Store `Square*Logo.png` set referenced by
`tauri.conf.json`.
