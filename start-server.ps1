# Simple static file server for local testing.
# Run:  powershell -ExecutionPolicy Bypass -File start-server.ps1
$port = 8000
$publicFolder = Join-Path $PSScriptRoot "public"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".webmanifest" = "application/manifest+json"
    ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "=============================" -ForegroundColor Green
Write-Host " SwipperPay - local server" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Write-Host ""
Write-Host "Open: http://localhost:$port" -ForegroundColor Yellow
Write-Host "Stop: Ctrl+C" -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response

        $urlPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath)
        if ($urlPath -eq "/") { $urlPath = "/index.html" }

        # Keep requests inside the public folder.
        $candidate = Join-Path $publicFolder $urlPath.TrimStart("/")
        $fullRoot  = [System.IO.Path]::GetFullPath($publicFolder)
        $fullPath  = [System.IO.Path]::GetFullPath($candidate)
        $inRoot    = $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)

        try {
            if ($inRoot -and (Test-Path $fullPath -PathType Leaf)) {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $response.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                # Never cache during development, so edits show up on refresh.
                $response.Headers.Add("Cache-Control", "no-store")

                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("200  " + $urlPath) -ForegroundColor DarkGray
            } else {
                $response.StatusCode = 404
                $response.ContentType = "text/html; charset=utf-8"
                $buffer = [System.Text.Encoding]::UTF8.GetBytes("<h1>404 Not Found</h1><p>$urlPath</p>")
                $response.ContentLength64 = $buffer.Length
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                Write-Host ("404  " + $urlPath) -ForegroundColor Yellow
            }
        } catch {
            $response.StatusCode = 500
            Write-Host "500  $urlPath : $_" -ForegroundColor Red
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    Write-Host "Server stopped" -ForegroundColor Yellow
}
