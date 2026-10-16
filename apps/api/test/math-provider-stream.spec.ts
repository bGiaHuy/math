import {describe,it,expect} from 'vitest';
import {readMathProviderStream} from '../src/modules/student/math-provider-stream';
import {chapterCompetency} from '../../../src/lib/mathCompetency';
describe('Math streaming and competency',()=>{
 it('delivers partial text before the provider finishes, across byte boundaries',async()=>{
  let controller:any;const stream=new ReadableStream({start(c){controller=c;}});const seen:string[]=[];
  const encode=(value:any)=>new TextEncoder().encode('data: '+JSON.stringify(value)+'\n\n');
  const pending=readMathProviderStream(new Response(stream),async text=>{seen.push(text);});
  controller.enqueue(encode({type:'message_start',message:{usage:{input_tokens:12}}}));
  const bytes=encode({type:'content_block_delta',delta:{type:'text_delta',text:'Tiếng Việt'}});controller.enqueue(bytes.slice(0,bytes.length-4));controller.enqueue(bytes.slice(bytes.length-4));
  await new Promise(resolve=>setTimeout(resolve,10));expect(seen).toEqual(['Tiếng Việt']);
  controller.enqueue(encode({type:'message_delta',usage:{output_tokens:4},delta:{stop_reason:'end_turn'}}));controller.enqueue(encode({type:'message_stop'}));controller.close();
  expect((await pending).usage).toEqual({input_tokens:12,output_tokens:4});
 });
 it('rejects incomplete streams instead of reporting success',async()=>{
  await expect(readMathProviderStream(new Response('data: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\n\n'),async()=>{})).rejects.toThrow('incomplete');
 });
 it('keeps unassessed chapters absent and reports partial coverage',()=>{
  const data=chapterCompetency([{chapter:'A',masteryScore:80,evidenceCount:5},{chapter:'A',masteryScore:null},{chapter:'B',masteryScore:null}]);
  expect(data[0]).toMatchObject({score:80,assessed:1,total:2,confirmed:1});expect(data[1].score).toBeNull();
 });
});
