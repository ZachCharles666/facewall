$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $PSScriptRoot
$port = 3107
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdout = Join-Path $workspace "outputs\ib07-security-next-$stamp.out.log"
$stderr = Join-Path $workspace "outputs\ib07-security-next-$stamp.err.log"
$launcher = $null

try {
  $env:INTERNAL_BETA_AUTH_ENABLED = "true"
  $env:INTERNAL_BETA_REQUIRE_CONSENT = "true"
  $env:INTERNAL_BETA_PERSISTENCE_MODE = "source"

  if (netstat -ano -p TCP | Select-String ":$port\s+.*LISTENING") {
    throw "SECURITY_SMOKE_PORT_IN_USE"
  }

  $launcher = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @("node_modules\next\dist\bin\next", "start", "-p", "$port") `
    -WorkingDirectory $workspace `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (
      (Test-Path $stdout) -and
      (Select-String -Path $stdout -Pattern "Ready in" -Quiet)
    ) {
      $ready = $true
      break
    }
    if ($launcher.HasExited) {
      throw "SECURITY_SMOKE_NEXT_EXITED"
    }
  }
  if (-not $ready) {
    throw "SECURITY_SMOKE_NEXT_TIMEOUT"
  }

  & npm.cmd run smoke:security -- "http://127.0.0.1:$port"
  if ($LASTEXITCODE -ne 0) {
    throw "SECURITY_SMOKE_FAILED"
  }
} finally {
  if ($launcher -and -not $launcher.HasExited) {
    Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
  }
}
