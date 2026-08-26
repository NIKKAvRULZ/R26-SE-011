$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root "backend\.env"
$keyLine = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match '^\s*CERTORAKEY\s*=' } |
    Select-Object -First 1

if (-not $keyLine) {
    throw "CERTORAKEY is not configured in backend/.env"
}

$env:CERTORAKEY = ($keyLine -replace '^\s*CERTORAKEY\s*=\s*', '').Trim()
if (-not $env:CERTORAKEY) {
    throw "CERTORAKEY is empty in backend/.env"
}

if (-not (Get-Command certoraRun -ErrorAction SilentlyContinue)) {
    throw "certoraRun was not found. Install it with: py -m pip install certora-cli"
}

$stage = Join-Path $env:TEMP ("component4-certora-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Push-Location $root
try {
    $flattened = & npx hardhat flatten contracts/GradeVerifier.sol
    if ($LASTEXITCODE -ne 0) {
        throw "Hardhat could not flatten GradeVerifier.sol"
    }

    [IO.File]::WriteAllText(
        (Join-Path $stage "GradeVerifierFlat.sol"),
        ($flattened -join [Environment]::NewLine),
        [Text.UTF8Encoding]::new($false)
    )
    Copy-Item -LiteralPath "formal-verification\specs\grade-verifier.cvl" `
        -Destination (Join-Path $stage "grade-verifier.cvl") -Force
}
finally {
    Pop-Location
}

Push-Location $stage
try {
    & certoraRun GradeVerifierFlat.sol:GradeVerifier `
        --verify GradeVerifier:grade-verifier.cvl `
        --solc solc `
        --optimistic_loop `
        --loop_iter 3 `
        --disable_local_typechecking `
        --use_relpaths_for_solc_json `
        --wait_for_results all `
        --msg "GradeVerifier ZKP Verifier - Component 4 Security Layer - IT22276346 SLIIT"
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
