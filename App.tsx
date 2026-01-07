
import React, { useState, useRef, useEffect } from 'react';
import { BloomLevel, MCQQuestion, QuizConfig, HistoryItem } from './types';
import { generateMCQs } from './services/geminiService';
import QuestionCard from './components/QuestionCard';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import saveAs from 'file-saver';

// Declare mammoth for TypeScript
declare const mammoth: any;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const [config, setConfig] = useState<QuizConfig>({
    bloomDistribution: {
      [BloomLevel.NHAN_BIET]: 2,
      [BloomLevel.THONG_HIEU]: 2,
      [BloomLevel.VAN_DUNG]: 1,
    },
    language: 'vi'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('medquiz_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('medquiz_history', JSON.stringify(history));
  }, [history]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = [
        'application/pdf', 
        'text/plain', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      const isDocx = selectedFile.name.endsWith('.docx');
      const isTxt = selectedFile.name.endsWith('.txt');

      if (!validTypes.includes(selectedFile.type) && !isDocx && !isTxt) {
        setError('Định dạng không hỗ trợ. Vui lòng tải lên file PDF, Word (.docx) hoặc Text (.txt).');
        setFile(null);
        return;
      }

      // Updated limit to 50MB
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('Dung lượng file tối đa là 50MB');
        setFile(null);
        return;
      }
      
      setFile(selectedFile);
      setCurrentFileName(selectedFile.name);
      setError(null);
    }
  };

  const updateBloomCount = (level: BloomLevel, count: number) => {
    setConfig(prev => ({
      ...prev,
      bloomDistribution: {
        ...prev.bloomDistribution,
        [level]: count
      }
    }));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const fileToText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const fileToDocxText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = error => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleGenerate = async () => {
    if (!file) {
      setError('Vui lòng chọn tài liệu trước');
      return;
    }

    const totalQuestions = (Object.values(config.bloomDistribution) as (number | undefined)[]).reduce((a: number, b) => a + (b || 0), 0);
    if (!totalQuestions || totalQuestions === 0) {
      setError('Vui lòng chọn ít nhất một mức độ Bloom với số lượng > 0');
      return;
    }

    setLoading(true);
    setError(null);
    setQuestions([]);

    try {
      let contentParams: { base64?: string; text?: string; mimeType?: string } = {};

      if (file.type === 'application/pdf') {
        const base64 = await fileToBase64(file);
        contentParams = { base64, mimeType: file.type };
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const text = await fileToDocxText(file);
        if (!text || text.trim().length < 10) {
          throw new Error("Không thể trích xuất văn bản từ file Word này hoặc file rỗng.");
        }
        contentParams = { text };
      } else {
        const text = await fileToText(file);
        contentParams = { text };
      }

      const result = await generateMCQs(contentParams, config);
      setQuestions(result);

      // Add to history
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fileName: file.name,
        questions: result,
        config: JSON.parse(JSON.stringify(config))
      };
      setHistory(prev => [newHistoryItem, ...prev]);

    } catch (err: any) {
      console.error(err);
      let msg = 'Có lỗi xảy ra.';
      if (err.message?.includes('Unsupported MIME type')) {
        msg = 'Định dạng file này chưa được API hỗ trợ trực tiếp. Hệ thống đã cố gắng chuyển đổi nhưng thất bại. Thử dùng PDF.';
      } else {
        msg = err.message || 'Vui lòng thử lại với file PDF hoặc Text.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const restoreHistory = (item: HistoryItem) => {
    setQuestions(item.questions);
    setConfig(item.config);
    setCurrentFileName(item.fileName);
    setFile(null); // Clear active file input
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearAllHistory = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử không?")) {
      setHistory([]);
    }
  };

  const exportToWord = async () => {
    if (questions.length === 0) return;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "BỘ CÂU HỎI TRẮC NGHIỆM Y KHOA",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Tài liệu nguồn: ${currentFileName || "N/A"}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "" }),
          ...questions.flatMap((q) => [
            new Paragraph({
              children: [
                new TextRun({ text: `Câu ${q.order}: `, bold: true }),
                new TextRun({ text: q.questionText }),
                new TextRun({ text: ` [${q.bloomLevel}]`, italic: true, color: "0000FF" }),
              ],
              spacing: { before: 400 },
            }),
            new Paragraph({ text: `A. ${q.options.A}`, spacing: { before: 100 } }),
            new Paragraph({ text: `B. ${q.options.B}` }),
            new Paragraph({ text: `C. ${q.options.C}` }),
            new Paragraph({ text: `D. ${q.options.D}` }),
            new Paragraph({
              children: [
                new TextRun({ text: "Đáp án đúng: ", bold: true }),
                new TextRun({ text: q.correctAnswer, bold: true, color: "008000" }),
              ],
              spacing: { before: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Biện luận: ", bold: true }),
                new TextRun({ text: q.rationale, italic: true }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Trích dẫn: ", bold: true }),
                new TextRun({ text: q.citation }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Loại trừ phương án nhiễu:", bold: true }),
              ],
              spacing: { before: 100 },
            }),
            ...q.distractorAnalysis
              .filter(d => d.key !== q.correctAnswer)
              .map(d => new Paragraph({ text: `${d.key}: ${d.reason}` })),
          ])
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `MedQuiz_${new Date().getTime()}.docx`);
  };

  const copyToClipboard = () => {
    const text = questions.map(q => {
      return `Câu hỏi ${q.order}: ${q.questionText}\n\nA. ${q.options.A}\nB. ${q.options.B}\nC. ${q.options.C}\nD. ${q.options.D}\n\nĐáp án chính xác: ${q.correctAnswer}\n\nBiện luận: ${q.rationale}\nTrích dẫn: ${q.citation}\n\nLoại trừ:\n${q.distractorAnalysis.filter(d => d.key !== q.correctAnswer).map(d => `${d.key}: ${d.reason}`).join('\n')}\n\n-------------------\n`;
    }).join('\n');
    
    navigator.clipboard.writeText(text);
    alert('Đã sao chép bộ câu hỏi vào bộ nhớ tạm!');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-blue-700 text-white py-6 px-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg">
              <svg className="w-8 h-8 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">MedQuiz AI</h1>
              <p className="text-xs text-blue-100 font-medium opacity-80 uppercase tracking-widest">Medical Bloom MCQ Generator</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowHistory(true)}
              className="bg-blue-800 hover:bg-blue-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-blue-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Lịch sử {history.length > 0 && `(${history.length})`}
            </button>
            {questions.length > 0 && (
              <>
                <button 
                  onClick={copyToClipboard}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-blue-400"
                >
                  Sao chép
                </button>
                <button 
                  onClick={exportToWord}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-green-400 shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tải file Word
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* History Sidebar/Drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-black text-slate-800">Lịch sử tạo đề</h2>
                <p className="text-xs text-slate-500 font-medium">Tự động lưu trữ các phiên làm việc của bạn</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                  <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-slate-600 font-medium">Chưa có lịch sử tạo đề nào.</p>
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => restoreHistory(item)}
                    className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer relative"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="pr-8">
                        <h4 className="font-bold text-slate-800 line-clamp-1">{item.fileName}</h4>
                        <p className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleString('vi-VN')}</p>
                      </div>
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap mt-3">
                      <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 font-bold rounded uppercase">
                        {item.questions.length} CÂU HỎI
                      </span>
                      {(Object.entries(item.config.bloomDistribution) as [string, number | undefined][]).filter(([_, v]) => (v || 0) > 0).map(([k, v]) => (
                        <span key={k} className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-500 font-medium rounded border border-slate-100">
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {history.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <button 
                  onClick={clearAllHistory}
                  className="w-full py-2.5 text-sm font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Xóa toàn bộ lịch sử
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-grow max-w-6xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Configuration */}
        <aside className="lg:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Tải tài liệu nguồn
            </h2>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                file || currentFileName ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".pdf,.txt,.docx" 
              />
              <svg className={`w-12 h-12 mx-auto mb-4 ${file || currentFileName ? 'text-blue-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-bold text-slate-700">
                {file ? file.name : (currentFileName ? currentFileName : 'Nhấp để tải file PDF, Word hoặc Text')}
              </p>
              <p className="text-xs text-slate-500 mt-2">Hỗ trợ: PDF, DOCX, TXT (Dưới 50MB)</p>
              {currentFileName && !file && <p className="text-[10px] text-blue-500 mt-1 font-bold">(Đang hiển thị từ Lịch sử)</p>}
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              </svg>
              Số lượng câu hỏi theo mức độ
            </h2>
            
            <div className="space-y-4">
              {Object.values(BloomLevel).map((level) => (
                <div key={level} className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                  <span className="text-sm font-semibold text-slate-700">{level}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => updateBloomCount(level, Math.max(0, (config.bloomDistribution[level] || 0) - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      value={config.bloomDistribution[level] || 0}
                      onChange={(e) => updateBloomCount(level, parseInt(e.target.value) || 0)}
                      className="w-12 text-center bg-white border border-slate-200 rounded-lg py-1 font-bold text-blue-700"
                    />
                    <button 
                      onClick={() => updateBloomCount(level, (config.bloomDistribution[level] || 0) + 1)}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Tổng số câu hỏi</span>
                  <span className="text-xl font-black text-blue-700">
                    {(Object.values(config.bloomDistribution) as (number | undefined)[]).reduce((a: number, b) => a + (b || 0), 0)}
                  </span>
                </div>
                
                <button
                  disabled={loading || !file}
                  onClick={handleGenerate}
                  className={`w-full py-4 rounded-xl font-black text-white transition-all shadow-lg flex items-center justify-center gap-3 ${
                    loading || !file 
                      ? 'bg-slate-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Đang tạo đề...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Tạo bộ câu hỏi ngay
                    </>
                  )}
                </button>
                {!file && currentFileName && (
                  <p className="text-center text-[11px] text-slate-400 mt-2 font-medium">Tải tệp mới lên để tạo thêm bộ câu hỏi</p>
                )}
              </div>
            </div>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex gap-3 text-red-700">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}
        </aside>

        {/* Right Column: Results */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm animate-pulse">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-blue-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Đang phân tích tài liệu y khoa...</h3>
              <p className="text-slate-500 max-w-md mx-auto">Gemini đang trích xuất dữ liệu, phân loại Bloom và xây dựng các phương án nhiễu logic dựa trên kiến thức lâm sàng.</p>
            </div>
          ) : questions.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Kết quả bộ câu hỏi</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                    {questions.length} câu hỏi được tạo
                  </span>
                </div>
              </div>
              {questions.map((q) => (
                <QuestionCard key={q.id} question={q} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-16 text-center border border-slate-200 shadow-sm border-dashed">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-100">
                <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-700 mb-4">Sẵn sàng phân tích</h3>
              <p className="text-slate-500 max-w-lg mx-auto leading-relaxed">
                Tải lên tài liệu y khoa (PDF, Word hoặc Text) và chọn số lượng câu hỏi cho mỗi mức độ Bloom để bắt đầu. Hệ thống sẽ tự động tạo bộ đề chất lượng cao.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-8 px-4 border-t border-slate-800">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm font-medium">&copy; 2024 MedQuiz AI. Thiết kế dành riêng cho Giáo dục Y khoa chuyên sâu.</p>
          <p className="text-xs mt-2 opacity-50">Tích hợp Gemini 3 Pro & mammoth.js & docx.js</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
