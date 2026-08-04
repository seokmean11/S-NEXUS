$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $root "scripts\git-hooks\post-commit"
$targetDir = Join-Path $root ".git\hooks"
$target = Join-Path $targetDir "post-commit"

if (-not (Test-Path (Join-Path $root ".git"))) {
  Write-Error "Not a git repository: $root"
}

Copy-Item -Path $source -Destination $target -Force
Write-Host "Installed post-commit hook -> $target"
Write-Host "Commits on this PC will auto-push to GitHub (origin)."
