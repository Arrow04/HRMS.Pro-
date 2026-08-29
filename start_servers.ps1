Set-Location -LiteralPath "D:\hrmsnew\hrms_backend"
$j1 = Start-Job -Name "hrms_backend" -ScriptBlock {
  Set-Location -LiteralPath "D:\hrmsnew\hrms_backend"
  python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
}

Set-Location -LiteralPath "D:\hrmsnew\hrms_react_web"
$j2 = Start-Job -Name "hrms_frontend" -ScriptBlock {
  Set-Location -LiteralPath "D:\hrmsnew\hrms_react_web"
  npx vite --host 0.0.0.0 --port 5173
}

Write-Output "Backend PID: $($j1.Id)"
Write-Output "Frontend PID: $($j2.Id)"
Write-Output "Backend job state: $($j1.State)"
Write-Output "Frontend job state: $($j2.State)"
