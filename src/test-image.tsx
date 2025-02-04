'use client';

import { ImageRenderer } from './app/results/page';

export default function TestImage() {
  const mockNode = {
    properties: {
      'data-original-styles': 'height: 50px'
    }
  };

  return (
    <div className="p-4">
      <h1>Test Image Renderer</h1>
      
      <div className="mt-4">
        <h2>With height=50px:</h2>
        <ImageRenderer 
          node={mockNode}
          src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/media/2d3eb391-a79b-4847-8d1b-17d18b2c58a4/778045b4-77a2-4b2c-9b8f-f2bd62de268d.png"
          alt=""
        />
      </div>

      <div className="mt-4">
        <h2>Default (responsive):</h2>
        <ImageRenderer 
          src="https://fdecrxcxrshebgrmbywz.supabase.co/storage/v1/object/public/storage/media/2d3eb391-a79b-4847-8d1b-17d18b2c58a4/778045b4-77a2-4b2c-9b8f-f2bd62de268d.png"
          alt=""
        />
      </div>
    </div>
  );
} 