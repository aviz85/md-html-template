'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import type { Components } from 'react-markdown';
import { configureMarked } from '@/lib/constants';

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

// Extract shared components
const ImageRenderer = ({ node, ...props }: { node?: any } & React.ImgHTMLAttributes<HTMLImageElement>) => {
  // Get original styles from data attribute - React converts data-original-styles to dataOriginalStyles
  const originalStyles = node?.properties?.dataOriginalStyles;
  
  console.log('ImageRenderer: Initial props and data:', {
    originalStyles,
    propsStyle: props.style,
    nodeProperties: node?.properties,
    allProps: props
  });
  
  if (originalStyles) {
    // Parse the original styles into an object
    const parsedStyles = Object.fromEntries(
      originalStyles.split(';')
        .map((s: string) => {
          const [key, value] = s.split(':').map(p => p.trim());
          // Convert kebab-case to camelCase for React
          const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
          const cleanValue = value.replace(' !important', '');

          // Handle special parameters
          if (key === 'align') {
            return ['textAlign', cleanValue];
          }
          if (key === 'float') {
            return ['float', cleanValue];
          }
          if (key === 'margin-block') {
            return ['marginBlock', cleanValue];
          }
          if (key === 'display') {
            return ['display', cleanValue === 'center' ? 'block' : cleanValue];
          }
          if (key === 'margin') {
            return ['margin', cleanValue === 'center' ? '0 auto' : cleanValue];
          }

          console.log('ImageRenderer: Parsing style:', { key, value, camelKey, cleanValue });
          return [camelKey, cleanValue];
        })
    );
    
    console.log('ImageRenderer: Parsed styles:', parsedStyles);
    
    // Override default styles with our parsed styles, ensuring they take precedence
    const finalStyles = {
      maxWidth: '100%',
      height: 'auto',
      ...props.style,
      ...parsedStyles
    };
    
    // Handle special case for center alignment
    if (parsedStyles.textAlign === 'center') {
      finalStyles.display = 'block';
      finalStyles.margin = '0 auto';
    }
    
    console.log('ImageRenderer: Final styles with original styles:', finalStyles);
    
    return <img {...props} style={finalStyles} />;
  }
  
  // Default to responsive behavior only if no original styles
  const defaultStyles = { maxWidth: '100%', height: 'auto', ...props.style };
  console.log('ImageRenderer: Using default styles (no original styles):', defaultStyles);
  return <img {...props} style={defaultStyles} />;
};

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get('s') || new URLSearchParams(window.location.search).get('submissionID');
  const isMounted = useRef(false);
  const hasCompletedRef = useRef(false);
  
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
    const POLL_INTERVAL = 1000; // 1 second between polls
    const MAX_POLL_TIME = 2 * 60 * 1000; // 2 minutes total
    const pollStartTime = Date.now();

    const pollSubmission = async () => {
      if (!isMounted.current || hasCompletedRef.current) return;
      
      // Check if we've exceeded the maximum polling time
      if (Date.now() - pollStartTime > MAX_POLL_TIME) {
        console.log('Max polling time exceeded');
        setShouldContinuePolling(false);
        setError('תהליך העיבוד נמשך יותר מדי זמן');
        setStatus('error');
        setIsLoading(false);
        return;
      }

      console.log('Polling attempt:', {
        retryCount,
        shouldContinuePolling,
        hasTimeout: !!timeoutId,
        foundSubmission,
        elapsedTime: Date.now() - pollStartTime,
        hasCompleted: hasCompletedRef.current
      });

      if (!shouldContinuePolling) {
        console.log('Polling stopped by flag');
        return;
      }

      try {
        setProgress({ stage: 'loading', message: 'מכין את התוצאות עבורך...' });
        const response = await fetch(`/api/submission?s=${submissionId}`);
        const data = await response.json();

        if (!isMounted.current || hasCompletedRef.current) return;

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

        if (submission?.status === 'completed' && !hasCompletedRef.current) {
          console.log('Received completed status');
          hasCompletedRef.current = true;
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
          hasCompletedRef.current = true;
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

        // Schedule next poll with appropriate delay
        if (shouldContinuePolling && isMounted.current && !hasCompletedRef.current) {
          const nextDelay = foundSubmission ? POLL_INTERVAL : getBackoffTime(retryCount);
          console.log(`Scheduling next poll in ${nextDelay}ms`);
          timeoutId = setTimeout(pollSubmission, nextDelay);
        }

      } catch (error) {
        if (!isMounted.current || hasCompletedRef.current) return;
        
        console.log('Poll attempt error:', error);
        if (!foundSubmission) {
          if (retryCount < maxRetries && shouldContinuePolling) {
            retryCount++;
            setRetryAttempt(retryCount);
            const nextDelay = getBackoffTime(retryCount);
            console.log(`Scheduling next poll after error in ${nextDelay}ms (retry ${retryCount})`);
            timeoutId = setTimeout(pollSubmission, nextDelay);
          } else {
            console.log('Max retries reached after error');
            hasCompletedRef.current = true;
            setShouldContinuePolling(false);
            setError(error instanceof Error ? error.message : 'שגיאה בטעינת הנתונים');
            setStatus('error');
            setIsLoading(false);
          }
        } else {
          // Use regular interval even after errors if submission was found
          if (shouldContinuePolling && !hasCompletedRef.current) {
            console.log('Scheduling next poll after error with regular interval');
            timeoutId = setTimeout(pollSubmission, POLL_INTERVAL);
          }
        }
      }
    };

    console.log('Starting initial poll');
    setShouldContinuePolling(true);
    hasCompletedRef.current = false;
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
    
    // Helper function to extract video ID from URL - moved outside processContent
    const extractVideoId = (url: string): string | null => {
      try {
        // First try to extract from shorts URL
        const shortsMatch = url.match(/youtube\.com\/shorts\/([^"&?\/\s]{11})/i);
        if (shortsMatch && shortsMatch[1]) {
          console.log('Extracted shorts video ID:', shortsMatch[1], 'from URL:', url);
          return shortsMatch[1];
        }

        // For regular videos, clean the URL and keep only v= parameter
        const cleanUrl = url.split('?').map((part, index) => {
          if (index === 0) return part;
          return part.split('&')
            .filter(param => param.startsWith('v='))
            .join('&');
        }).join('?');

        // Then try regular video patterns
        const regularMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (regularMatch && regularMatch[1]) {
          console.log('Extracted regular video ID:', regularMatch[1], 'from URL:', url);
          return regularMatch[1];
        }

        return null;
      } catch (error) {
        console.error('Error extracting video ID:', error);
        return null;
      }
    };
    
    const processContent = (content: string) => {
      let processedContent = content;
      
      // Helper function to create YouTube embed HTML
      const createYouTubeEmbed = (videoId: string, aspectRatio = '56.25%', additionalStyles = '') => {
        // Pass the information through the class name
        return `<div class="youtube-embed:${videoId}:${aspectRatio}:${additionalStyles}"></div>`;
      };

      // Helper function to parse style parameters - works for both images and YouTube
      const parseStyleParams = (style: string, isYouTube = false): { aspectRatio: string; additionalStyles: string; } | string => {
        try {
          const params = style.split(',').reduce((acc: any, param) => {
            const [key, value] = param.trim().split('=').map(p => p.trim());
            acc[key] = value;
            return acc;
          }, {});

          if (isYouTube) {
            let aspectRatio = '56.25%'; // Default 16:9
            let additionalStyles = '';

            if (params.aspect) {
              switch (params.aspect) {
                case '9:16':
                  aspectRatio = '177.78%';
                  break;
                case '16:9':
                  aspectRatio = '56.25%';
                  break;
                default:
                  console.warn('Invalid aspect ratio:', params.aspect);
              }
            }

            if (params.width) additionalStyles += `max-width: ${params.width};`;
            if (params.margin) additionalStyles += `margin: ${params.margin};`;

            return { aspectRatio, additionalStyles };
          } else {
            // For images
            return Object.entries(params)
              .map(([key, value]) => `${key}: ${value}`)
              .join(';');
          }
        } catch (error) {
          console.error('Error parsing style parameters:', error);
          return isYouTube ? 
            { aspectRatio: '56.25%', additionalStyles: '' } : 
            '';
        }
      };

      // First handle markdown-style YouTube links
      const youtubeMarkdownRegex = /!\[(\[.*?\])\]\(((?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[^)]+)\)/g;
      processedContent = processedContent.replace(youtubeMarkdownRegex, (match, styleMatch, url) => {
        try {
          const videoId = extractVideoId(url);
          if (!videoId) {
            console.log('Could not extract video ID from URL:', url);
            return match;
          }

          const style = styleMatch.slice(1, -1);
          const result = parseStyleParams(style, true);
          if (typeof result === 'string') {
            return createYouTubeEmbed(videoId);
          }
          
          return createYouTubeEmbed(videoId, result.aspectRatio, result.additionalStyles);
        } catch (error) {
          console.error('Error processing YouTube markdown:', error);
          return match;
        }
      });

      // Then handle regular YouTube links (excluding those already processed)
      const youtubeRegex = /(?<!!\[.*?)(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([^)\s]+)(?=\s|$)/g;
      processedContent = processedContent.replace(youtubeRegex, (match) => {
        try {
          const videoId = extractVideoId(match);
          if (!videoId) {
            console.warn('Could not extract video ID from URL:', match);
            return match;
          }

          // If the match starts with #, it's inside a header
          const isInHeader = match.trim().startsWith('#');
          const embedHtml = createYouTubeEmbed(videoId);
          
          if (isInHeader) {
            const urlIndex = match.indexOf('http');
            if (urlIndex === -1) return match;
            
            const beforeUrl = match.substring(0, urlIndex);
            const afterUrl = match.substring(urlIndex + match.substring(urlIndex).indexOf(' '));
            return `${beforeUrl}${embedHtml}${afterUrl}`;
          }
          
          return embedHtml;
        } catch (error) {
          console.error('Error processing YouTube link:', error);
          return match;
        }
      });
      
      // Format: ![[style]](url) - but skip if it's a YouTube URL
      const imageRegex = /!\[(\[.*?\])\]\(((?!(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)).*?)\)/g;
      const matches = Array.from(processedContent.matchAll(imageRegex));
      
      console.log('Image matches:', matches);
      
      matches.forEach(match => {
        try {
          const [fullMatch, styleMatch, src] = match;
          const style = styleMatch.slice(1, -1);
          console.log('Processing match:', { fullMatch, style, src });
          
          if (style) {
            const cssStyle = parseStyleParams(style, false);
            console.log('Generated CSS style:', cssStyle);
            const htmlImg = `<img src="${src}" alt="" data-original-styles="${cssStyle}" />`;
            processedContent = processedContent.replace(fullMatch, htmlImg);
          }
        } catch (error) {
          console.error('Error processing image:', error);
        }
      });
      
      if (template?.custom_contents) {
        // Configure marked with central configuration
        configureMarked();
        
        // Convert custom_contents object to array format expected by convertMarkdownToHtml
        const customContentsArray = Object.entries(template.custom_contents).map(([key, value]) => ({
          name: key,
          content: value
        }));
        
        // Process each custom content replacement
        customContentsArray.forEach(({ name, content }) => {
          const cleanTag = name.replace('custom_', '');
          const upperPattern = new RegExp(`\\[${cleanTag.toUpperCase()}\\]`, 'g');
          const lowerPattern = new RegExp(`\\[${cleanTag.toLowerCase()}\\]`, 'g');
          const originalPattern = new RegExp(`\\[${cleanTag}\\]`, 'g');
          
          // Don't parse markdown here since it will be parsed later by the main markdown processor
          processedContent = processedContent
            .replace(upperPattern, content)
            .replace(lowerPattern, content)
            .replace(originalPattern, content);
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
          delay: i * 0.1,
          duration: 0.5,
          ease: "easeOut"
        }
      })
    };

    const markdownComponents: Components = {
      img: ImageRenderer,
      // Add table components
      table: ({ node, ...props }) => {
        // Check if this is a table with headers
        const hasHeaders = node?.children?.[0]?.tagName === 'thead';
        
        return (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full divide-y divide-gray-200 border" {...props} />
          </div>
        );
      },
      thead: ({ node, ...props }) => (
        <thead className="bg-gray-50" {...props} />
      ),
      tbody: ({ node, ...props }) => (
        <tbody className="bg-white divide-y divide-gray-200" {...props} />
      ),
      tr: ({ node, ...props }) => (
        <tr className="hover:bg-gray-50" {...props} />
      ),
      th: ({ node, ...props }) => (
        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b" {...props} />
      ),
      td: ({ node, ...props }) => (
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 border-b" {...props} />
      ),
      // Add custom component for divs to handle YouTube embeds
      div: ({ node, className, ...props }) => {
        if (className?.startsWith('youtube-embed:')) {
          const [_, videoId, aspectRatio, additionalStyles] = className.split(':');
          
          console.log('YouTube div component - Props:', { videoId, aspectRatio, additionalStyles });
          
          if (!videoId) return null;
          
          const iframe = `<iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
          
          const style = {
            position: 'relative' as const,
            paddingBottom: aspectRatio || '56.25%',
            height: 0,
            overflow: 'hidden' as const,
            maxWidth: '100%',
            margin: '2rem 0',
            ...(additionalStyles ? JSON.parse(additionalStyles) : {}),
            ...(props.style || {})
          };
          
          return <div style={style} dangerouslySetInnerHTML={{ __html: iframe }} />;
        }
        return <div className={className} {...props} />;
      },
      h1: ({ node, children, ...props }) => (
        <motion.h1 
          style={{ 
            ...template?.element_styles?.h1,
            margin: template?.element_styles?.h1?.margin
          }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {children}
        </motion.h1>
      ),
      h2: ({ node, children, ...props }) => (
        <motion.h2 
          style={{ 
            ...template?.element_styles?.h2,
            margin: template?.element_styles?.h2?.margin
          }}
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          {children}
        </motion.h2>
      ),
      h3: ({ node, children, ...props }) => (
        <motion.h3 
          style={{ 
            ...template?.element_styles?.h3,
            margin: template?.element_styles?.h3?.margin
          }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {children}
        </motion.h3>
      ),
      h4: ({ node, children, ...props }) => (
        <motion.h4 
          style={{ 
            ...template?.element_styles?.h4,
            margin: template?.element_styles?.h4?.margin
          }}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {children}
        </motion.h4>
      ),
      h5: ({ node, children, ...props }) => (
        <motion.h5 
          style={{ 
            ...template?.element_styles?.h5,
            margin: template?.element_styles?.h5?.margin
          }}
          initial={{ opacity: 0, x: -3 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          {children}
        </motion.h5>
      ),
      h6: ({ node, children, ...props }) => (
        <motion.h6 
          style={{ 
            ...template?.element_styles?.h6,
            margin: template?.element_styles?.h6?.margin
          }}
          initial={{ opacity: 0, x: -2 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          {children}
        </motion.h6>
      ),
      p: ({ node, children, ...props }) => (
        <motion.p 
          style={{ ...template?.element_styles?.p, marginBottom: '1rem', lineHeight: '1.7' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {children}
        </motion.p>
      ),
      ul: ({ node, children, ...props }) => (
        <motion.ul 
          style={{ ...template?.element_styles?.list, marginLeft: '1.5rem', marginBottom: '1rem' }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        >
          {children}
        </motion.ul>
      ),
      li: ({ node, children, ...props }) => (
        <motion.li 
          style={{ marginBottom: '0.5rem' }}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.li>
      ),
      a: ({ node, href, children, ...props }) => {
        if (href) {
          // Check if it's a YouTube link
          const videoId = extractVideoId(href);
          if (videoId) {
            console.log('Found YouTube link in <a> tag:', href);
            const iframe = `<iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            
            const style = {
              position: 'relative' as const,
              paddingBottom: '56.25%',
              height: 0,
              overflow: 'hidden' as const,
              maxWidth: '100%',
              margin: '2rem 0'
            };
            
            return <div style={style} dangerouslySetInnerHTML={{ __html: iframe }} />;
          }
        }

        // Regular link
        return (
          <motion.a 
            href={href}
            className="text-blue-600 hover:text-blue-800 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {children || href}
          </motion.a>
        );
      },
    };

    return (
      <motion.div 
        className="my-8 fade-in"
        style={{
          ...template?.element_styles?.main,
          backgroundColor: template?.styles?.mainBackground
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Add direct CSS from template */}
        {template?.css && (
          <style dangerouslySetInnerHTML={{ __html: template.css }} />
        )}
        
        {template?.opening_page_content && (
          <motion.div 
            className="prose prose-lg max-w-none mb-12"
            style={{
              ...template?.element_styles?.prose,
              backgroundColor: template?.styles?.contentBackground
            }}
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
              components={markdownComponents}
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
              style={{
                ...template?.element_styles?.prose,
                backgroundColor: template?.styles?.contentBackground
              }}
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
                components={markdownComponents}
              >
                {processContent(content)}
              </ReactMarkdown>
            </motion.div>
          ))
        ) : (
          <motion.div 
            className="prose prose-lg max-w-none"
            style={{
              ...template?.element_styles?.prose,
              backgroundColor: template?.styles?.contentBackground
            }}
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
              components={markdownComponents}
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
              components={markdownComponents}
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative w-12 h-12">
          <motion.div 
            className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
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