import { blueprintQuestions, blueprintSkills } from './fixtures/blueprint';
import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip = require('jszip');
import { extractExamDocument, validateGeneratedExam, ExamAiService, readExamResponse } from '../src/modules/assignment/exam-ai.service';
import { gradeQuestion } from '../src/modules/question/math-question';
const q = {questionType:'SHORT_ANSWER', content:'Tính tỉ lệ phần trăm số học sinh đạt điểm tốt.', difficulty:'MEDIUM', cognitiveLevel:'UNDERSTANDING', explanation:'Một phần tư là 25%.', shortAnswer:{mode:'NUMERIC',acceptedAnswers:['25'],tolerance:1e-9,instructions:'Nhập số phần trăm, không ghi ký hiệu %. Ví dụ 20.'}};
const counts = {SINGLE_CHOICE:12,TRUE_FALSE:4,SHORT_ANSWER:6};
const questions = blueprintQuestions();
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Teacher AI exam', () => {
  const streamResponse = (events: any[]) => {
    const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  it('assembles split Vietnamese SSE and cumulative usage without double charging', async () => {
    const result = await readExamResponse(streamResponse([
      {type:'message_start',message:{usage:{input_tokens:100,output_tokens:1}}},
      {type:'ping'},
      {type:'content_block_start',content_block:{type:'text',text:''}},
      {type:'content_block_delta',delta:{type:'text_delta',text:JSON.stringify({questions})}},
      {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:123}},
      {type:'message_stop'}
    ]));
    expect(result.usage).toEqual({input_tokens:100,output_tokens:123});
    expect(validateGeneratedExam(JSON.parse(result.content[0].text),counts,blueprintSkills)).toEqual(questions);
  });
  it('rejects interrupted streams and provider errors', async () => {
    await expect(readExamResponse(streamResponse([{type:'message_start',message:{usage:{input_tokens:1}}}]))).rejects.toThrow('incomplete');
    await expect(readExamResponse(streamResponse([{type:'error',error:{message:'overloaded'}}]))).rejects.toThrow('provider');
  });
  it('requires requested counts, unique questions and short answer instructions', () => {
    expect(validateGeneratedExam({questions},counts,blueprintSkills)).toEqual(questions);
    expect(() => validateGeneratedExam({questions:[]},counts,blueprintSkills)).toThrow();
    expect(() => validateGeneratedExam({questions:[...questions.slice(0,21),questions[0]]},counts,blueprintSkills)).toThrow();
    for (const patch of [{ difficulty: 'INVALID' }, { cognitiveLevel: 'INVALID' }, { shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['7'], instructions: '' } }]) {
      expect(() => validateGeneratedExam({questions:questions.map((q,i) => i === 21 ? {...q,...patch} : q)},counts,blueprintSkills)).toThrow();
    }
  });
  it('accepts a small AI paper without matrix slots or cognitive quotas', () => {
    const generated = questions.slice(0, 3).map((question, index) => {
      const { cognitiveLevel, ...rest } = question;
      return { ...rest, difficulty: ['VERY_HARD', 'EASY', 'EASY'][index], skillId: blueprintSkills[0].id };
    });
    const result = validateGeneratedExam({ questions: generated }, { SINGLE_CHOICE:3, TRUE_FALSE:0, SHORT_ANSWER:0 }, blueprintSkills);
    expect(result).toHaveLength(3);
    expect(result.map((q: any) => q.difficulty)).toEqual(['VERY_HARD','EASY','EASY']);
  });
  it('generates a Database Systems exam without curriculum access or Math labels', async () => {
    vi.stubEnv('AI_ENABLED','true'); vi.stubEnv('AI_PROVIDER','anthropic'); vi.stubEnv('ANTHROPIC_API_KEY','test'); vi.stubEnv('SESSION_SECRET','test-secret');
    const question = {questionType:'SHORT_ANSWER',content:'Which SQL clause filters groups?',difficulty:'HARD',shortAnswer:{mode:'TEXT',acceptedAnswers:['HAVING'],instructions:'Enter one SQL keyword.'}};
    const budget = {reserve:vi.fn().mockResolvedValue({id:'db'}),settle:vi.fn(),fail:vi.fn()};
    const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({stop_reason:'end_turn',usage:{input_tokens:80,output_tokens:60},content:[{type:'text',text:JSON.stringify({questions:[question]})}]}),{headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',provider);
    const zip = new JSZip(); zip.file('ppt/slides/slide1.xml','<p:sld><a:t>Database Systems: SQL HAVING filters grouped rows after GROUP BY; WHERE filters rows before grouping.</a:t></p:sld>');
    const result = await new ExamAiService(budget as any).generate('teacher','ip',{originalname:'database.pptx',buffer:await zip.generateAsync({type:'nodebuffer'})},{counts:JSON.stringify({SINGLE_CHOICE:0,TRUE_FALSE:0,SHORT_ANSWER:1})});
    expect(result.questions[0]).toMatchObject({content:question.content,difficulty:'HARD'});
    expect(result.questions[0].skillId).toBeUndefined();
    expect(budget.settle).toHaveBeenCalledOnce();
  });
  it('grades percent, rounded decimals and text consistently', () => {
    expect(gradeQuestion(q,{response:{shortAnswer:'25'}}).isCorrect).toBe(true);
    expect(gradeQuestion(q,{response:{shortAnswer:'25%'}}).isCorrect).toBe(false);
    expect(gradeQuestion({...q,shortAnswer:{...q.shortAnswer,acceptedAnswers:['0.33']}},{response:{shortAnswer:'0,33'}}).isCorrect).toBe(true);
    expect(gradeQuestion({...q,shortAnswer:{mode:'TEXT',acceptedAnswers:['Hà Nội']}},{response:{shortAnswer:'hà nội'}}).isCorrect).toBe(true);
  });
  it('extracts PPTX slides in natural order and preserves numeric text', async () => {
    const zip = new JSZip();
    const xml = (text:string) => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r><a:r><a:t>001</a:t></a:r></a:p></p:sld>`;
    zip.file('ppt/slides/slide10.xml',xml('Bài cuối: Ôn tập phương trình bậc hai.'));
    zip.file('ppt/slides/slide2.xml',xml('Bài đầu: Giải phương trình và tính căn bậc hai.'));
    const text = await extractExamDocument({originalname:'lesson.pptx',buffer:await zip.generateAsync({type:'nodebuffer'})});
    expect(text.indexOf('Bài đầu')).toBeLessThan(text.indexOf('Bài cuối')); expect(text).toContain('001');
  });
  it('extracts Word paragraphs from DOCX', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ôn tập phương trình bậc hai và bài toán phần trăm cho học sinh lớp chín.</w:t></w:r></w:p></w:body></w:document>');
    expect(await extractExamDocument({originalname:'lesson.docx',buffer:await zip.generateAsync({type:'nodebuffer'})})).toContain('phương trình bậc hai');
  });
  it('extracts text from a PDF', async () => {
    const content = 'BT /F1 12 Tf 50 700 Td (Mathematics lesson: equations, fractions and percentage calculations.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((obj,i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${obj}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf); pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    expect(await extractExamDocument({originalname:'lesson.pdf',buffer:Buffer.from(pdf)})).toContain('percentage');
  });
  it('rejects unsupported and empty sources', async () => {
    await expect(extractExamDocument({originalname:'x.exe',buffer:Buffer.from('test')})).rejects.toThrow();
    const zip = new JSZip(); zip.file('ppt/slides/slide1.xml','<p:sld/>');
    await expect(extractExamDocument({originalname:'x.pptx',buffer:await zip.generateAsync({type:'nodebuffer'})})).rejects.toThrow();
  });
  it('calls the configured provider, settles cost and returns validated questions', async () => {
    vi.stubEnv('AI_ENABLED','true'); vi.stubEnv('AI_PROVIDER','anthropic'); vi.stubEnv('ANTHROPIC_API_KEY','test'); vi.stubEnv('SESSION_SECRET','test-secret');
    const budget = {reserve:vi.fn().mockResolvedValue({id:'r'}),settle:vi.fn(),fail:vi.fn()};
    const provider = vi.fn().mockResolvedValue({ok:true,json:async () => ({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100},content:[{type:'text',text:JSON.stringify({questions})}]})});
    vi.stubGlobal('fetch',provider);
    const zip = new JSZip(); zip.file('ppt/slides/slide1.xml','<p:sld><a:t>Nội dung toán học về phần trăm và tỉ lệ học sinh trong lớp.</a:t></p:sld>');
    const file = {originalname:'lesson.pptx',buffer:await zip.generateAsync({type:'nodebuffer'})};
    const result = await new ExamAiService(budget as any).generate('teacher','127.0.0.1',file,{counts:JSON.stringify(counts)});
    expect(result.questions).toEqual(questions); expect(budget.reserve).toHaveBeenCalledOnce(); expect(budget.settle).toHaveBeenCalledOnce();
    expect(JSON.parse(provider.mock.calls[0][1].body).stream).toBe(true);
    const request = JSON.parse(provider.mock.calls[0][1].body);
    expect(request.system).toContain('BẤT KỲ môn học');
    expect(request.system).not.toContain('Nếu tài liệu khác môn');
    expect(JSON.parse(request.messages[0].content).availableSkills).toBeUndefined();
    expect(JSON.parse(request.messages[0].content).structure).toBeUndefined();
    expect(JSON.parse(request.messages[0].content).questionCounts).toEqual(counts);
    expect(request.system).toContain('không ép tỷ lệ hoặc vị trí');
    provider.mockResolvedValueOnce({ok:true,json:async () => ({stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:100},content:[{type:'text',text:JSON.stringify({questions:questions.slice(0,21)})}]})});
    provider.mockResolvedValueOnce({ok:true,json:async () => ({stop_reason:'end_turn',usage:{input_tokens:40,output_tokens:40},content:[{type:'text',text:JSON.stringify({questions:questions.slice(21)})}]})});
    const supplemented = await new ExamAiService(budget as any).generate('teacher','ip',file,{counts:JSON.stringify(counts)});
    expect(supplemented.questions).toEqual(questions);
    const supplementRequest = JSON.parse(provider.mock.calls.at(-1)![1].body);
    expect(JSON.parse(supplementRequest.messages[0].content).questionCounts).toEqual({SINGLE_CHOICE:0,TRUE_FALSE:0,SHORT_ANSWER:1});
    provider.mockResolvedValueOnce(streamResponse([
      {type:'message_start',message:{usage:{input_tokens:100,output_tokens:1}}},
      {type:'content_block_delta',delta:{type:'text_delta',text:JSON.stringify({questions})}},
      {type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:200}},
      {type:'message_stop'}
    ]));
    expect((await new ExamAiService(budget as any).generate('teacher','ip',file,{counts:JSON.stringify(counts)})).questions).toEqual(questions);
    expect(budget.settle).toHaveBeenLastCalledWith('r',100,200,{task:'TEACHER_EXAM'});
    provider.mockRejectedValueOnce(new DOMException('Timed out','TimeoutError'));
    const calls = provider.mock.calls.length;
    await expect(new ExamAiService(budget as any).generate('teacher','ip',file,{counts:JSON.stringify(counts)})).rejects.toThrow('5 phút');
    expect(provider.mock.calls.length).toBe(calls + 1);
    expect(budget.fail).toHaveBeenLastCalledWith('r',false);
    provider.mockResolvedValueOnce({ok:true,json:async () => ({stop_reason:'max_tokens',usage:{input_tokens:100,output_tokens:100},content:[]})});
    await expect(new ExamAiService(budget as any).generate('teacher','ip',file,{counts:JSON.stringify(counts)})).rejects.toThrow('AI trả về');
    await expect(new ExamAiService(budget as any).generate('teacher','ip',file,{counts:JSON.stringify({...counts,SHORT_ANSWER:61})})).rejects.toThrow('60 câu');
  });
});
