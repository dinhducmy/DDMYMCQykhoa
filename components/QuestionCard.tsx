
import React from 'react';
import { MCQQuestion } from '../types';

interface QuestionCardProps {
  question: MCQQuestion;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8 transition-all hover:shadow-md">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <span className="font-bold text-blue-700">Câu hỏi {question.order}</span>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full uppercase">
          {question.bloomLevel}
        </span>
      </div>
      
      <div className="p-6">
        <p className="text-lg text-slate-800 font-medium mb-6 leading-relaxed">
          {question.questionText}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {(Object.entries(question.options) as [('A'|'B'|'C'|'D'), string][]).map(([key, content]) => (
            <div 
              key={key} 
              className={`p-4 rounded-lg border flex items-start gap-3 ${
                question.correctAnswer === key 
                ? 'bg-green-50 border-green-200 ring-1 ring-green-200' 
                : 'bg-slate-50 border-slate-200'
              }`}
            >
              <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                question.correctAnswer === key 
                ? 'bg-green-600 text-white' 
                : 'bg-white text-slate-500 border border-slate-300'
              }`}>
                {key}
              </span>
              <span className="text-slate-700">{content}</span>
            </div>
          ))}
        </div>

        <div className="space-y-6 pt-6 border-t border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Đáp án chính xác: <span className="text-green-600 font-black">{question.correctAnswer}</span></h4>
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
              <p className="text-slate-700 leading-relaxed italic">
                <span className="font-bold text-green-700">Biện luận:</span> Chọn {question.correctAnswer} vì {question.rationale}
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Trích dẫn tài liệu</h4>
            <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-200 italic">
              &ldquo;{question.citation}&rdquo;
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Phân tích loại trừ phương án nhiễu</h4>
            <div className="space-y-2">
              {question.distractorAnalysis
                .filter(d => d.key !== question.correctAnswer)
                .map((distractor) => (
                  <div key={distractor.key} className="flex gap-2 text-sm leading-relaxed">
                    <span className="font-bold text-red-500 min-w-[20px]">{distractor.key}:</span>
                    <span className="text-slate-600">{distractor.reason}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionCard;
