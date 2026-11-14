# Restores a checksum-verified snapshot to a fresh LocalDB database and compares operational records.
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^PharmacyERP_Audit_[a-f0-9]{32}$')]
    [string]$Database
)

$ErrorActionPreference = 'Stop'
$server = '(localdb)\PharmacyERPDevelopment'
$restored = $Database + '_Restored'
$directory = Join-Path $PSScriptRoot ('restore-' + $Database)
$null = New-Item -ItemType Directory -Path $directory

function Invoke-LocalSql([string]$Query) {
    $output = sqlcmd -S $server -E -C -b -h -1 -W -w 1024 -l 10 -t 60 -Q "SET NOCOUNT ON; $Query"
    if ($LASTEXITCODE -ne 0) { throw "LocalDB query failed with exit code $LASTEXITCODE." }
    return $output
}

function Read-Snapshot([string]$Name) {
    $value = Invoke-LocalSql @"
USE [$Name];
SELECT CONVERT(varchar(512), CONCAT(
    (SELECT COUNT_BIG(*) FROM dbo.Sales), '|',
    (SELECT COUNT_BIG(*) FROM dbo.Batches), '|',
    CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM dbo.Sales ORDER BY Id FOR JSON PATH, INCLUDE_NULL_VALUES)), 2), '|',
    CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM dbo.SaleItems ORDER BY Id FOR JSON PATH, INCLUDE_NULL_VALUES)), 2), '|',
    CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM dbo.Batches ORDER BY Id FOR JSON PATH, INCLUDE_NULL_VALUES)), 2), '|',
    CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM dbo.InventoryTransactions ORDER BY Id FOR JSON PATH, INCLUDE_NULL_VALUES)), 2)
));
"@
    $signature = @($value | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+\|\d+\|' })
    if ($signature.Count -ne 1) { throw 'Expected exactly one snapshot signature.' }
    return $signature[0]
}

$backup = (Join-Path $directory 'snapshot.bak').Replace("'", "''")
$data = (Join-Path $directory 'restored.mdf').Replace("'", "''")
$log = (Join-Path $directory 'restored.ldf').Replace("'", "''")

try {
    $before = Read-Snapshot $Database
    if ($before -notmatch '^[1-9][0-9]*\|[1-9][0-9]*\|(?:[A-F0-9]{64}\|){3}[A-F0-9]{64}$') {
        throw "Backup snapshot validation failed (signature length $($before.Length))."
    }
    $backupTime = [Diagnostics.Stopwatch]::StartNew()
    Invoke-LocalSql "BACKUP DATABASE [$Database] TO DISK=N'$backup' WITH COPY_ONLY, CHECKSUM;" | Out-Null
    $backupTime.Stop()
    $recoveryTime = [Diagnostics.Stopwatch]::StartNew()
    Invoke-LocalSql "RESTORE VERIFYONLY FROM DISK=N'$backup' WITH CHECKSUM;" | Out-Null
    $files = @(Invoke-LocalSql "SELECT name FROM sys.master_files WHERE database_id=DB_ID(N'$Database') ORDER BY file_id;" |
        ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($files.Count -ne 2 -or @($files | Where-Object { $_ -notmatch '^[A-Za-z0-9_]+$' }).Count) {
        throw 'Expected one data file and one log for the disposable database.'
    }
    Invoke-LocalSql "RESTORE DATABASE [$restored] FROM DISK=N'$backup' WITH CHECKSUM, MOVE N'$($files[0])' TO N'$data', MOVE N'$($files[1])' TO N'$log';" | Out-Null
    $after = Read-Snapshot $restored
    $recoveryTime.Stop()
    if ($before -cne $after) { throw 'Restored sales, lines, batches or inventory movements differ from the source.' }
    $counts = $before.Split('|')
    Write-Output ("Backup drill passed: {0} sales, {1} batches. Backup {2} ms, verified recovery {3} ms. Zero snapshot differences." -f
        $counts[0], $counts[1], $backupTime.ElapsedMilliseconds, $recoveryTime.ElapsedMilliseconds)
} finally {
    Invoke-LocalSql "IF DB_ID(N'$restored') IS NOT NULL DROP DATABASE [$restored];" | Out-Null
    foreach ($name in @('snapshot.bak', 'restored.mdf', 'restored.ldf')) {
        $file = Join-Path $directory $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $directory
}
