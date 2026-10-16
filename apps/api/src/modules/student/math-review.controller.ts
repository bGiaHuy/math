import {Body,Controller,Get,Param,Post,Req,Res,UseGuards} from '@nestjs/common';
import {UserRole} from '@prisma/client';
import {AuthGuard} from '../auth/guards/auth.guard';import {RolesGuard} from '../auth/guards/roles.guard';import {Roles} from '../auth/decorators/roles.decorator';import {CurrentUser} from '../auth/decorators/current-user.decorator';import {MathReviewService} from './math-review.service';
@Controller('student/review') @UseGuards(AuthGuard,RolesGuard) @Roles(UserRole.STUDENT)
export class MathReviewController {
 constructor(private readonly review:MathReviewService){}
 @Post('tutor-stream') tutorStream(@CurrentUser('id') id:string,@Body() b:any,@Req() req:any,@Res() res:any){return this.stream(id,b,req,res,true);}
 @Post('chat-stream') chatStream(@CurrentUser('id') id:string,@Body() b:any,@Req() req:any,@Res() res:any){return this.stream(id,b,req,res,false);}
 private async stream(id:string,b:any,req:any,res:any,general:boolean){
  await this.review.available(id);
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();
  const emit=(event:string,data:any)=>{if(!res.destroyed)res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');};
  const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},10000);
  try{const result=await this.review.feedback(id,b,req.ip||'unknown',true,general,async text=>{emit('text',{text});});emit('done',result);}
  catch(error){emit('error',{message:error?.getResponse?.()?.message||error.message||'Gia sư tạm thời không trả lời được.'});}
  finally{clearInterval(heartbeat);res.end();}
 }
 @Get('tutor/:conversationId') tutorHistory(@CurrentUser('id') id:string,@Param('conversationId') c:string){return this.review.chatHistory(id,c,true);}
 @Post('tutor') tutor(@CurrentUser('id') id:string,@Body() b:any,@Req() req:any){return this.review.feedback(id,b,req.ip||'unknown',true,true);}
 @Post('tutor/:conversationId/clear') tutorClear(@CurrentUser('id') id:string,@Param('conversationId') c:string){return this.review.clearChat(id,c,true);}
 @Get('summary') summary(@CurrentUser('id') id:string){return this.review.summary(id);}
 @Get('conversations') conversations(@CurrentUser('id') id:string){return this.review.conversations(id);}
 @Get('queue') queue(@CurrentUser('id') id:string){return this.review.queue(id);}
 @Post('enroll/:questionId') enroll(@CurrentUser('id') id:string,@Param('questionId') q:string){return this.review.enroll(id,q);}
 @Post('cards/:cardId/reveal') reveal(@CurrentUser('id') id:string,@Param('cardId') c:string,@Body() b:unknown){return this.review.reveal(id,c,b);}
 @Post('logs/:reviewId') rate(@CurrentUser('id') id:string,@Param('reviewId') r:string,@Body() b:unknown){return this.review.review(id,r,b);}
 @Post('feedback') feedback(@CurrentUser('id') id:string,@Body() b:unknown,@Req() req:any){return this.review.feedback(id,b,req.ip||'unknown');}
 @Get('chat/:reviewId') history(@CurrentUser('id') id:string,@Param('reviewId') reviewId:string){return this.review.chatHistory(id,reviewId);}
 @Post('chat') chat(@CurrentUser('id') id:string,@Body() b:unknown,@Req() req:any){return this.review.feedback(id,b,req.ip||'unknown',true);}
 @Post('chat/:reviewId/clear') clear(@CurrentUser('id') id:string,@Param('reviewId') reviewId:string){return this.review.clearChat(id,reviewId);}
}
