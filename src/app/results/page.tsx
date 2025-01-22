'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

type CustomFont = {
  font_family: string;
  file_path: string;
  format?: string;
};

type Logo = {
  id: string;
  template_id: string;
  file_path: string;
};

type Template = {
  id: string;
  name: string;
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
  custom_fonts?: CustomFont[];
  header_content?: string;
  footer_content?: string;
  form_id?: string;
  show_logo?: boolean;
  logo_position?: string;
  show_logo_on_all_pages?: boolean;
  logo?: Logo;
  styles?: {
    bodyBackground?: string;
    mainBackground?: string;
    contentBackground?: string;
  };
};

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('s') || new URLSearchParams(window.location.search).get('submissionID');
  
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (!submissionId) {
      setError('חסר מזהה טופס');
      setIsLoading(false);
      return;
    }

    const pollSubmission = async () => {
      try {
        const response = await fetch(`/api/submission?s=${submissionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'שגיאה בטעינת הנתונים');
        }

        if (data.submission.status === 'completed') {
          setResult(data.submission.result);
          setStatus('completed');
          setTemplate(data.template);
          setIsLoading(false);
        } else if (data.submission.status === 'error') {
          setError('שגיאה בעיבוד הטופס: ' + (data.submission.result?.error || 'שגיאה לא ידועה'));
          setStatus('error');
          setIsLoading(false);
        } else {
          // Keep polling if still processing
          setTimeout(pollSubmission, 2000);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'שגיאה בטעינת הנתונים');
        setStatus('error');
        setIsLoading(false);
      }
    };

    pollSubmission();
  }, [submissionId]);

  useEffect(() => {
    if (!submissionId) {
      setError('חסר מזהה טופס');
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Add retry logic for fetching submission
        let attempts = 0;
        let data;
        
        while (attempts < 3) {
          const response = await fetch(`/api/submission?s=${submissionId}`);
          data = await response.json();
          
          if (response.ok && data.submission) {
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }

        if (!data || !data.submission) {
          throw new Error('Failed to fetch submission after retries');
        }

        const { submission, template: templateData } = data;

        // בדיקה האם יש תוצאות מפורטות
        const hasDetailedResults = submission.status === 'completed' && 
          submission.result?.finalResponse;

        setStatus(hasDetailedResults ? 'completed' : 'pending');
        if (hasDetailedResults) {
          setResult(submission.result);
        }

        try {
          const formData = submission.content?.form_data || {};
          const name = formData.q26_input26;
          if (name && typeof name === 'string') {
            setUserName(name.trim());
          }
        } catch (e) {
          console.error('Error extracting name:', e);
        }

        setTemplate(templateData);
        
        // רק אם יש תוצאות מפורטות נפסיק את הטעינה
        setIsLoading(false);

        // Add CSS and fonts
        if (templateData?.css) {
          const styleSheet = document.createElement('style');
          styleSheet.textContent = templateData.css;
          document.head.appendChild(styleSheet);
        }

        // Add custom fonts if they exist
        if (templateData?.custom_fonts?.length > 0) {
          const fontFaces = templateData.custom_fonts.map((font: CustomFont) => {
            const format = font.format === 'ttf' ? 'truetype' : font.format;
            const fullUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${font.file_path}`;
            return `
              @font-face {
                font-family: '${font.font_family}';
                src: url('${fullUrl}') format('${format}');
                font-weight: 400;
                font-style: normal;
                font-display: swap;
              }
            `;
          }).join('\n');

          const fontStyleSheet = document.createElement('style');
          fontStyleSheet.textContent = fontFaces;
          document.head.appendChild(fontStyleSheet);
        }

      } catch (e) {
        console.error('Error fetching data:', e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [submissionId]);

  const renderChat = (result: any) => {
    if (!result?.finalResponse) return null;
    
    return (
      <div className="my-8 fade-in">
        <ReactMarkdown 
          className="prose prose-lg max-w-none"
          components={{
            h1: ({ children }) => <h1 style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}>{children}</h3>,
            p: ({ children }) => <p style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}>{children}</p>,
            ul: ({ children }) => <ul style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}>{children}</ul>,
            li: ({ children }) => <li style={{ marginBottom: '0.5rem' }}>{children}</li>,
          }}
        >
          {result.finalResponse}
        </ReactMarkdown>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-24 h-24">
            <div className="absolute border-8 border-gray-200/50 rounded-full w-full h-full"></div>
            <div className="absolute border-8 border-blue-500/80 rounded-full w-full h-full animate-spin border-t-transparent"></div>
          </div>
          <p className="text-lg text-gray-600 animate-pulse">מכין את התוצאות עבורך...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-4xl mx-auto p-8">
        <div className="bg-red-50/50 text-red-600 p-6 rounded-lg backdrop-blur-sm border border-red-100">
          <p className="text-lg">{error}</p>
        </div>
      </div>
    );
  }

  const bodyStyles = {
    ...template?.element_styles?.body,
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #ffffff, #f8fafc, #ffffff)',
  };

  return (
    <div dir="rtl" className="min-h-screen" style={bodyStyles}>
      {/* Logo Section */}
      {(() => {
        console.log('Logo rendering:', {
          show_logo: template?.show_logo,
          has_logo: !!template?.logo,
          logo_position: template?.logo_position,
          logo_file_path: template?.logo?.file_path
        });
        
        return template?.show_logo && template?.logo && (
          <div 
            className={`flex ${getLogoAlignment(template.logo_position || 'top-left')}`}
            style={{
              margin: template.element_styles?.header?.logoMargin || '1rem',
              padding: '1rem',
              width: '100%'
            }}
          >
            <img
              src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${template.logo.file_path}`}
              alt="Logo"
              style={{
                width: template.element_styles?.header?.logoWidth || '100px',
                height: template.element_styles?.header?.logoHeight || 'auto',
                objectFit: 'contain'
              }}
            />
          </div>
        );
      })()}

      {template?.header_content && (
        <div className="mb-12" dangerouslySetInnerHTML={{ __html: template.header_content }} />
      )}
      
      <main className="container max-w-4xl mx-auto px-6 py-12">
        <header className="mb-16 text-center">
          <h1 
            className="text-4xl font-bold mb-6 animate-fade-in bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent" 
            style={{
              ...template?.element_styles?.h1,
              textShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
          >
            {template?.name || 'תוצאות האבחון'}
          </h1>
          {userName && (
            <div className="animate-fade-in-delay">
              <p 
                className="text-xl text-gray-600 mb-2"
                style={template?.element_styles?.p}
              >
                שלום {userName},
              </p>
              <p 
                className="text-lg text-gray-500"
                style={template?.element_styles?.p}
              >
                תודה שהקדשת מזמנך למילוי השאלון.
                {status === 'completed' ? ' להלן התוצאות המפורטות:' : ' התוצאות נמצאות בתהליך עיבוד.'}
              </p>
            </div>
          )}
        </header>
        
        {status === 'pending' && (
          <div className="space-y-8 animate-pulse">
            <div className="flex flex-col items-center gap-6 py-16 px-8 rounded-2xl bg-gradient-to-b from-white to-gray-50/50 backdrop-blur-sm border border-gray-100 shadow-sm">
              <div className="relative w-16 h-16">
                <div className="absolute border-4 border-gray-200/30 rounded-full w-full h-full"></div>
                <div className="absolute border-4 border-blue-500/80 rounded-full w-full h-full animate-spin border-t-transparent"></div>
              </div>
              <div className="text-center space-y-2">
                <p 
                  className="text-lg text-gray-600 font-medium"
                  style={template?.element_styles?.p}
                >
                  {result?.progress?.message || 'מעבד את התוצאות...'}
                </p>
                {result?.progress?.current && result?.progress?.total && (
                  <div className="w-64 mx-auto">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-500"
                        style={{ 
                          width: `${(result.progress.current / result.progress.total) * 100}%` 
                        }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      {result.progress.current} מתוך {result.progress.total}
                    </p>
                  </div>
                )}
                <p 
                  className="text-sm text-gray-500"
                  style={template?.element_styles?.p}
                >
                  אנא המתן מספר רגעים בזמן שאנחנו מכינים את התוצאות המפורטות עבורך
                </p>
              </div>
            </div>
          </div>
        )}

        {status === 'completed' && result && (
          <div className="space-y-8 animate-fade-in">
            <div className="prose prose-lg max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-strong:text-gray-800 prose-ul:text-gray-600">
              {renderChat(result)}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50/50 p-8 rounded-lg backdrop-blur-sm border border-red-100 shadow-sm space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-medium">שגיאה בעיבוד התוצאות</h3>
            </div>
            <div className="text-gray-600 space-y-2">
              <p className="font-medium">{error}</p>
              {result?.error && (
                <p className="text-sm">{result.error}</p>
              )}
              {result?.details && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-md text-sm overflow-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </main>

      {template?.footer_content && (
        <footer className="mt-24 border-t border-gray-100 pt-12" dangerouslySetInnerHTML={{ __html: template.footer_content }} />
      )}

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
        .animate-fade-in-delay {
          opacity: 0;
          animation: fade-in 0.8s ease-out forwards;
          animation-delay: 0.3s;
        }
        .prose {
          max-width: none;
        }
        .prose h1, .prose h2, .prose h3 {
          color: #1a202c;
          font-weight: 700;
          margin-top: 2em;
          margin-bottom: 1em;
        }
        .prose p {
          margin-bottom: 1.5em;
          line-height: 1.8;
        }
        .prose ul {
          margin-top: 1em;
          margin-bottom: 1em;
          padding-right: 1.5em;
        }
        .prose li {
          margin-top: 0.5em;
          margin-bottom: 0.5em;
        }
        .prose strong {
          font-weight: 600;
        }
        .prose a {
          color: #2563eb;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .prose a:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }
        body {
          background-color: ${result?.template?.styles?.bodyBackground || '#ffffff'};
        }
        
        main {
          background-color: ${result?.template?.styles?.mainBackground || '#ffffff'};
          padding: 2rem;
          max-width: 800px;
          margin: 0 auto;
        }

        .prose {
          background-color: ${result?.template?.styles?.contentBackground || '#ffffff'};
          padding: 2rem;
          border-radius: 0.5rem;
        }

        .prose a {
          color: #2563eb;
          text-decoration: none;
          transition: all 0.2s;
        }

        .prose a:hover {
          color: #1d4ed8;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

function getLogoAlignment(position: string): string {
  switch (position) {
    case 'top-left':
      return 'justify-end';
    case 'top-right':
      return 'justify-start';
    case 'top-center':
      return 'justify-center';
    default:
      return 'justify-end';
  }
} 