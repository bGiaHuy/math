// Anthropic-compatible SSE reader, independent of transport chunk boundaries.
export async function readMathProviderStream(response:Response,onText:(text:string)=>Promise<void>){
 if(!response.body)throw new Error('stream missing');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',input=0,output=0,stop='',started=false,finished=false;
 async function event(block:string){
  const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')return;
  const value=JSON.parse(data);if(value.type==='error')throw new Error('provider stream error');
  if(value.type==='message_start'){started=true;input=value.message?.usage?.input_tokens;}
  if(value.type==='content_block_delta'&&value.delta?.type==='text_delta'){text+=value.delta.text;await onText(text);}
  if(value.type==='message_delta'){output=value.usage?.output_tokens;stop=value.delta?.stop_reason;}
  if(value.type==='message_stop')finished=true;
 }
 try{while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){await event(buffer.slice(0,end));buffer=buffer.slice(end+2);}if(chunk.done)break;}if(buffer.trim())await event(buffer);
 if(!started||!finished||!Number.isInteger(input)||!Number.isInteger(output))throw new Error('incomplete provider stream');
 return {content:[{type:'text',text}],usage:{input_tokens:input,output_tokens:output},stop_reason:stop};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
