'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const getFormData = async () => {
      try {
        // Try to get POST data first
        const response = await fetch('/api/jotform-results', {
          method: 'POST',
          body: JSON.stringify(Object.fromEntries(searchParams.entries())),
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        const data = await response.json();
        if (data.success) {
          setResult(data.mockResult);
          setDebugData(data.formData);
        } else {
          setResult("שגיאה בעיבוד הטופס");
          setDebugData({ error: data.error });
        }
      } catch (error) {
        console.error('Error processing form data:', error);
        setResult("שגיאה בעיבוד הטופס");
        setDebugData({ error: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        setLoading(false);
      }
    };

    getFormData();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="container mx-auto p-8">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-4">תוצאות</h1>
        <div className="text-lg">{result}</div>
      </div>
      
      <div className="bg-gray-100 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">מידע מהטופס</h2>
        <pre className="bg-gray-800 text-white p-4 rounded overflow-auto" dir="ltr">
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </div>
    </div>
  );
} 