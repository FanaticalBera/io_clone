(function(){
 var lines=[],active=false,output=document.getElementById('output'),summary=document.getElementById('summary');
 function log(message){lines.push(new Date().toISOString()+' '+message);output.textContent=lines.join('\n');}
 function test(){
  if(active)return;active=true;lines=[];summary.textContent='확인 중…';document.getElementById('retry').disabled=true;
  log('UA: '+navigator.userAgent);log('Origin: '+location.origin+' · secureContext: '+window.isSecureContext);
  function capability(name){try{return typeof window[name];}catch(e){return 'blocked:'+e.name;}}
  log('API: IndexedDB='+capability('indexedDB')+' · structuredClone='+capability('structuredClone')+' · BroadcastChannel='+capability('BroadcastChannel'));
  var phase='PROBE_OPEN',db=null,tx=null,finished=false,timer=setTimeout(function(){fail('TIMEOUT @ '+phase);},15000);
  function done(message){if(finished)return;finished=true;clearTimeout(timer);if(db)db.close();log(message);summary.textContent=message;active=false;document.getElementById('retry').disabled=false;}
  function fail(message){if(tx)try{tx.abort();}catch(e){}done('실패: '+message);}
  function error(e){return e?e.name+': '+e.message:'UnknownError';}
  try{
   var request=indexedDB.open('hexhold.storage-diagnostic',1);
   request.onupgradeneeded=function(){request.result.createObjectStore('probe');};
   request.onblocked=function(){fail('PROBE_OPEN blocked');};
   request.onerror=function(){fail(error(request.error)+' @ '+phase);};
   request.onsuccess=function(){
    if(finished){request.result.close();return;}db=request.result;phase='PROBE_WRITE';log('PROBE_OPEN OK');
    try{
     tx=db.transaction('probe','readwrite');var sample={stamp:Date.now(),check:'storage-roundtrip'};
     var put=tx.objectStore('probe').put(sample,'sample');put.onsuccess=function(){log('PROBE_PUT OK');};put.onerror=function(){fail(error(put.error)+' @ PROBE_WRITE');};
     tx.onabort=function(){fail(error(tx.error)+' @ '+phase);};
     tx.oncomplete=function(){
      if(finished)return;log('PROBE_WRITE COMMIT OK');phase='PROBE_READ';tx=db.transaction('probe','readonly');
      var get=tx.objectStore('probe').get('sample'),verified=false;
      get.onsuccess=function(){verified=!!get.result&&get.result.stamp===sample.stamp&&get.result.check===sample.check;};
      tx.onabort=function(){fail(error(tx.error)+' @ PROBE_READ');};
      tx.oncomplete=function(){if(finished)return;if(!verified){fail('Roundtrip mismatch');return;}log('PROBE_READ OK');db.close();db=null;tx=null;readProfile();};
     };
    }catch(e){fail(error(e)+' @ '+phase);}
   };
  }catch(e){fail(error(e)+' @ '+phase);}
  function readProfile(){
   phase='PROFILE_OPEN_READONLY';log('게임 프로필 읽기 시작 (수정 없음)');
   var request;
   try{request=indexedDB.open('hexhold.player-profile');}catch(e){fail(error(e)+' @ '+phase);return;}
   request.onupgradeneeded=function(){request.transaction.abort();};
   request.onblocked=function(){fail('PROFILE_OPEN blocked');};
   request.onerror=function(){if(request.error&&request.error.name==='AbortError')done('테스트 저장소 정상 · 기존 게임 프로필 없음');else fail(error(request.error)+' @ '+phase);};
   request.onsuccess=function(){
    if(finished){request.result.close();return;}db=request.result;
    if(!db.objectStoreNames.contains('meta')){done('테스트 저장소 정상 · 게임 프로필 store 없음');return;}
    log('PROFILE_DB version='+db.version);phase='PROFILE_READ';try{
     tx=db.transaction('meta','readonly');var get=tx.objectStore('meta').get('profile'),profile;
     get.onsuccess=function(){profile=get.result;};
     tx.onabort=function(){fail(error(tx.error)+' @ PROFILE_READ');};
     tx.oncomplete=function(){
      if(finished)return;
      if(profile){log('PROFILE_READ OK · version='+profile.version+' · Coins='+profile.coins+' · savedRuns='+(profile.processedRuns||[]).length);}
      else log('PROFILE_READ OK · 아직 저장된 프로필 없음');
      done('진단 완료: 저장소 읽기·쓰기 정상');
     };
    }catch(e){fail(error(e)+' @ '+phase);}
   };
  }
 }
 document.getElementById('retry').onclick=test;
 document.getElementById('copy').onclick=function(){
  var box=document.createElement('textarea');box.value=output.textContent;document.body.appendChild(box);box.select();
  try{var copied=document.execCommand('copy');summary.textContent=copied?'결과를 복사했어요.':'아래 결과를 직접 복사해 주세요.';}catch(e){summary.textContent='아래 결과를 직접 복사해 주세요.';}
  box.remove();
 };
 test();
}());
