@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -Command "$n=Get-Command node.exe -ErrorAction SilentlyContinue; if($n){$runtime=$n.Source}else{$pkg=Get-AppxPackage 'OpenAI.CodexPrimaryRuntime*' | Sort-Object Version -Descending | Select-Object -First 1; if($pkg){$runtime=Join-Path $pkg.InstallLocation 'dependencies/node/bin/node.exe'}}; if(!$runtime -or !(Test-Path -LiteralPath $runtime)){Write-Host 'Install Node.js 24 LTS, then run this file again.';exit 1}; if(!(Test-Path -LiteralPath 'dist/index.html')){Write-Host 'Build required: npm ci and npm run build';exit 1}; Write-Host 'Open http://127.0.0.1:4178/ in your browser.'; & $runtime 'server/start.mjs'; exit $LASTEXITCODE"
pause
