$ErrorActionPreference='Stop'
$taskUrl='http://192.168.137.1:3003'
$taskHeaders=@{Origin=$taskUrl}
$taskOpening=(Invoke-WebRequest "$taskUrl/socket.io/?EIO=4&transport=polling" -Headers $taskHeaders -TimeoutSec 8).Content
$taskSid=($taskOpening.Substring(1)|ConvertFrom-Json).sid
$taskEndpoint="$taskUrl/socket.io/?EIO=4&transport=polling&sid=$taskSid"
function Send-TaskPacket([string]$packet){
 $null=Invoke-WebRequest $taskEndpoint -Method Post -Headers $taskHeaders -ContentType 'text/plain;charset=UTF-8' -Body $packet -TimeoutSec 8
}
function Read-TaskPackets {
 $body=(Invoke-WebRequest $taskEndpoint -Headers $taskHeaders -TimeoutSec 8).Content
 foreach($packet in $body.Split([char]30)){
  if($packet -eq '2'){Send-TaskPacket '3'}else{$packet}
 }
}
$taskJoined=$false
try{
 Send-TaskPacket ('40'+(@{protocolVersion=3}|ConvertTo-Json -Compress))
 $taskReady=$false
 foreach($packet in (Read-TaskPackets)){if($packet.StartsWith('42')){$event=$packet.Substring(2)|ConvertFrom-Json;if($event[0] -eq 'session:ready'){$taskReady=$event[1].protocolVersion -eq 3}}}
 if(!$taskReady){throw 'No protocol 3 session'}
 Send-TaskPacket ('420'+(@('room:create',@{requestId=[guid]::NewGuid().ToString('N');nickname='turn-check';gameMode='classic'})|ConvertTo-Json -Depth 4 -Compress))
 $taskJoined=$true
 $taskCreated=$false
 foreach($packet in (Read-TaskPackets)){if($packet.StartsWith('430')){$taskCreated=($packet.Substring(3)|ConvertFrom-Json)[0].ok}}
 if(!$taskCreated){throw 'Room create was not acknowledged'}
 Send-TaskPacket ('421'+(@('room:start',@{requestId=[guid]::NewGuid().ToString('N')})|ConvertTo-Json -Depth 4 -Compress))
 $taskSnapshot=$null
 for($i=0;$i -lt 15 -and !$taskSnapshot;$i++){
  foreach($packet in (Read-TaskPackets)){
   if($packet.StartsWith('42')){$event=$packet.Substring(2)|ConvertFrom-Json;if($event[0] -in @('match:init','match:snapshot')){$taskSnapshot=$event[1]}}
  }
 }
 if(!$taskSnapshot){throw 'No snapshot'}
 $taskSelf=$taskSnapshot.participants|Where-Object participantId -eq $taskSnapshot.selfParticipantId
 $taskTarget=@{x=-$taskSelf.direction.y;y=$taskSelf.direction.x}
 $taskDirection=@{matchId=$taskSnapshot.matchId;lifeId=$taskSelf.lifeId;seq=1;dx=$taskTarget.x;dy=$taskTarget.y}
 Send-TaskPacket ('42'+(@('input:direction',$taskDirection)|ConvertTo-Json -Depth 4 -Compress))
 $taskTurned=$null
 for($i=0;$i -lt 10 -and !$taskTurned;$i++){
  foreach($packet in (Read-TaskPackets)){
   if($packet.StartsWith('42')){$event=$packet.Substring(2)|ConvertFrom-Json;if($event[0] -eq 'match:snapshot'){
    $p=$event[1].participants|Where-Object participantId -eq $event[1].selfParticipantId
    if($p.lastAppliedInputSeq -eq 1){$taskTurned=$p}
   }}
  }
 }
 if(!$taskTurned){throw 'No input acknowledgement'}
 if($taskSnapshot.config.turnRadiansPerSecond -ne 9 -or $taskSnapshot.config.moveCellsPerSecond -ne 4.2){throw 'Unexpected live config'}
 $taskPage=Invoke-WebRequest $taskUrl -TimeoutSec 8
 $taskResult=@{url=$taskUrl;transport='Socket.IO polling via PowerShell';protocolVersion=$taskSnapshot.protocolVersion;moveCellsPerSecond=$taskSnapshot.config.moveCellsPerSecond;turnRadiansPerSecond=$taskSnapshot.config.turnRadiansPerSecond;initial=$taskSelf.direction;target=$taskTarget;actual=$taskTurned.direction;ack=$taskTurned.lastAppliedInputSeq;asset=[regex]::Match($taskPage.Content,'/assets/index-[^" ]+\.js').Value;cleanup='room:leave and Engine.IO close; empty-room TTL applies'}
 $taskResult|ConvertTo-Json -Depth 5|Set-Content evidence/u-turn-live-server.json
 $taskResult|ConvertTo-Json -Depth 5 -Compress
}finally{
 if($taskJoined){Send-TaskPacket ('422'+(@('room:leave',@{requestId=[guid]::NewGuid().ToString('N')})|ConvertTo-Json -Depth 4 -Compress))}
 Send-TaskPacket '1'
}
