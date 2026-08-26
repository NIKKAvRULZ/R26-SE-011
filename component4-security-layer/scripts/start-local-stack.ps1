param(
  [string]$Component1Path = $env:COMPONENT1_PATH
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Component1Path)) {
  $Component1Path = 'C:\Users\User\Desktop\R26-SE-011\component-1-blockchain'
}
$Component4Path = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendPath = Join-Path $Component4Path 'backend'
$FrontendPath = Join-Path $Component4Path 'frontend'
$BackendEnvPath = Join-Path $BackendPath '.env'

function Get-EnvValue([string]$Name, [string]$DefaultValue) {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
  if (Test-Path $BackendEnvPath) {
    $line = Get-Content $BackendEnvPath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -Last 1
    if ($line) { return ($line -split '=', 2)[1].Trim() }
  }
  return $DefaultValue
}

$AcademicBaseUrl = (Get-EnvValue 'ACADEMIC_DATA_BASE_URL' 'http://localhost:5002/proof').TrimEnd('/')
$RpcUrl = Get-EnvValue 'RPC_URL' 'http://127.0.0.1:8545'
$AcademicUri = [Uri]$AcademicBaseUrl
$RpcUri = [Uri]$RpcUrl

function Wait-Http([string]$Url, [int]$Attempts = 30) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    try { Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 | Out-Null; return }
    catch { Start-Sleep -Seconds 1 }
  }
  throw "Timed out waiting for $Url"
}

function Start-HiddenNode([string]$Path, [string]$Command) {
  Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -WorkingDirectory $Path -ArgumentList @('-NoProfile','-Command',$Command) | Out-Null
}

function Test-Port([int]$Port) {
  try { return (Test-NetConnection -ComputerName '127.0.0.1' -Port $Port -InformationLevel Quiet) } catch { return $false }
}

Write-Host "Connecting to Component 1 API at $AcademicBaseUrl..."
$academicIsLocal = $AcademicUri.Host -in @('localhost', '127.0.0.1', '::1')
if ($academicIsLocal -and -not (Test-Port $AcademicUri.Port)) { Start-HiddenNode $Component1Path 'npm.cmd start' }

Write-Host "Connecting to shared blockchain RPC at $RpcUrl..."
$rpcIsLocal = $RpcUri.Host -in @('localhost', '127.0.0.1', '::1')
if ($rpcIsLocal -and -not (Test-Port $RpcUri.Port)) { Start-HiddenNode $Component1Path 'npx.cmd hardhat node' }
Start-Sleep -Seconds 4

Wait-Http "$AcademicBaseUrl/latest"
$latest = Invoke-RestMethod "$AcademicBaseUrl/latest"
$root = $latest.proof.merkleRoot
$cid = $latest.proof.ipfsCID
if (-not $latest.success -or [string]::IsNullOrWhiteSpace($root) -or [string]::IsNullOrWhiteSpace($cid)) {
  throw 'Component 1 did not return a valid finalized live anchor.'
}
Write-Host "Using Component 1 live anchor: $root"
Write-Host "Using Component 1 live IPFS CID: $cid"
Write-Host 'Component 1 owns finalization and anchoring; Component 4 will only verify this evidence.'

Write-Host 'Deploying Component 4 GradeVerifier contract...'
Push-Location $Component4Path
npx.cmd hardhat run scripts/deploy-verifier.js --network localhost | Out-Host
Pop-Location

Write-Host 'Starting Component 4 backend and frontend...'
if (-not (Test-Port 3001)) { Start-HiddenNode $BackendPath 'npm.cmd start' }
Wait-Http 'http://localhost:3001/api/health'
if (-not (Test-Port 5174)) { Start-HiddenNode $FrontendPath 'npm.cmd run dev -- --host localhost' }
Write-Host 'Verification Portal: http://localhost:5174'
Write-Host 'Component 4 API: http://localhost:3001'
try { Start-Process 'http://localhost:5174' } catch { Write-Host 'Open http://localhost:5174 in your browser.' }
