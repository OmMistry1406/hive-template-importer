# Transcribes every WAV in $env:STT_DIR with Windows' offline recogniser.
# Writes "<file name><TAB><text>" per file to $env:STT_OUT.
Add-Type -AssemblyName System.Speech
$lines = New-Object System.Collections.Generic.List[string]
foreach ($file in Get-ChildItem -Path $env:STT_DIR -Filter *.wav | Sort-Object Name) {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine([Globalization.CultureInfo]"en-US")
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.SetInputToWaveFile($file.FullName)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(600)
  $words = New-Object System.Collections.Generic.List[string]
  while ($true) {
    try { $result = $engine.Recognize() } catch { break }
    if ($null -eq $result) { break }
    $words.Add($result.Text)
  }
  $engine.Dispose()
  $lines.Add("$($file.Name)`t$($words -join ' ')")
}
[IO.File]::WriteAllLines($env:STT_OUT, $lines)
