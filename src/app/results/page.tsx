'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { motion, AnimatePresence } from 'framer-motion';

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
  const isMounted = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [progress, setProgress] = useState({ stage: 'init', message: 'מתחיל טעינה...' });
  const [shouldContinuePolling, setShouldContinuePolling] = useState(true);

  const getMagicalMessage = (stage: string, technicalMessage: string) => {
    const messages = {
      init: [
        "מכינים את המסמך המותאם אישית עבורך",
        "מתחילים בתהליך היצירה",
        "מעבדים את הנתונים שהזנת"
      ],
      loading: [
        "מנתחים את המידע ומתאימים את התוכן",
        "יוצרים עבורך תוכן מותאם אישית",
        "מעצבים את המסמך בקפידה",
        "משלימים את הפרטים האחרונים",
        "מתאימים את התוכן לצרכים שלך"
      ],
      success: [
        "המסמך שלך מוכן לצפייה",
        "סיימנו להכין את התוכן המותאם עבורך",
        "התוצאות שלך מוכנות"
      ]
    };

    const stageMessages = messages[stage as keyof typeof messages] || messages.loading;
    return stageMessages[Math.floor(Math.random() * stageMessages.length)];
  };

  useEffect(() => {
    console.log('Component mounted');
    isMounted.current = true;
    return () => {
      console.log('Component unmounted');
      isMounted.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isMounted.current) return;
    
    console.log('State changed:', {
      isLoading,
      status,
      hasResult: !!result,
      error,
      hasTemplate: !!template,
      retryAttempt,
      shouldContinuePolling
    });
  }, [isLoading, status, result, error, template, retryAttempt, shouldContinuePolling]);

  useEffect(() => {
    if (!isMounted.current) return;
    console.log('Starting polling effect with submissionId:', submissionId);
    
    if (!submissionId) {
      console.log('No submissionId, stopping');
      setError('חסר מזהה טופס');
      setIsLoading(false);
      return;
    }

    let timeoutId: NodeJS.Timeout | undefined;
    let retryCount = 0;
    const maxRetries = 5;
    const getBackoffTime = (retry: number) => {
      return [1000, 2000, 5000, 10000, 20000][retry] || 20000;
    };
    let foundSubmission = false;

    const pollSubmission = async () => {
      if (!isMounted.current) return;
      
      console.log('Polling attempt:', {
        retryCount,
        shouldContinuePolling,
        hasTimeout: !!timeoutId,
        foundSubmission
      });

      if (!shouldContinuePolling) {
        console.log('Polling stopped by flag');
        return;
      }

      try {
        setProgress({ stage: 'loading', message: 'מכין את התוצאות עבורך...' });
        const response = await fetch(`/api/submission?s=${submissionId}`);
        const data = await response.json();

        if (!isMounted.current) return;

        if (!response.ok) {
          throw new Error(data.error || 'שגיאה בטעינת הנתונים');
        }

        const { submission, template: templateData } = data;
        console.log('Received response:', {
          status: submission?.status,
          hasResult: !!submission?.result,
          hasTemplate: !!templateData
        });

        // Found the submission - switch to regular polling mode
        if (submission) {
          foundSubmission = true;
        }

        if (submission?.status === 'completed') {
          console.log('Received completed status');
          setShouldContinuePolling(false);
          setProgress({ stage: 'success', message: submission.progress?.message || 'העיבוד הושלם בהצלחה' });
          setResult(submission.result);
          setStatus('completed');
          setTemplate(templateData);
          setIsLoading(false);
          if (timeoutId) {
            console.log('Clearing timeout on completion');
            clearTimeout(timeoutId);
          }
          return;
        } else if (submission?.status === 'error') {
          console.log('Received error status');
          setShouldContinuePolling(false);
          setError('שגיאה בעיבוד הטופס: ' + (submission.result?.error || 'שגיאה לא ידועה'));
          setStatus('error');
          setIsLoading(false);
          if (timeoutId) {
            console.log('Clearing timeout on error');
            clearTimeout(timeoutId);
          }
          return;
        } else if (submission?.progress) {
          console.log('Received progress update:', submission.progress);
          setProgress(submission.progress);
        }

        // If we haven't found the submission yet, use retry logic
        if (!foundSubmission) {
          if (retryCount < maxRetries && shouldContinuePolling && isMounted.current) {
            retryCount++;
            setRetryAttempt(retryCount);
            const nextDelay = getBackoffTime(retryCount);
            console.log(`Scheduling next poll in ${nextDelay}ms (retry ${retryCount})`);
            timeoutId = setTimeout(pollSubmission, nextDelay);
          } else if (retryCount >= maxRetries) {
            console.log('Max retries reached without finding submission');
            setShouldContinuePolling(false);
            setError('לא נמצא טופס מתאים');
            setStatus('error');
            setIsLoading(false);
          }
        } else {
          // Regular polling every 3 seconds once we've found the submission
          if (shouldContinuePolling && isMounted.current) {
            console.log('Scheduling next poll in 3000ms (regular polling)');
            timeoutId = setTimeout(pollSubmission, 3000);
          }
        }
      } catch (error) {
        if (!isMounted.current) return;
        
        console.log('Poll attempt error:', error);
        if (!foundSubmission) {
          // Only use retry logic if we haven't found the submission yet
          if (retryCount < maxRetries && shouldContinuePolling) {
            retryCount++;
            setRetryAttempt(retryCount);
            const nextDelay = getBackoffTime(retryCount);
            console.log(`Scheduling next poll after error in ${nextDelay}ms (retry ${retryCount})`);
            timeoutId = setTimeout(pollSubmission, nextDelay);
          } else {
            console.log('Max retries reached after error');
            setShouldContinuePolling(false);
            setError(error instanceof Error ? error.message : 'שגיאה בטעינת הנתונים');
            setStatus('error');
            setIsLoading(false);
          }
        } else {
          // Regular polling retry if we've already found the submission
          if (shouldContinuePolling) {
            console.log('Scheduling next poll after error in 3000ms (regular polling)');
            timeoutId = setTimeout(pollSubmission, 3000);
          }
        }
      }
    };

    console.log('Starting initial poll');
    setShouldContinuePolling(true);
    pollSubmission();

    return () => {
      console.log('Cleaning up polling effect');
      setShouldContinuePolling(false);
      if (timeoutId) {
        console.log('Clearing timeout in cleanup');
        clearTimeout(timeoutId);
      }
    };
  }, [submissionId]);

  const renderChat = (result: any) => {
    if (!result?.finalResponse) return null;
    
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

    const contentVariants = {
      hidden: { opacity: 0, y: 20 },
      visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
          delay: i * 0.2,
          duration: 0.5,
          ease: "easeOut"
        }
      })
    };

    return (
      <motion.div 
        className="my-8 fade-in"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {template?.opening_page_content && (
          <motion.div 
            className="prose prose-lg max-w-none mb-12"
            initial="hidden"
            animate="visible"
            variants={contentVariants}
            custom={0}
          >
            {template?.logo && template.element_styles?.header?.showLogo !== false && (
              <motion.div 
                style={{
                  textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                            template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                  margin: template.element_styles?.header?.logoMargin || '1rem'
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
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
              </motion.div>
            )}
            <ReactMarkdown 
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => (
                  <motion.h1 
                    style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    {children}
                  </motion.h1>
                ),
                h2: ({ children }) => (
                  <motion.h2 
                    style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    {children}
                  </motion.h2>
                ),
                h3: ({ children }) => (
                  <motion.h3 
                    style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    {children}
                  </motion.h3>
                ),
                p: ({ children }) => (
                  <motion.p 
                    style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                  >
                    {children}
                  </motion.p>
                ),
                ul: ({ children }) => (
                  <motion.ul 
                    style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                  >
                    {children}
                  </motion.ul>
                ),
                li: ({ children }) => (
                  <motion.li 
                    style={{ marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {children}
                  </motion.li>
                ),
              }}
            >
              {processContent(template.opening_page_content)}
            </ReactMarkdown>
          </motion.div>
        )}

        {Array.isArray(result.finalResponse) ? (
          result.finalResponse.map((content: string, index: number) => (
            <motion.div 
              key={index} 
              className={`prose prose-lg max-w-none ${index > 0 ? 'mt-12' : ''}`}
              initial="hidden"
              animate="visible"
              variants={contentVariants}
              custom={index + 1}
            >
              {index === 0 && template?.logo && template.element_styles?.header?.showLogo !== false && !template?.opening_page_content && (
                <motion.div 
                  style={{
                    textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                              template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                    margin: template.element_styles?.header?.logoMargin || '1rem'
                  }}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
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
                </motion.div>
              )}
              <ReactMarkdown 
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children }) => (
                    <motion.h1 
                      style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                    >
                      {children}
                    </motion.h1>
                  ),
                  h2: ({ children }) => (
                    <motion.h2 
                      style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.4 }}
                    >
                      {children}
                    </motion.h2>
                  ),
                  h3: ({ children }) => (
                    <motion.h3 
                      style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      {children}
                    </motion.h3>
                  ),
                  p: ({ children }) => (
                    <motion.p 
                      style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.6 }}
                    >
                      {children}
                    </motion.p>
                  ),
                  ul: ({ children }) => (
                    <motion.ul 
                      style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, delay: 0.7 }}
                    >
                      {children}
                    </motion.ul>
                  ),
                  li: ({ children }) => (
                    <motion.li 
                      style={{ marginBottom: '0.5rem' }}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {children}
                    </motion.li>
                  ),
                }}
              >
                {processContent(content)}
              </ReactMarkdown>
            </motion.div>
          ))
        ) : (
          <motion.div 
            className="prose prose-lg max-w-none"
            initial="hidden"
            animate="visible"
            variants={contentVariants}
            custom={1}
          >
            {template?.logo && template.element_styles?.header?.showLogo !== false && !template?.opening_page_content && (
              <motion.div 
                style={{
                  textAlign: template.element_styles?.header?.logoPosition?.includes('center') ? 'center' : 
                            template.element_styles?.header?.logoPosition?.includes('left') ? 'left' : 'right',
                  margin: template.element_styles?.header?.logoMargin || '1rem'
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
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
              </motion.div>
            )}
            <ReactMarkdown 
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => (
                  <motion.h1 
                    style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    {children}
                  </motion.h1>
                ),
                h2: ({ children }) => (
                  <motion.h2 
                    style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    {children}
                  </motion.h2>
                ),
                h3: ({ children }) => (
                  <motion.h3 
                    style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    {children}
                  </motion.h3>
                ),
                p: ({ children }) => (
                  <motion.p 
                    style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                  >
                    {children}
                  </motion.p>
                ),
                ul: ({ children }) => (
                  <motion.ul 
                    style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                  >
                    {children}
                  </motion.ul>
                ),
                li: ({ children }) => (
                  <motion.li 
                    style={{ marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {children}
                  </motion.li>
                ),
              }}
            >
              {processContent(result.finalResponse)}
            </ReactMarkdown>
          </motion.div>
        )}

        {template?.closing_page_content && (
          <motion.div 
            className="prose prose-lg max-w-none mt-12"
            initial="hidden"
            animate="visible"
            variants={contentVariants}
            custom={2}
          >
            <ReactMarkdown 
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => (
                  <motion.h1 
                    style={{ ...template?.element_styles?.h1, marginTop: '2rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    {children}
                  </motion.h1>
                ),
                h2: ({ children }) => (
                  <motion.h2 
                    style={{ ...template?.element_styles?.h2, marginTop: '1.5rem', marginBottom: '0.75rem' }}
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    {children}
                  </motion.h2>
                ),
                h3: ({ children }) => (
                  <motion.h3 
                    style={{ ...template?.element_styles?.h3, marginTop: '1.25rem', marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    {children}
                  </motion.h3>
                ),
                p: ({ children }) => (
                  <motion.p 
                    style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                  >
                    {children}
                  </motion.p>
                ),
                ul: ({ children }) => (
                  <motion.ul 
                    style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                  >
                    {children}
                  </motion.ul>
                ),
                li: ({ children }) => (
                  <motion.li 
                    style={{ marginBottom: '0.5rem' }}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {children}
                  </motion.li>
                ),
              }}
            >
              {processContent(template.closing_page_content)}
            </ReactMarkdown>
          </motion.div>
        )}
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white"
      >
        <div className="flex flex-col items-center gap-6 p-8 rounded-xl bg-white/80 backdrop-blur-sm shadow-lg">
          <div className="relative">
            <div className="w-24 h-24 rounded-full border-8 border-gray-200/50"></div>
            <motion.div 
              className="absolute inset-0 border-8 border-blue-500/80 rounded-full border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <motion.p 
              className="text-lg font-medium text-gray-700"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {getMagicalMessage(progress.stage, progress.message)}
            </motion.p>
            <motion.div 
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <motion.span
                    key={i}
                    className="w-2 h-2 bg-blue-500/80 rounded-full"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="container max-w-4xl mx-auto p-8"
      >
        <div className="bg-red-50/50 p-8 rounded-xl backdrop-blur-sm border border-red-100 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-medium text-red-800 mb-1">שגיאה בטעינת התוצאות</h3>
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        </div>
      </motion.div>
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
        <motion.div 
          className="container mx-auto px-4" 
          style={containerStyles}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <AnimatePresence mode="wait">
            {userName && (
              <motion.h1 
                style={template?.element_styles?.h1} 
                className="text-3xl font-bold mb-8"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                שלום {userName}
              </motion.h1>
            )}
            {status === 'completed' && result && renderChat(result)}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
} 