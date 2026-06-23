$conns = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    $procId = $c.OwningProcess
    Write-Host "Killing PID: $procId"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}
Write-Host "Done"
