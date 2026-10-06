# 파이썬이 없을 때 쓰는 간이 웹서버 (localhost:8080, 이 폴더를 그대로 서비스)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:8080/")
$l.Start()
Write-Host "서비스 중: http://localhost:8080  (Ctrl+C 로 종료)"
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css"; ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".pptx"="application/vnd.openxmlformats-officedocument.presentationml.presentation" }
while ($l.IsListening) {
  $c = $l.GetContext(); $req = $c.Request; $res = $c.Response
  $p = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
  if ($p -eq "") { $p = "index.html" }
  $f = Join-Path $root $p
  if (Test-Path $f -PathType Container) { $f = Join-Path $f "index.html" }
  if (Test-Path $f -PathType Leaf) {
    $b = [System.IO.File]::ReadAllBytes($f)
    $ext = [System.IO.Path]::GetExtension($f).ToLower()
    $res.ContentType = if ($mime[$ext]) { $mime[$ext] } else { "application/octet-stream" }
    $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length)
  } else { $res.StatusCode = 404 }
  $res.OutputStream.Close()
}
