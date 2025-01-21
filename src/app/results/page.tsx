'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const formId = searchParams.get('formId');
  const submissionId = searchParams.get('submissionId');
  
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formId || !submissionId) {
      setError('Missing parameters');
      return;
    }

    const checkStatus = async () => {
      const { data, error } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('form_id', formId)
        .eq('submission_id', submissionId)
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

    // בדיקה ראשונית
    checkStatus();

    // polling כל 5 שניות
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [formId, submissionId]);

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <div className="bg-red-50 text-red-500 p-4 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="container mx-auto p-8">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-4">תוצאות</h1>
        
        {status === 'pending' && (
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p>מעבד את התוצאות, אנא המתן...</p>
          </div>
        )}

        {status === 'completed' && result && (
          <div className="prose max-w-none">
            <pre className="bg-gray-50 p-4 rounded overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 text-red-500 p-4 rounded">
            אירעה שגיאה בעיבוד התוצאות
          </div>
        )}
      </div>
    </div>
  );
} 