import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Ensures output directories exist
 */
async function ensureDirectories() {
  const dirs = ['htmls', 'pdfs'].map(dir => path.join(process.cwd(), dir));
  await Promise.all(dirs.map(dir => fs.mkdir(dir, { recursive: true })));
}

/**
 * Saves HTML content to a file with timestamp
 * @param content HTML content to save
 * @returns The filename that was used
 */
export async function saveHtml(content: string): Promise<string> {
  await ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `page-${timestamp}.html`;
  const filepath = path.join(process.cwd(), 'htmls', filename);
  
  await fs.writeFile(filepath, content, 'utf-8');
  console.log(`Saved HTML file: ${filepath}`);
  return filename;
}

/**
 * Converts HTML file to PDF using wkhtmltopdf
 * @param htmlFilename The HTML file to convert (without path)
 * @returns The PDF filename that was created
 */
export async function convertToPdf(htmlFilename: string): Promise<string> {
  const pdfFilename = htmlFilename.replace('.html', '.pdf');
  const htmlPath = path.join(process.cwd(), 'htmls', htmlFilename);
  const pdfPath = path.join(process.cwd(), 'pdfs', pdfFilename);
  
  console.log(`Converting HTML to PDF:\n  Input: ${htmlPath}\n  Output: ${pdfPath}`);
  
  return new Promise((resolve, reject) => {
    exec(`wkhtmltopdf "${htmlPath}" "${pdfPath}"`, (error) => {
      if (error) {
        console.error('Error converting to PDF:', error);
        reject(error);
        return;
      }
      console.log('PDF conversion successful');
      resolve(pdfFilename);
    });
  });
}

/**
 * Processes HTML content - saves it and converts to PDF
 * @param html HTML content to process
 * @returns Object with HTML and PDF filenames
 */
export async function processHtmlContent(html: string) {
  const htmlFilename = `output-${Date.now()}.html`;
  const pdfFilename = htmlFilename.replace('.html', '.pdf');
  
  return { htmlFilename, pdfFilename };
} 