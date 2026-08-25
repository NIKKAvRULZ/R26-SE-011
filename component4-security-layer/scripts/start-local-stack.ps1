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

Write-Host 'Starting Component 1 API...'
if (-not (Test-Port 5002)) { Start-HiddenNode $Component1Path 'npm.cmd start' }
Wait-Http 'http://localhost:5002/proof/latest'

Write-Host 'Starting local blockchain...'
if (-not (Test-Port 8545)) { Start-HiddenNode $Component1Path 'npx.cmd hardhat node' }
Start-Sleep -Seconds 4

Write-Host 'Deploying Component 1 ProofStorage contract...'
Push-Location $Component1Path
$codeCheck = node -e "const {ethers}=require('ethers');(async()=>{console.log((await new ethers.JsonRpcProvider('http://127.0.0.1:8545').getCode('0x5FbDB2315678afecb367f032d93F642f64180aa3')).length>2?'yes':'no')})()"
if ($codeCheck.Trim() -ne 'yes') { npx.cmd hardhat ignition deploy ignition/modules/ProofStorage.js --network localhost | Out-Host }
$latest = Invoke-RestMethod 'http://localhost:5002/proof/latest'
$root = $latest.proof.merkleRoot
$cid = $latest.proof.ipfsCID
$anchorCode = "const {ethers}=require('ethers'); const abi=require('./controllers/ProofStorage.json').abi; (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); const c=new ethers.Contract('0x5FbDB2315678afecb367f032d93F642f64180aa3',abi,await p.getSigner(0)); try { const old=await c.getProof('$root'); console.log('Already anchored',old[0]); } catch (_) { const tx=await c.storeProof('$root','$cid'); await tx.wait(); console.log('Anchored',tx.hash); }})().catch(e=>{console.error(e);process.exit(1)})"
node -e $anchorCode | Out-Host
Pop-Location

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
