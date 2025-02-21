import { EssenceQualityCalculator } from './essence-calculator';

export interface BirthDateNumerologyRequest {
  form_data: Record<string, string>;
  transcription: string;
}

export interface BirthDateNumerologyResponse {
  form_data: Record<string, string>;
  transcription: string;
}

/**
 * מחפש את שדה תאריך הלידה בטופס
 * מחפש לפי שמות שדה נפוצים ופורמט תאריך תקין
 */
function findBirthDateField(formData: Record<string, string>): string | null {
  // תבניות נפוצות לשמות שדה של תאריך לידה
  const dateFieldPatterns = [
    /^birth[_-]?date$/i,
    /^date[_-]?of[_-]?birth$/i,
    /^birth$/i,
    /^dob$/i,
    /^תאריך[_-]?לידה$/i,
    /^תאריך$/i,
    /^לידה$/i,
    /^תאריך_הלידה$/i,
    /^תאריך_לידתך$/i,
    /^מתי_נולדת$/i
  ];

  // פונקציה לבדיקה אם ערך נראה כמו תאריך תקין
  const isValidDateFormat = (value: string): boolean => {
    // בודק פורמט dd.mm.yyyy
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return true;
    
    // בודק פורמט dd/mm/yyyy
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return true;
    
    // בודק פורמט dd-mm-yyyy
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(value)) return true;

    return false;
  };

  // קודם מחפש לפי שמות שדה מדויקים
  for (const [key, value] of Object.entries(formData)) {
    for (const pattern of dateFieldPatterns) {
      if (pattern.test(key) && isValidDateFormat(value)) {
        return value;
      }
    }
  }

  // אם לא מצאנו, מחפש בשדה pretty אם קיים
  if (formData.pretty) {
    const prettyFields = formData.pretty.split(',').map(field => field.trim());
    for (const field of prettyFields) {
      const [label, value] = field.split(':').map(part => part.trim());
      if (label && value && 
          (label.includes('תאריך') || label.includes('לידה') || label.toLowerCase().includes('birth')) && 
          isValidDateFormat(value)) {
        return value;
      }
    }
  }

  // אם לא מצאנו כלום, מחפש כל שדה שנראה כמו תאריך
  for (const value of Object.values(formData)) {
    if (isValidDateFormat(value)) {
      return value;
    }
  }

  return null;
}

/**
 * ממיר פורמטים שונים של תאריך לפורמט dd.mm.yyyy
 */
function normalizeDate(dateStr: string): string {
  // מחליף / או - בנקודה
  return dateStr.replace(/[/-]/g, '.');
}

export async function calculateBirthDateNumerology(data: BirthDateNumerologyRequest): Promise<BirthDateNumerologyResponse> {
  const calculator = new EssenceQualityCalculator();
  const birthDate = findBirthDateField(data.form_data);
  
  if (!birthDate) {
    console.log('No birth date field found in form data');
    return data;
  }

  try {
    const normalizedDate = normalizeDate(birthDate);
    const { essence, quality } = calculator.calculate(normalizedDate);
    
    return {
      ...data,
      form_data: {
        ...data.form_data,
        essence_number: essence.number.toString(),
        essence_name: essence.name,
        quality_number: quality.number.toString(),
        quality_name: quality.name
      }
    };
  } catch (error) {
    console.error('Error calculating essence and quality numbers:', error);
    return data;
  }
} 