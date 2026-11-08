# For each WAV in $env:STT_DIR, lists which script phrases ($env:PHRASES, one per line) were heard.
# Output: "<file><TAB><phrase index>:<confidence>,..." per file, to $env:STT_OUT.
Add-Type -AssemblyName System.Speech
$phrases = [IO.File]::ReadAllLines($env:PHRASES)
$choices = New-Object System.Speech.Recognition.Choices
foreach ($p in $phrases) { $choices.Add($p) }
$builder = New-Object System.Speech.Recognition.GrammarBuilder
$builder.Culture = [Globalization.CultureInfo]"en-US"
$builder.Append($choices)
$grammar = New-Object System.Speech.Recognition.Grammar($builder)
$out = New-Object System.Collections.Generic.List[string]
foreach ($file in Get-ChildItem -Path $env:STT_DIR -Filter *.wav | Sort-Object Name) {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine([Globalization.CultureInfo]"en-US")
  $engine.LoadGrammar($grammar)
  $engine.SetInputToWaveFile($file.FullName)
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(0)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(300)
  $hits = New-Object System.Collections.Generic.List[string]
  while ($true) {
    try { $r = $engine.Recognize() } catch { break }
    if ($null -eq $r) { break }
    $hits.Add(("{0}:{1:F2}" -f [Array]::IndexOf($phrases, $r.Text), $r.Confidence))
  }
  $engine.Dispose()
  $grammar = New-Object System.Speech.Recognition.Grammar($builder)
  $out.Add("$($file.Name)`t$($hits -join ',')")
}
[IO.File]::WriteAllLines($env:STT_OUT, $out)
