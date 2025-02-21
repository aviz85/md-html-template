import { EssenceQualityCalculator } from './lib/essence-calculator';

const calculator = new EssenceQualityCalculator();
const date = "1.1.1990";

console.log('\n=== Testing date:', date, '===\n');
const result = calculator.calculate(date);
console.log('\n=== Final Result ===');
console.log('Essence:', result.essence);
console.log('Quality:', result.quality); 