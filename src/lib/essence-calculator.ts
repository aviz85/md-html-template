export type Column = 'right' | 'left' | 'center';
export type QualityColumn = 'high' | 'middle' | 'low';
export type NumberName = 'אור הנשמה' | 'החוזה' | 'המנתח' | 'הנותן' | 'השופט' | 'יוצר השלום' | 'המרפא' | 'הסטודנט' | 'המאהב' | 'השלם';

export interface EssenceResult {
  number: number;
  name: NumberName;
  points: Record<Column, number>;
}

export interface QualityResult {
  number: number;
  name: NumberName;
  sums: Record<QualityColumn, number>;
}

export class EssenceQualityCalculator {
  // מיפוי מספרים לעמודות מותרות
  private readonly allowedPositions: Record<number, Column> = {
    1: 'center', // אמצע
    2: 'right',  // ימין
    3: 'left',   // שמאל
    4: 'right',  // ימין
    5: 'left',   // שמאל
    6: 'center', // אמצע
    7: 'right',  // ימין
    8: 'left',   // שמאל
    9: 'center', // אמצע
    0: 'center'  // אמצע
  };

  // ערכי הכפלה לכל מספר
  private readonly multiplicationValues: Record<number, Record<QualityColumn, number>> = {
    1: { high: 4, middle: 1, low: 1 },
    2: { high: 2, middle: 0, low: 3 },
    3: { high: 3, middle: 0, low: 2 },
    4: { high: 0, middle: 2, low: 3 },
    5: { high: 1, middle: 2, low: 3 },
    6: { high: 0, middle: 2, low: 3 },
    7: { high: 1, middle: 1, low: 1 },
    8: { high: 2, middle: 0, low: 2 },
    9: { high: 3, middle: 2, low: 1 },
    0: { high: 3, middle: 2, low: 3 }
  };

  // שמות המספרים
  private readonly numberNames: Record<number, NumberName> = {
    1: "אור הנשמה",
    2: "החוזה",
    3: "המנתח",
    4: "הנותן",
    5: "השופט",
    6: "יוצר השלום",
    7: "המרפא",
    8: "הסטודנט",
    9: "המאהב",
    0: "השלם"
  };

  // מיפוי עמודות למספרים
  private readonly columnToNumber: Record<Column, number> = {
    right: 4,  // ימין מייצג 4
    left: 3,   // שמאל מייצג 3
    center: 1  // מרכז מייצג 1
  };

  /**
   * הסרת אפסים מקדימים מתאריך
   * למשל: 01.01.1990 -> 1.1.1990
   */
  private removeLeadingZeros(dateStr: string): string {
    const parts = dateStr.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid date format. Expected dd.mm.yyyy');
    }
    
    // הסרת אפסים מקדימים מיום וחודש
    const day = parseInt(parts[0], 10).toString();
    const month = parseInt(parts[1], 10).toString();
    const year = parts[2];
    
    return `${day}.${month}.${year}`;
  }

  /**
   * המרת תאריך למערך של מספרים
   */
  private getNumbersFromDate(dateStr: string): number[] {
    // הסרת אפסים מקדימים קודם
    const normalizedDate = this.removeLeadingZeros(dateStr);
    
    // המרה למערך מספרים
    return normalizedDate
      .replace(/\D/g, '') // הסרת תווים שאינם מספרים
      .split('')
      .map(Number);
  }

  /**
   * ספירת הופעות של מספרים
   */
  private countNumbers(numbers: number[]): Record<number, number> {
    return numbers.reduce((counts, num) => {
      counts[num] = (counts[num] || 0) + 1;
      return counts;
    }, {} as Record<number, number>);
  }

  /**
   * חישוב מספר המהות
   */
  calculateEssence(dateStr: string): EssenceResult {
    const numbers = this.getNumbersFromDate(dateStr);
    const counts = this.countNumbers(numbers);
    
    // אתחול העמודות
    const columns: Record<Column, number> = {
      right: 0,
      left: 0,
      center: 0
    };
    
    // חישוב נקודות לכל עמודה
    for (const numStr in counts) {
      const num = parseInt(numStr, 10);
      const count = counts[num];
      const column = this.allowedPositions[num];
      columns[column] += count;
    }
    
    // מציאת העמודה עם מירב הנקודות
    const maxPoints = Math.max(...Object.values(columns));
    
    // מציאת העמודה המנצחת והמרה למספר מהות
    for (const column of ['right', 'left', 'center'] as Column[]) {
      if (columns[column] === maxPoints) {
        const essenceNumber = this.columnToNumber[column];
        return {
          number: essenceNumber,
          name: this.numberNames[essenceNumber],
          points: columns
        };
      }
    }
    
    // לא אמור להגיע לכאן
    throw new Error('Failed to calculate essence number');
  }

  /**
   * חישוב מספר האיכות
   */
  calculateQuality(dateStr: string): QualityResult {
    const numbers = this.getNumbersFromDate(dateStr);
    const counts = this.countNumbers(numbers);
    
    // אתחול העמודות
    const sums: Record<QualityColumn, number> = {
      high: 0,
      middle: 0,
      low: 0
    };
    
    // חישוב סכומים לכל עמודה
    for (const numStr in counts) {
      const num = parseInt(numStr, 10);
      const count = counts[num];
      const values = this.multiplicationValues[num];
      
      for (const column of ['high', 'middle', 'low'] as QualityColumn[]) {
        sums[column] += count * values[column];
      }
    }
    
    // מציאת הערך הנמוך ביותר
    const minSum = Math.min(...Object.values(sums));
    
    // אם התוצאה היא 10, היא שווה ערך ל-0
    const qualityNumber = minSum === 10 ? 0 : minSum;
    
    return {
      number: qualityNumber,
      name: this.numberNames[qualityNumber],
      sums
    };
  }

  /**
   * חישוב מספר המהות ומספר האיכות
   */
  calculate(dateStr: string): { essence: EssenceResult; quality: QualityResult } {
    return {
      essence: this.calculateEssence(dateStr),
      quality: this.calculateQuality(dateStr)
    };
  }
} 