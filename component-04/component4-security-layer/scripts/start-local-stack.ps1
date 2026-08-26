param()

$ErrorActionPreference = 'Stop'

$Component4Path = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendPath = Join-Path $Component4Path 'backend'
$FrontendPath = Join-Path $Component4Path 'frontend'
$BackendEnvPath = Join-Path $BackendPath '.env'


# =========================================================
# ENVIRONMENT HELPERS
# =========================================================

function Get-EnvValue(
    [string]$Name,
    [string]$DefaultValue
) {

    $processValue =
        [Environment]::GetEnvironmentVariable($Name)

    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue
    }

    if (Test-Path $BackendEnvPath) {

        $line =
            Get-Content $BackendEnvPath |
            Where-Object {
                $_ -match "^$([regex]::Escape($Name))="
            } |
            Select-Object -Last 1

        if ($line) {
            return ($line -split '=', 2)[1].Trim()
        }
    }

    return $DefaultValue
}


$AcademicBaseUrl =
    (Get-EnvValue `
        'ACADEMIC_DATA_BASE_URL' `
        'http://localhost:5002/proof').TrimEnd('/')

$RpcUrl =
    Get-EnvValue `
        'RPC_URL' `
        'http://127.0.0.1:8545'

$AcademicUri =
    [Uri]$AcademicBaseUrl

$RpcUri =
    [Uri]$RpcUrl


# =========================================================
# HTTP WAIT
# =========================================================

function Wait-Http(
    [string]$Url,
    [int]$Attempts = 30
) {

    for ($i = 0; $i -lt $Attempts; $i++) {

        try {

            Invoke-WebRequest `
                -UseBasicParsing `
                -Uri $Url `
                -TimeoutSec 2 |
                Out-Null

            return
        }
        catch {

            Start-Sleep -Seconds 1
        }
    }

    throw "Timed out waiting for $Url"
}


# =========================================================
# HIDDEN NODE PROCESS
# =========================================================

function Start-HiddenNode(
    [string]$Path,
    [string]$Command
) {

    Start-Process `
        -WindowStyle Hidden `
        -FilePath 'powershell.exe' `
        -WorkingDirectory $Path `
        -ArgumentList @(
            '-NoProfile',
            '-Command',
            $Command
        ) |
        Out-Null
}


# =========================================================
# PORT CHECK
# =========================================================

function Test-Port(
    [int]$Port
) {

    try {

        return (
            Test-NetConnection `
                -ComputerName '127.0.0.1' `
                -Port $Port `
                -InformationLevel Quiet
        )
    }
    catch {

        return $false
    }
}


# =========================================================
# RPC CHECK
# =========================================================

function Test-Rpc(
    [string]$Url
) {

    try {

        $body = @{
            jsonrpc = "2.0"
            id      = 1
            method  = "eth_chainId"
            params  = @()
        } | ConvertTo-Json

        $response =
            Invoke-RestMethod `
                -Method POST `
                -Uri $Url `
                -ContentType "application/json" `
                -Body $body `
                -TimeoutSec 5

        return (
            $null -ne $response.result
        )
    }
    catch {

        return $false
    }
}


# =========================================================
# STARTUP HEADER
# =========================================================

Write-Host ''
Write-Host '========================================'
Write-Host ' COMPONENT 4 INTEGRATION STARTUP'
Write-Host '========================================'
Write-Host ''

Write-Host "Academic API : $AcademicBaseUrl"
Write-Host "Blockchain RPC : $RpcUrl"
Write-Host ''


# =========================================================
# COMPONENT 1 API
# =========================================================

Write-Host 'Checking Component 1 academic proof API...'

$AcademicLatestUrl =
    "$AcademicBaseUrl/latest"

Wait-Http $AcademicLatestUrl

Write-Host 'Component 1 API is available.'
Write-Host ''


# =========================================================
# EXISTING BLOCKCHAIN
# =========================================================

Write-Host 'Checking blockchain RPC...'

if (-not (Test-Rpc $RpcUrl)) {

    throw `
        "Blockchain RPC is unavailable at $RpcUrl. " +
        "Start the required blockchain node before starting Component 4."
}

Write-Host 'Blockchain RPC is available.'
Write-Host ''


# =========================================================
# LATEST COMPONENT 1 PROOF
# =========================================================

Write-Host 'Reading latest Component 1 proof...'

try {

    $latest =
        Invoke-RestMethod `
            -Uri $AcademicLatestUrl `
            -TimeoutSec 10

    if (-not $latest.success) {

        throw `
            'Component 1 returned an unsuccessful latest-proof response.'
    }

    $root =
        $latest.proof.merkleRoot

    $cid =
        $latest.proof.ipfsCID

    Write-Host "Current Merkle Root : $root"
    Write-Host "Current IPFS CID    : $cid"
    Write-Host ''

}
catch {

    throw `
        "Unable to read the latest Component 1 proof: $($_.Exception.Message)"
}


# =========================================================
# COMPONENT 4 GRADE VERIFIER
# =========================================================

Write-Host 'Deploying Component 4 GradeVerifier contract...'

Push-Location $Component4Path

try {

    npx.cmd hardhat run `
        scripts/deploy-verifier.js `
        --network localhost |
        Out-Host

}
finally {

    Pop-Location
}

Write-Host 'Component 4 GradeVerifier deployment complete.'
Write-Host ''


# =========================================================
# COMPONENT 4 BACKEND
# =========================================================

Write-Host 'Starting Component 4 backend...'

if (-not (Test-Port 3001)) {

    Start-HiddenNode `
        $BackendPath `
        'npm.cmd start'
}

Wait-Http 'http://localhost:3001/api/health'

Write-Host 'Component 4 backend is available on port 3001.'
Write-Host ''


# =========================================================
# COMPONENT 4 FRONTEND
# =========================================================

Write-Host 'Starting Component 4 frontend...'

if (-not (Test-Port 5174)) {

    Start-HiddenNode `
        $FrontendPath `
        'npm.cmd run dev'
}

Write-Host ''
Write-Host '========================================'
Write-Host ' COMPONENT 4 READY'
Write-Host '========================================'
Write-Host ''

Write-Host "Component 1 API : $AcademicBaseUrl"
Write-Host 'Component 4 API : http://localhost:3001'
Write-Host 'Component 4 UI  : http://localhost:5174'

Write-Host ''
Write-Host 'Using the configured Component 1 API and blockchain RPC.'
Write-Host ''

try {

    Start-Process `
        'http://localhost:5174'

}
catch {

    Write-Host `
        'Open http://localhost:5174 in your browser.'
}