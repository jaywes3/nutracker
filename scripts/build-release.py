from pathlib import Path
import base64, glob, subprocess, zipfile
root=Path(__file__).resolve().parent.parent
subprocess.run(['npm','run','build'],cwd=root,check=True)
assets=sorted(glob.glob(str(root/'docs/assets/*.js')))
if len(assets)!=1: raise RuntimeError('Expected one JS entry')
subprocess.run([str(root/'node_modules/.bin/esbuild'),assets[0],'--bundle','--minify','--format=iife','--target=es2020','--outfile=/tmp/openphase-release-bundle.js'],cwd=root,check=True)
css='\n'.join(Path(f).read_text(encoding='utf-8') for f in glob.glob(str(root/'docs/assets/*.css')))
js=Path('/tmp/openphase-release-bundle.js').read_text(encoding='utf-8').replace('</script','<\\/script').replace('</SCRIPT','<\\/SCRIPT')
icon='data:image/svg+xml;base64,'+base64.b64encode((root/'public/icon.svg').read_bytes()).decode()
html=f'''<!doctype html><html lang="en" class="dark"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" /><link rel="icon" href="{icon}" /><title>OpenPhase — Local-First Adaptive TDEE & Macro Coach</title><style>{css}</style></head><body class="bg-slate-950 text-slate-100 antialiased"><div id="root"></div><script>{js}</script></body></html>'''
(root/'OpenPhase-Standalone.html').write_text(html,encoding='utf-8')
items=['README.md','ARENA-SETUP.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','.github','public','src','docs','relay','scripts']
with zipfile.ZipFile(root/'OpenPhase-GitHub-Pages.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for item in items:
  p=root/item
  if p.is_file(): z.write(p,p.relative_to(root))
  elif p.is_dir():
   for f in sorted(p.rglob('*')):
    if f.is_file(): z.write(f,f.relative_to(root))
 print(f'Packaged {len(z.namelist())} files including Arena setup and relay.')
