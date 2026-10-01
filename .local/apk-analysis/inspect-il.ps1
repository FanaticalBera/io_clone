param(
 [string]$ApkPath='C:\Users\Home Bsw\Downloads\Telegram Desktop\Six.io 1.1.8.apk',
 [string[]]$Types=@('Game','Player','Consts'),
 [string[]]$Methods=@('.ctor','Update','Move','OnPointerMoved','CheckSwipe','StartCamera','ParkCamera','Zoom','GetPosition','SetControls','Start')
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[System.IO.Compression.ZipFile]::OpenRead($ApkPath)
$memory=[System.IO.MemoryStream]::new()
try {
 $stream=$archive.GetEntry('assets/bin/Data/Managed/Assembly-CSharp.dll').Open()
 try {$stream.CopyTo($memory)} finally {$stream.Dispose()}
} finally {$archive.Dispose()}
$memory.Position=0
$pe=[System.Reflection.PortableExecutable.PEReader]::new($memory)
$script:md=[System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
function TypeName($h) {
 if($h -is [System.Reflection.Metadata.TypeDefinitionHandle]){$h=[System.Reflection.Metadata.EntityHandle]$h}
 if($h -is [System.Reflection.Metadata.TypeReferenceHandle]){$h=[System.Reflection.Metadata.EntityHandle]$h}
 switch ($h.Kind.ToString()) {
  'TypeDefinition' {$t=$script:md.GetTypeDefinition([System.Reflection.Metadata.TypeDefinitionHandle]$h)}
  'TypeReference' {$t=$script:md.GetTypeReference([System.Reflection.Metadata.TypeReferenceHandle]$h)}
  default {return $h.Kind.ToString()}
 }
 $ns=$script:md.GetString($t.Namespace);$n=$script:md.GetString($t.Name)
 if($ns){return $ns+'.'+$n};return $n
}
function ResolveToken([int]$token) {
 $row=$token -band 0xffffff
 switch (($token -shr 24) -band 0xff) {
  0x01 {return TypeName ([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeReferenceHandle($row))}
  0x02 {return TypeName ([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeDefinitionHandle($row))}
  0x04 {$f=$script:md.GetFieldDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::FieldDefinitionHandle($row));return (TypeName $f.GetDeclaringType())+'::'+$script:md.GetString($f.Name)}
  0x06 {$m=$script:md.GetMethodDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::MethodDefinitionHandle($row));return (TypeName $m.GetDeclaringType())+'::'+$script:md.GetString($m.Name)}
  0x0a {$m=$script:md.GetMemberReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::MemberReferenceHandle($row));return (TypeName $m.Parent)+'::'+$script:md.GetString($m.Name)}
  0x70 {return '"'+$script:md.GetUserString([System.Reflection.Metadata.Ecma335.MetadataTokens]::UserStringHandle($row))+'"'}
  default {return 'token:0x'+$token.ToString('X8')}
 }
}
$opcodes=@{}
foreach($f in [System.Reflection.Emit.OpCodes].GetFields([System.Reflection.BindingFlags]'Public,Static')) {
 $op=$f.GetValue($null);$opcodes[([int]$op.Value -band 0xffff)]=$op
}
try {
 foreach($h in $script:md.TypeDefinitions) {
  $type=$script:md.GetTypeDefinition($h);$name=TypeName $h
  if($name -notin $Types){continue}
  foreach($fh in $type.GetFields()) {
   $field=$script:md.GetFieldDefinition($fh);$constant=$field.GetDefaultValue()
   if(!$constant.IsNil) {
    $value=$script:md.GetConstant($constant);$blob=$script:md.GetBlobBytes($value.Value)
    $formatted=switch($value.TypeCode.ToString()) {'Single' {[BitConverter]::ToSingle($blob,0)} 'Double' {[BitConverter]::ToDouble($blob,0)} 'Int32' {[BitConverter]::ToInt32($blob,0)} default {[BitConverter]::ToString($blob)}}
    'CONST '+$name+'::'+$script:md.GetString($field.Name)+' = '+$formatted
   }
  }
  foreach($mh in $type.GetMethods()) {
   $method=$script:md.GetMethodDefinition($mh);$methodName=$script:md.GetString($method.Name)
   if($methodName -notin $Methods -or !$method.RelativeVirtualAddress){continue}
   'METHOD '+$name+'::'+$methodName
   $body=[System.Reflection.Metadata.PEReaderExtensions]::GetMethodBody($pe,$method.RelativeVirtualAddress)
   $il=$body.GetILBytes();$i=0
   while($i -lt $il.Length) {
    $offset=$i;$code=[int]$il[$i++];if($code -eq 254){$code=0xfe00 -bor [int]$il[$i++]}
    $op=$opcodes[$code];if(!$op){throw "Unknown opcode $code"};$operand=''
    switch($op.OperandType.ToString()) {
     'InlineNone' {}
     'ShortInlineI' {$operand=[int]$il[$i++];if($operand -ge 128){$operand-=256}}
     'ShortInlineVar' {$operand=[int]$il[$i++]}
     'InlineVar' {$operand=[BitConverter]::ToUInt16($il,$i);$i+=2}
     'InlineI' {$operand=[BitConverter]::ToInt32($il,$i);$i+=4}
     'InlineI8' {$operand=[BitConverter]::ToInt64($il,$i);$i+=8}
     'ShortInlineR' {$operand=[BitConverter]::ToSingle($il,$i);$i+=4}
     'InlineR' {$operand=[BitConverter]::ToDouble($il,$i);$i+=8}
     'ShortInlineBrTarget' {$d=[int]$il[$i++];if($d -ge 128){$d-=256};$operand='IL_'+($i+$d).ToString('X4')}
     'InlineBrTarget' {$d=[BitConverter]::ToInt32($il,$i);$i+=4;$operand='IL_'+($i+$d).ToString('X4')}
     'InlineSwitch' {$count=[BitConverter]::ToInt32($il,$i);$i+=4;$end=$i+$count*4;$targets=@();for($j=0;$j -lt $count;$j++){$targets+='IL_'+($end+[BitConverter]::ToInt32($il,$i)).ToString('X4');$i+=4};$operand=$targets -join ','}
     default {$token=[BitConverter]::ToInt32($il,$i);$i+=4;$operand=ResolveToken $token}
    }
    ' IL_'+$offset.ToString('X4')+' '+$op.Name+' '+$operand
   }
  }
 }
} finally {$pe.Dispose();$memory.Dispose()}
