export async function streamMathTutor({reviewId,reason,requestId,general,onText,signal}) {
 const base=import.meta.env.VITE_API_BASE_URL||'/api/v1';
 const response=await fetch(base+'/student/review/'+(general?'tutor-stream':'chat-stream'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewId,reason,requestId}),signal});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'Không kết nối được gia sư.');}
 if(!response.body)throw new Error('Trình duyệt không hỗ trợ luồng trả lời.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
 try{while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim();const raw=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!raw)continue;const data=JSON.parse(raw);if(event==='error')throw new Error(data.message);if(event==='text')onText(data.text);if(event==='done'){result=data;onText(data.text);}}if(chunk.done)break;}if(!result)throw new Error('Kết nối bị ngắt. Tải lịch sử để kiểm tra câu trả lời trước khi gửi lại.');return result;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
