import { EssenceQualityCalculator } from './essence-calculator';

export interface BirthDateNumerologyRequest {
  form_data: Record<string, string>;
  transcription: string;
}

export interface BirthDateNumerologyResponse {
  form_data: Record<string, string>;
  transcription: string;
}

export async function calculateBirthDateNumerology(data: BirthDateNumerologyRequest): Promise<BirthDateNumerologyResponse> {
  const calculator = new EssenceQualityCalculator();
  const birthDate = data.form_data['birth_date'];
  
  if (!birthDate) {
    return data;
  }

  try {
    const { essence, quality } = calculator.calculate(birthDate);
    
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