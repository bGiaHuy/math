import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import JSZip = require('jszip');
import sanitizeHtml = require('sanitize-html');

const metadata = { id: true, fileName: true, mimeType: true, size: true } as const;
@Injectable()
export class ExamDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(ownerId: string, file: any) {
    if (!file?.buffer || !file.buffer.length || file.buffer.length > 10 * 1024 * 1024) throw new BadRequestException('Chọn tệp PDF, DOCX, PNG, JPEG hoặc WebP, tối đa 10 MB.');
    const b: Buffer = file.buffer, ext = file.originalname.split('.').pop()?.toLowerCase();
    let mimeType: string, previewHtml: string;
    if (ext === 'pdf' && b.subarray(0, 5).toString() === '%PDF-') mimeType = 'application/pdf';
    else if (ext === 'png' && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = 'image/png';
    else if (['jpg', 'jpeg'].includes(ext) && b[0] === 255 && b[1] === 216 && b[2] === 255) mimeType = 'image/jpeg';
    else if (ext === 'webp' && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') mimeType = 'image/webp';
    else if (ext === 'docx' && b.subarray(0, 2).toString() === 'PK') {
      try {
        const zip = await JSZip.loadAsync(b);
        const total = Object.values(zip.files).reduce((n, f: any) => n + (f._data?.uncompressedSize || 0), 0);
        if (total > 30_000_000 || Object.keys(zip.files).length > 2000 || !zip.file('word/document.xml')) throw new Error();
        const converted = await require('mammoth').convertToHtml({ buffer: b });
        previewHtml = sanitizeHtml(converted.value, {
          allowedTags: ['p','br','strong','em','u','s','sup','sub','h1','h2','h3','h4','ul','ol','li','table','thead','tbody','tr','td','th','img','blockquote'],
          allowedAttributes: { img: ['src', 'alt'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
          allowedSchemes: ['data'], allowedSchemesByTag: { img: ['data'] },
          exclusiveFilter: frame => frame.tag === 'img' && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(frame.attribs.src || '')
        });
        if (!previewHtml.trim()) throw new Error();
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } catch { throw new BadRequestException('Không đọc được Word. Hãy dùng DOCX hợp lệ hoặc xuất thành PDF để giữ bố cục và công thức.'); }
    } else throw new BadRequestException('Tệp không hợp lệ. Hỗ trợ PDF, DOCX, PNG, JPEG và WebP; tệp .doc cần chuyển sang DOCX/PDF.');
    const document = await this.prisma.examDocument.create({ data: { ownerId, fileName: file.originalname.replace(/[\r\n/\\]/g, '_').slice(0, 200), mimeType, content: b, size: b.length, ...(previewHtml ? { previewHtml } : {}) }, select: metadata });
    return { document };
  }

  async get(userId: string, id: string, role: string, binary = false) {
    const doc = await this.prisma.examDocument.findUnique({ where: { id }, select: { ...metadata, ownerId: true, previewHtml: true, ...(binary ? { content: true } : {}) } });
    if (!doc) throw new NotFoundException('Không tìm thấy tài liệu.');
    if (doc.ownerId !== userId) {
      const assignment = await this.prisma.classroomAssignment.findFirst({ where: { settings: { path: ['documentId'], equals: id },
        ...(role === 'STUDENT' ? { status: { in: ['PUBLISHED','CLOSED'] }, classroom: { isActive: true, memberships: { some: { studentId: userId, status: 'ACTIVE' } } } } : role === 'ADMIN' ? {} : { classroom: { teacherId: userId } }) }, select: { id: true } });
      if (!assignment) throw new ForbiddenException('Bạn không có quyền xem tài liệu này.');
    }
    const { ownerId, ...result } = doc;
    return result;
  }
}
