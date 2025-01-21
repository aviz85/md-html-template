'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Template = {
  css: string;
  element_styles: {
    p?: React.CSSProperties;
    h1?: React.CSSProperties;
    h2?: React.CSSProperties;
    h3?: React.CSSProperties;
    h4?: React.CSSProperties;
    h5?: React.CSSProperties;
    h6?: React.CSSProperties;
    body?: React.CSSProperties;
    list?: React.CSSProperties;
    header?: {
      showLogo?: boolean;
      logoWidth?: string;
      logoHeight?: string;
      logoMargin?: string;
      logoPosition?: string;
    };
    specialParagraph?: React.CSSProperties;
  };
  custom_fonts?: Array<{
    font_family: string;
    file_path: string;
  }>;
  header_content?: string;
  footer_content?: string;
};

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const formId = searchParams.get('formId');
  const submissionId = searchParams.get('submissionId');
  
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (!formId || !submissionId) {
      setError('חסרים פרמטרים בכתובת');
      return;
    }

    const loadTemplate = async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('form_id', formId)
        .single();

      if (error) {
        console.error('Error loading template:', error);
        return;
      }

      setTemplate(data);

      // הוספת הגדרות CSS דינמיות
      if (data.css) {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = data.css;
        document.head.appendChild(styleSheet);
      }

      // טעינת פונטים מותאמים אישית
      if (data.custom_fonts) {
        data.custom_fonts.forEach((font: { font_family: string; file_path: string }) => {
          const fontFace = new FontFace(font.font_family, `url(${font.file_path})`);
          fontFace.load().then(loadedFont => {
            document.fonts.add(loadedFont);
          });
        });
      }
    };

    loadTemplate();
  }, [formId]);

  useEffect(() => {
    const checkStatus = async () => {
      const { data, error } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      if (data) {
        setStatus(data.status);
        if (data.status === 'completed') {
          setResult(data.result);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [submissionId]);

  const renderChat = (chat: any[]) => {
    return chat.map((msg, index) => (
      <div key={index} className={`mb-4 ${msg.role === 'assistant' ? 'bg-blue-50' : 'bg-gray-50'} p-4 rounded-lg`}>
        <ReactMarkdown 
          className="prose max-w-none"
          components={{
            h1: ({ children }) => <h1 style={template?.element_styles?.h1}>{children}</h1>,
            h2: ({ children }) => <h2 style={template?.element_styles?.h2}>{children}</h2>,
            h3: ({ children }) => <h3 style={template?.element_styles?.h3}>{children}</h3>,
            p: ({ children }) => <p style={template?.element_styles?.p}>{children}</p>,
            ul: ({ children }) => <ul style={template?.element_styles?.list}>{children}</ul>,
          }}
        >
          {msg.content}
        </ReactMarkdown>
      </div>
    ));
  };

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded">
          {error}
        </div>
      </div>
    );
  }

  const bodyStyles = template?.element_styles?.body || {};

  return (
    <div dir="rtl" className="container mx-auto p-8" style={bodyStyles}>
      {template?.header_content && (
        <div className="mb-8" dangerouslySetInnerHTML={{ __html: template.header_content }} />
      )}
      
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-4" style={template?.element_styles?.h1}>תוצאות</h1>
        
        {status === 'pending' && (
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p style={template?.element_styles?.p}>מעבד את התוצאות, אנא המתן...</p>
          </div>
        )}

        {status === 'completed' && result && (
          <div className="space-y-6">
            {result.completeChat && renderChat(result.completeChat)}
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 text-red-500 p-4 rounded">
            אירעה שגיאה בעיבוד התוצאות
          </div>
        )}
      </div>

      {template?.footer_content && (
        <div className="mt-8" dangerouslySetInnerHTML={{ __html: template.footer_content }} />
      )}
    </div>
  );
} 