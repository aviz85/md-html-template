'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

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
    main?: React.CSSProperties;
    prose?: React.CSSProperties;
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
  custom_contents?: Record<string, string>;
  opening_page_content?: string;
  closing_page_content?: string;
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

    let timeoutId: NodeJS.Timeout | undefined;
    let retryCount = 0;
    const maxRetries = 5;
    const getBackoffTime = (retry: number) => {
      // 1s, 2s, 5s, 10s, 20s
      return [1000, 2000, 5000, 10000, 20000][retry] || 20000;
    };

    const pollSubmission = async () => {
      try {
        const response = await fetch(`/api/submission?s=${submissionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'שגיאה בטעינת הנתונים');
        }

        const { submission, template: templateData } = data;

        if (submission?.status === 'completed') {
          setResult(submission.result);
          setStatus('completed');
          setTemplate(templateData);
          setIsLoading(false);
          return;
        } else if (submission?.status === 'error') {
          setError('שגיאה בעיבוד הטופס: ' + (submission.result?.error || 'שגיאה לא ידועה'));
          setStatus('error');
          setIsLoading(false);
          return;
        }

        if (retryCount < maxRetries) {
          retryCount++;
          timeoutId = setTimeout(pollSubmission, getBackoffTime(retryCount));
        } else {
          setError('לא נמצא טופס מתאים');
          setStatus('error');
          setIsLoading(false);
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          timeoutId = setTimeout(pollSubmission, getBackoffTime(retryCount));
        } else {
          setError(error instanceof Error ? error.message : 'שגיאה בטעינת הנתונים');
          setStatus('error');
          setIsLoading(false);
        }
      }
    };

    // Start polling
    pollSubmission();

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [submissionId]);

  const renderChat = (result: any) => {
    if (!result?.finalResponse) return null;
    
    // Process content and replace special tags
    const processContent = (content: string) => {
      let processedContent = content;
      
      if (template?.custom_contents) {
        Object.entries(template.custom_contents).forEach(([tag, replacement]) => {
          const cleanTag = tag.replace('custom_', '');
          const upperPattern = new RegExp(`\\[${cleanTag.toUpperCase()}\\]`, 'g');
          const lowerPattern = new RegExp(`\\[${cleanTag.toLowerCase()}\\]`, 'g');
          const originalPattern = new RegExp(`\\[${cleanTag}\\]`, 'g');
          
          processedContent = processedContent
            .replace(upperPattern, replacement)
            .replace(lowerPattern, replacement)
            .replace(originalPattern, replacement);
        });
      }
      
      return processedContent;
    };

    return (
      <div className="my-8 fade-in">
        {template?.opening_page_content && (
          <div className="prose prose-lg max-w-none mb-12">
            {template?.logo && template.element_styles?.header?.showLogo !== false && (
              <div style={{
                textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                          template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                margin: template.element_styles?.header?.logoMargin || '1rem'
              }}>
                <img 
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${template.logo.file_path}`}
                  style={{
                    height: template.element_styles?.header?.logoHeight || '100px',
                    width: 'auto',
                    maxWidth: '100%',
                    display: 'inline-block'
                  }}
                  alt="Logo"
                />
              </div>
            )}
            <ReactMarkdown 
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => <h1 style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}>{children}</h3>,
                p: ({ children }) => <p style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: '0.5rem' }}>{children}</li>,
              }}
            >
              {processContent(template.opening_page_content)}
            </ReactMarkdown>
          </div>
        )}

        {Array.isArray(result.finalResponse) ? (
          result.finalResponse.map((content: string, index: number) => (
            <div key={index} className={`prose prose-lg max-w-none ${index > 0 ? 'mt-12' : ''}`}>
              {index === 0 && template?.logo && template.element_styles?.header?.showLogo !== false && !template?.opening_page_content && (
                <div style={{
                  textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                            template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                  margin: template.element_styles?.header?.logoMargin || '1rem'
                }}>
                  <img 
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${template.logo.file_path}`}
                    style={{
                      height: template.element_styles?.header?.logoHeight || '100px',
                      width: 'auto',
                      maxWidth: '100%',
                      display: 'inline-block'
                    }}
                    alt="Logo"
                  />
                </div>
              )}
              <ReactMarkdown 
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children }) => <h1 style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}>{children}</h3>,
                  p: ({ children }) => <p style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom: '0.5rem' }}>{children}</li>,
                }}
              >
                {processContent(content)}
              </ReactMarkdown>
            </div>
          ))
        ) : (
          <div className="prose prose-lg max-w-none">
            {template?.logo && template.element_styles?.header?.showLogo !== false && !template?.opening_page_content && (
              <div style={{
                textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                          template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                margin: template.element_styles?.header?.logoMargin || '1rem'
              }}>
                <img 
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/storage/${template.logo.file_path}`}
                  style={{
                    height: template.element_styles?.header?.logoHeight || '100px',
                    width: 'auto',
                    maxWidth: '100%',
                    display: 'inline-block'
                  }}
                  alt="Logo"
                />
              </div>
            )}
            <ReactMarkdown 
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => <h1 style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}>{children}</h3>,
                p: ({ children }) => <p style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: '0.5rem' }}>{children}</li>,
              }}
            >
              {processContent(result.finalResponse)}
            </ReactMarkdown>
          </div>
        )}

        {template?.closing_page_content && (
          <ReactMarkdown 
            className="prose prose-lg max-w-none mt-12"
            rehypePlugins={[rehypeRaw]}
            components={{
              h1: ({ children }) => <h1 style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}>{children}</h3>,
              p: ({ children }) => <p style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}>{children}</p>,
              ul: ({ children }) => <ul style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}>{children}</ul>,
              li: ({ children }) => <li style={{ marginBottom: '0.5rem' }}>{children}</li>,
            }}
          >
            {processContent(template.closing_page_content)}
          </ReactMarkdown>
        )}
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
    backgroundColor: template?.element_styles?.body?.backgroundColor || 'transparent',
    minHeight: '100vh'
  };

  const mainStyles = {
    backgroundColor: template?.element_styles?.main?.backgroundColor || 'transparent',
    padding: '2rem'
  };

  const containerStyles = {
    maxWidth: '800px',
    backgroundColor: template?.element_styles?.prose?.backgroundColor || 'transparent',
    padding: '2rem',
    borderRadius: '0.5rem'
  };

  return (
    <div dir="rtl" className="min-h-screen" style={bodyStyles}>
      <main style={mainStyles}>
        <div className="container mx-auto px-4" style={containerStyles}>
          {userName && (
            <h1 style={template?.element_styles?.h1} className="text-3xl font-bold mb-8">
              שלום {userName}
            </h1>
          )}
          {status === 'completed' && result && renderChat(result)}
        </div>
      </main>
    </div>
  );
} 