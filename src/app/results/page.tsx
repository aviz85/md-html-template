'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ResultsPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Simulate API call with loading
    setTimeout(() => {
      setLoading(false);
      setResult("זוהי תוצאה לדוגמה מ-Claude API");
      // Convert searchParams to object for debug display
      const params = Object.fromEntries(searchParams.entries());
      setDebugData(params);
    }, 2000);
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <h1 className="text-2xl font-bold mb-4">תוצאות</h1>
        <div className="text-lg">{result}</div>
      </div>
      
      <div className="bg-gray-100 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Debug Data</h2>
        <pre className="bg-gray-800 text-white p-4 rounded overflow-auto">
          {JSON.stringify(debugData, null, 2)}
        </pre>
      </div>
    </div>
  );
} 