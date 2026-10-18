// Shared authoring rubric. Definitions are operational rules for this product, not calibrated IRT bands.
export const QUESTION_LABEL_RUBRIC = {
  version: 'math9-authoring-rubric-v1',
  cognitiveLevels: [
    { code: 'REMEMBERING', label: 'Nhận biết', definition: 'Nhớ hoặc nhận ra khái niệm, ký hiệu, tính chất, công thức đã học; thực hiện phép tính trực tiếp quen thuộc, không phải lựa chọn chiến lược giải.',
      evidence: 'Lời giải chủ yếu là nhắc lại kiến thức hoặc thay số trực tiếp vào một công thức đã xác định rõ.',
      example: 'Căn bậc hai số học của 81 là bao nhiêu? Đáp án 9.' },
    { code: 'UNDERSTANDING', label: 'Thông hiểu', definition: 'Giải thích ý nghĩa hoặc quan hệ; chuyển đổi biểu diễn, kiểm tra điều kiện, phân biệt trường hợp; thực hiện quy trình quen thuộc khi quan hệ cần dùng đã rõ.',
      evidence: 'Có bước giải thích vì sao, xác định điều kiện hoặc liên hệ dữ kiện với tính chất; chưa đòi hỏi tự thiết lập mô hình mới.',
      example: 'Tìm điều kiện xác định của căn(2x - 6): cần 2x - 6 >= 0 nên x >= 3.' },
    { code: 'APPLYING', label: 'Vận dụng', definition: 'Tự lựa chọn kiến thức và phương pháp phù hợp trong tình huống cụ thể; lập phương trình/mô hình hoặc kết nối các quan hệ để giải quyết bài toán không chỉ là thay số trực tiếp.',
      evidence: 'Lời giải chỉ rõ bước chọn mô hình/phương pháp và dùng nó để tìm, kiểm tra, diễn giải kết quả.',
      example: 'Từ tổng tiền gửi, hai lãi suất và tổng tiền lãi, tự lập hệ để tìm số tiền gửi mỗi ngân hàng.' },
    { code: 'ADVANCED_APPLYING', label: 'Vận dụng cao', definition: 'Giải quyết tình huống không quen thuộc, có điểm nút suy luận: phát hiện quan hệ ẩn, tạo biểu diễn phụ, phối hợp kiến thức, phân trường hợp/tham số, chứng minh hoặc tối ưu có điều kiện.',
      evidence: 'Chỉ ra được điểm nút suy luận vượt quy trình thường gặp, kiểm soát điều kiện và chứng minh kết quả/giá trị tối ưu có thể đạt.',
      example: 'Với x >= 16, tìm max căn(x - 16)/(3x): đặt t = căn(x - 16), phát hiện t² + 16 >= 8t, suy ra max 1/24 tại x = 32.' }
  ],
  difficulties: [
    { code: 'EASY', label: 'Dễ', definition: 'Dữ kiện rõ, thao tác ngắn và quen thuộc, ít ràng buộc, không có điểm nút suy luận đáng kể.' },
    { code: 'MEDIUM', label: 'Trung bình', definition: 'Cần hiểu hoặc lựa chọn quy trình quen thuộc, có kiểm tra điều kiện/biến đổi/đọc dữ liệu nhưng lộ trình giải tương đối rõ.' },
    { code: 'HARD', label: 'Khó', definition: 'Phải liên kết các quan hệ, tự lập mô hình hoặc quản lý nhiều điều kiện và kiểm tra nghiệm; có điểm dễ mắc sai lầm về bản chất.' },
    { code: 'VERY_HARD', label: 'Rất khó', definition: 'Có điểm nút không hiển nhiên, phối hợp nhiều ý tưởng, tham số hoặc tối ưu/chứng minh và kiểm soát trường hợp; không chỉ kéo dài tính toán.' }
  ],
  rules: [
    'Giải đầy đủ trước rồi mới đánh nhãn từ thao tác tư duy tối thiểu cần thiết; không suy ra mức từ động từ, độ dài, số bước hay hình thức trắc nghiệm.',
    'Mức nhận thức và độ khó là hai nhãn độc lập; không tự suy nhãn này từ nhãn kia. Ma trận quy định đồng thời cả hai cho từng vị trí.',
    'Câu ngắn hoặc có từ cực trị/tham số không tự động là vận dụng cao. Nêu rõ điểm nút suy luận và đối chiếu lời giải.',
    'Với đúng/sai, rà soát từng ý a-d; mức của cả câu là mức cao nhất thực sự cần cho ít nhất một ý bắt buộc. Vị trí thông hiểu không được giấu ý vận dụng/vận dụng cao bên trong.',
    'Với trả lời ngắn, ghi rõ đơn vị, cách nhập, làm tròn và sai số; các yêu cầu này không được vô tình tăng mức so với ma trận.',
    'Kiểm tra kiến thức thật của câu có thuộc chuyên đề yêu cầu, dữ kiện đủ, đáp án duy nhất/đúng, không lộ đáp án, không trùng nội dung. Không đổi nhãn câu sai chuyên đề để lấp ô ma trận.',
    'Nếu không đạt vị trí yêu cầu thì sửa hoặc thay câu; thiếu nguồn thì báo thiếu, không hạ chuẩn. Nhãn AI là đề xuất biên soạn, cần người phụ trách rà soát nội dung.'
  ]
};
