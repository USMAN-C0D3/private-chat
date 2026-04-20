[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$NoPrompt,
    [string]$ZipOutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectName = Split-Path -Leaf $ProjectRoot

# Delete only these exact root-level folders.
$Targets = @(
    'node_modules',
    '.venv',
    'dist',
    'build',
    '.git'
)

Write-Host "Project root: $ProjectRoot"
Write-Host ""
Write-Host "Planned cleanup targets (root only):"
$Targets | ForEach-Object { Write-Host " - $_" }
Write-Host ""

$ExistingTargets = @()
foreach ($name in $Targets) {
    $path = Join-Path $ProjectRoot $name
    if (Test-Path -LiteralPath $path -PathType Container) {
        $ExistingTargets += $path
    }
}

if ($ExistingTargets.Count -eq 0) {
    Write-Host "No cleanup targets found. Nothing to delete."
} else {
    Write-Host "Folders that will be deleted:"
    $ExistingTargets | ForEach-Object { Write-Host " - $_" }

    if (-not $NoPrompt) {
        Write-Host ""
        $answer = Read-Host "Type YES to continue"
        if ($answer -ne 'YES') {
            throw "Aborted by user. No folders were deleted."
        }
    }

    foreach ($targetPath in $ExistingTargets) {
        Write-Host "Deleting: $targetPath"
        if ($PSCmdlet.ShouldProcess($targetPath, 'Delete folder')) {
            Remove-Item -LiteralPath $targetPath -Recurse -Force
        }
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($ZipOutputPath)) {
    $parent = Split-Path -Parent $ProjectRoot
    $ZipOutputPath = Join-Path $parent ("{0}-clean-{1}.zip" -f $ProjectName, $timestamp)
}

$ZipOutputPath = [System.IO.Path]::GetFullPath($ZipOutputPath)

if (Test-Path -LiteralPath $ZipOutputPath) {
    Write-Host "Removing existing zip: $ZipOutputPath"
    if ($PSCmdlet.ShouldProcess($ZipOutputPath, 'Remove existing zip')) {
        Remove-Item -LiteralPath $ZipOutputPath -Force
    }
}

Write-Host ""
Write-Host "Creating zip: $ZipOutputPath"

$entriesToZip = Get-ChildItem -LiteralPath $ProjectRoot -Force |
    Where-Object { $_.Name -ne [System.IO.Path]::GetFileName($ZipOutputPath) }

if (-not $entriesToZip) {
    throw "Project root is empty. Nothing to zip."
}

$ZipCreated = $false
if ($PSCmdlet.ShouldProcess($ZipOutputPath, 'Create zip archive')) {
    Compress-Archive -Path $entriesToZip.FullName -DestinationPath $ZipOutputPath -CompressionLevel Optimal
    $ZipCreated = $true
}
Write-Host ""
Write-Host "Cleanup complete."
if ($ZipCreated) {
    Write-Host "Zip created at: $ZipOutputPath"
} else {
    Write-Host "Zip creation was skipped (for example, due to -WhatIf)."
}
