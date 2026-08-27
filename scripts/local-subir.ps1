# ============================================================================
#  Sobe a stack SEM Docker, usando os binarios portateis de .local
#  (JDK 11, Maven, PostgreSQL, WildFly). Util em maquina sem WSL/Hyper-V.
#
#    .\scripts\local-subir.ps1            # deploy do WAR + start
#    .\scripts\local-subir.ps1 -Build     # compila antes (roda os testes)
#    .\scripts\local-subir.ps1 -Parar     # so derruba o WildFly
#
#  O caminho oficial continua sendo `docker compose up -d --build`.
# ============================================================================
param(
    [switch]$Build,
    [switch]$Parar
)

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$local = Join-Path $raiz '.local'
$jdk   = Join-Path $local 'jdk\jdk11'
$mvn   = Join-Path $local 'maven\apache-maven-3.9.9\bin\mvn.cmd'
$wf    = Join-Path $local 'wildfly\wildfly-26.1.3.Final'
$war   = Join-Path $raiz 'backend\target\fandangos.war'

function Parar-WildFly {
    Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    # o Windows demora a soltar o handle do WAR; sem esta espera o build
    # seguinte falha com "cannot rename" no maven-war-plugin
    Start-Sleep -Seconds 8
}

if ($Parar) {
    Parar-WildFly
    Write-Host 'WildFly parado.'
    return
}

# O servidor precisa cair ANTES do build: ele segura o WAR.
Parar-WildFly

if ($Build) {
    Write-Host '== build =='
    $env:JAVA_HOME = $jdk
    Push-Location (Join-Path $raiz 'backend')
    & $mvn -B "-Dmaven.repo.local=$local\m2" package
    $rc = $LASTEXITCODE
    Pop-Location
    if ($rc -ne 0) { throw "build falhou (exit $rc)" }
}

if (-not (Test-Path $war)) { throw "WAR nao encontrado em $war - rode com -Build" }

Write-Host '== deploy =='
Get-ChildItem "$wf\standalone\deployments\" -ErrorAction SilentlyContinue |
    Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
Copy-Item $war "$wf\standalone\deployments\" -Force

Write-Host '== start =='
$env:JAVA_HOME  = $jdk
$env:JBOSS_HOME = $wf
$env:DB_URL   = 'jdbc:postgresql://127.0.0.1:5432/fandangos'
$env:DB_USER  = 'fandangos'
$env:DB_PASS  = 'fandangos'
$env:JWT_SECRET  = 'troque-este-segredo-em-producao-com-32-bytes-ou-mais'
$env:JWT_TTL_MIN = '120'
$env:REDIS_ENABLED  = 'false'   # sem Redis nesta maquina: cai no modo degradado
$env:LOOKUP_EXTERNO = 'true'
$env:JAVA_OPTS = '-Xms512m -Xmx1024m -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -Djava.net.preferIPv4Stack=true'

Start-Process -FilePath "$wf\bin\standalone.bat" -ArgumentList '-b', '0.0.0.0' `
    -RedirectStandardOutput (Join-Path $local 'wildfly.log') `
    -RedirectStandardError  (Join-Path $local 'wildfly.err') `
    -WindowStyle Hidden

# espera ativa pelo health em vez de dormir um tempo fixo
$deadline = (Get-Date).AddSeconds(120)
$subiu = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/health' -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $subiu = $true; break }
    } catch { }
}

if ($subiu) {
    Write-Host 'PRONTO: http://127.0.0.1:8080/api/health'
    (Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/health' -UseBasicParsing).Content
} else {
    Write-Host 'FALHOU: o servidor nao respondeu em 120s. Ultimas linhas do log:'
    Get-Content (Join-Path $local 'wildfly.log') -Tail 15
    exit 1
}
