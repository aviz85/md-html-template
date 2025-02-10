interface Customer {
  name?: string;
  email?: string;
  phone?: string;
}

const testCases = [
  {
    name: 'פורמט pretty מלא',
    data: {
      pretty: 'שם מלא:אביץ מאיר, מגדר:זכר, אימייל:avizmaeir@gmail.com, מספר טלפון:(050) 397-3736'
    }
  },
  {
    name: 'פורמט שדות נפרדים',
    data: {
      'שם_מלא': 'ישראל ישראלי',
      'email': 'israel@gmail.com',
      'טלפון_נייד': '0501234567'
    }
  },
  {
    name: 'פורמט אנגלית',
    data: {
      'fullname': 'John Doe',
      'email': 'john@example.com',
      'phone': '(972) 50-1234567'
    }
  }
];

function findCustomerDetails(formData: Record<string, any>): Customer {
  const customer: Customer = {};

  // בדיקת שדה pretty
  if (formData.pretty && typeof formData.pretty === 'string') {
    const fields = formData.pretty.split(',').map((field: string) => field.trim());
    
    for (const field of fields) {
      const [key, ...rest] = field.split(':');
      const value = rest.join(':').trim();
      
      if (!key || !value) continue;

      const cleanKey = key.trim();
      console.log('Checking field:', { cleanKey, value });

      if (cleanKey === 'שם מלא') {
        customer.name = value;
        console.log('Found name:', value);
      }
      else if (cleanKey === 'אימייל') {
        customer.email = value;
        console.log('Found email:', value);
      }
      else if (cleanKey === 'מספר טלפון') {
        customer.phone = value.replace(/[^\d]/g, '');
        console.log('Found phone:', customer.phone);
      }
    }

    if (customer.name && customer.email && customer.phone) {
      if (customer.phone.startsWith('972')) {
        customer.phone = '0' + customer.phone.slice(3);
      }
      return customer;
    }
  }

  // Common field patterns
  const patterns = {
    name: [
      /^(name|fullname|full_name|שם|שם_מלא)$/i,
      /(^|_)(first|last)?name($|_)/i,
      /שם.*משפחה/i,
      /שם.*פרטי/i
    ],
    email: [
      /^(email|mail|אימייל|מייל)$/i,
      /(^|_)(email|mail)($|_)/i,
      /דואר.*אלקטרוני/i,
      /^JJ$/i
    ],
    phone: [
      /^(phone|mobile|tel|טלפון|נייד)$/i,
      /(^|_)(phone|mobile|tel)($|_)/i,
      /טלפון.*נייד/i,
      /מספר.*טלפון/i
    ]
  };

  // Helper functions
  const isFullName = (str: string): boolean => {
    const words = str.trim().split(/\s+/);
    return words.length >= 2 && words.every(word => /^[\u0590-\u05FFa-zA-Z]+$/.test(word));
  };

  const isPhoneNumber = (str: string): boolean => {
    return /^[\d\-+() ]{9,}$/.test(str.trim());
  };

  const isEmail = (str: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
  };

  // First pass: Find fields by patterns
  Object.entries(formData).forEach(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return;

    Object.entries(patterns).forEach(([field, fieldPatterns]) => {
      if (!customer[field as keyof Customer]) {
        const matches = fieldPatterns.some(pattern => pattern.test(key));
        if (matches) {
          if (field === 'email' && isEmail(value) ||
              field === 'phone' && isPhoneNumber(value) ||
              field === 'name' && isFullName(value)) {
            customer[field as keyof Customer] = value.trim();
            console.log(`Found ${field} by pattern:`, value.trim());
          }
        }
      }
    });
  });

  // Clean up phone number
  if (customer.phone) {
    customer.phone = customer.phone.replace(/[^\d+]/g, '');
    if (customer.phone.startsWith('972')) {
      customer.phone = '0' + customer.phone.slice(3);
    }
  }

  return customer;
}

// Run tests
console.log('\n=== Running Tests ===\n');

testCases.forEach((testCase, index) => {
  console.log(`\nTest Case ${index + 1}: ${testCase.name}`);
  console.log('Input:', testCase.data);
  const result = findCustomerDetails(testCase.data);
  console.log('Result:', result);
  console.log('---');
}); 