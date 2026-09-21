param(
    [string]$FilePath
)

$lines = Get-Content $FilePath
$depth = 0
$inReturn = $false
$returnStartLine = 0

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1
    
    # Track return statement start
    if ($line -match '^\s*return\s*\(') {
        $inReturn = $true
        $returnStartLine = $lineNum
        $depth = 0
        continue
    }
    
    if (-not $inReturn) { continue }
    
    # Count opening divs (but not in strings or as closing tags)
    $opens = ([regex]::Matches($line, '<div[\s>]')).Count
    $closes = ([regex]::Matches($line, '</div>')).Count
    
    $depth += $opens - $closes
    
    # Report at tab boundaries and at problematic lines
    if ($line -match 'activeTab|return\s*\)|^$' -and $depth -ne 0) {
        Write-Host "$FilePath : Line $lineNum : depth=$depth : $($line.Trim())"
    }
}

Write-Host ""
Write-Host "$FilePath : FINAL depth=$depth (return started at line $returnStartLine, total lines=$($lines.Count))"
Write-Host ""
