This package contains the files needed to rebuild `proposal-final-alpha.pdf`.

Files:
- `proposal-final-alpha.tex`
- `proposal-final-alpha.pdf`
- Referenced image assets in the same directory

Build command:
  latexmk -lualatex -interaction=nonstopmode -halt-on-error proposal-final-alpha.tex

If LuaTeX cache permissions are restricted in your environment, use:
  env TEXMFVAR=/tmp/texmf-var latexmk -lualatex -interaction=nonstopmode -halt-on-error proposal-final-alpha.tex
