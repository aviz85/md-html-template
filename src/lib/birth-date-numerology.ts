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
function findBirthDateField(formData: Record<string, any>): string | null {
  console.log('🔍 Starting birth date field search in form data:', formData);

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

  console.log('📋 Checking against field patterns:', dateFieldPatterns.map(p => p.toString()));

  // Helper function to check if an object looks like a date object
  const isDateObject = (obj: any): boolean => {
    return obj && typeof obj === 'object' && 
           'day' in obj && 'month' in obj && 'year' in obj &&
           !isNaN(Number(obj.day)) && !isNaN(Number(obj.month)) && !isNaN(Number(obj.year));
  };

  // Helper function to convert date object to string
  const dateObjectToString = (obj: { day: string; month: string; year: string }): string => {
    // Handle both string and number inputs
    const day = String(obj.day).padStart(2, '0');
    const month = String(obj.month).padStart(2, '0');
    const year = String(obj.year);
    return `${day}.${month}.${year}`;
  };

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

  // First check: Look for date objects in any field
  console.log('🔎 Searching for date objects...');
  for (const [key, value] of Object.entries(formData)) {
    console.log(`  Checking field "${key}" for date object:`, value);
    if (isDateObject(value)) {
      const dateStr = dateObjectToString(value);
      console.log(`    ✅ Found date object in field "${key}": ${dateStr}`);
      return dateStr;
    }
  }

  // קודם מחפש לפי שמות שדה מדויקים
  console.log('🔎 Searching by exact field names...');
  for (const [key, value] of Object.entries(formData)) {
    console.log(`  Checking field "${key}" with value:`, value);
    
    // Check if it's a string date
    if (typeof value === 'string') {
      for (const pattern of dateFieldPatterns) {
        if (pattern.test(key)) {
          console.log(`    ✓ Field name matches pattern ${pattern}`);
          if (isValidDateFormat(value)) {
            console.log(`    ✅ Found valid date in field "${key}": ${value}`);
            return value;
          } else {
            console.log(`    ❌ Value is not in valid date format`);
          }
        }
      }
    }
    
    // Check if it's an object with a date
    else if (typeof value === 'object' && value !== null) {
      if (isDateObject(value)) {
        const dateStr = dateObjectToString(value);
        console.log(`    ✅ Found date object in field "${key}": ${dateStr}`);
        return dateStr;
      }
    }
  }

  // אם לא מצאנו, מחפש בשדה pretty אם קיים
  if (formData.pretty) {
    console.log('🔎 Searching in pretty field:', formData.pretty);
    const prettyFields = formData.pretty.split(',').map((field: string) => field.trim());
    for (const field of prettyFields) {
      const [label, value] = field.split(':').map((part: string) => part.trim());
      console.log(`  Checking pretty field "${label}" with value "${value}"`);
      if (label && value && 
          (label.includes('תאריך') || label.includes('לידה') || label.toLowerCase().includes('birth'))) {
        console.log(`    ✓ Label contains birth date keywords`);
        if (isValidDateFormat(value)) {
          console.log(`    ✅ Found valid date in pretty field "${label}": ${value}`);
          return value;
        } else {
          console.log(`    ❌ Value is not in valid date format`);
        }
      }
    }
  }

  // אם לא מצאנו כלום, מחפש כל שדה שנראה כמו תאריך
  console.log('🔎 Searching for any field with date format...');
  for (const [key, value] of Object.entries(formData)) {
    console.log(`  Checking field "${key}" with value:`, value);
    
    // Check string values
    if (typeof value === 'string' && isValidDateFormat(value)) {
      console.log(`    ✅ Found valid date format in field "${key}": ${value}`);
      return value;
    }
    
    // Check object values
    else if (typeof value === 'object' && value !== null) {
      if (isDateObject(value)) {
        const dateStr = dateObjectToString(value);
        console.log(`    ✅ Found date object in field "${key}": ${dateStr}`);
        return dateStr;
      }
    }
  }

  console.log('❌ No birth date field found in form data');
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