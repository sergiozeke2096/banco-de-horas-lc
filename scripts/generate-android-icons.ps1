$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "public\logo-lc.jpg"
$resRoot = Join-Path $projectRoot "android\app\src\main\res"

if (-not (Test-Path $sourcePath)) {
  throw "Logo nao encontrada em $sourcePath"
}

$sizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)

try {
  foreach ($entry in $sizes.GetEnumerator()) {
    $directory = Join-Path $resRoot $entry.Key
    $size = [int] $entry.Value

    foreach ($fileName in @("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png")) {
      $targetPath = Join-Path $directory $fileName
      $bitmap = New-Object System.Drawing.Bitmap $size, $size

      try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.Clear([System.Drawing.Color]::White)
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
        } finally {
          $graphics.Dispose()
        }

        $bitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $bitmap.Dispose()
      }
    }
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Icones Android atualizados com sucesso."
