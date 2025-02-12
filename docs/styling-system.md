# מערכת העיצוב

מסמך זה מתאר את מערכת העיצוב של התבניות ומאיפה מגיע כל חלק בעיצוב.

## טבלת Templates

### שדות עיצוב ישירים

- `css` - CSS ישיר שמוחל על כל העמוד. מוחל דרך תגית `<style>` בראש העמוד.

### element_styles - אובייקט סגנונות לפי אלמנט

אובייקט JSON המכיל סגנונות ספציפיים לכל אלמנט:

```typescript
{
  h1?: React.CSSProperties;  // עיצוב כותרות ראשיות
  h2?: React.CSSProperties;  // עיצוב כותרות משניות
  h3?: React.CSSProperties;  // עיצוב כותרות רמה 3
  h4?: React.CSSProperties;  // עיצוב כותרות רמה 4
  h5?: React.CSSProperties;  // עיצוב כותרות רמה 5
  h6?: React.CSSProperties;  // עיצוב כותרות רמה 6
  p?: React.CSSProperties;   // עיצוב פסקאות
  body?: React.CSSProperties; // עיצוב הגוף
  list?: React.CSSProperties; // עיצוב רשימות
  main?: React.CSSProperties; // עיצוב המיכל הראשי
  prose?: React.CSSProperties; // עיצוב בלוק טקסט
  header?: {                  // עיצוב הכותרת העליונה
    showLogo?: boolean;       // האם להציג לוגו
    logoWidth?: string;       // רוחב הלוגו
    logoHeight?: string;      // גובה הלוגו
    logoMargin?: string;      // שוליים ללוגו
    logoPosition?: string;    // מיקום הלוגו
  };
  specialParagraph?: React.CSSProperties; // עיצוב פסקאות מיוחדות
}
```

### styles - אובייקט צבעי רקע

אובייקט JSON המכיל הגדרות צבעי רקע:

```typescript
{
  bodyBackground?: string;    // צבע רקע לגוף העמוד
  mainBackground?: string;    // צבע רקע למיכל הראשי
  contentBackground?: string; // צבע רקע לתוכן
}
```

## סדר החלת העיצובים

1. קודם מוחל ה-CSS הישיר מעמודת `css`
2. אחר כך מוחלים הסגנונות מ-`element_styles` לפי סוג האלמנט
3. לבסוף מוחלים צבעי הרקע מ-`styles`

## דוגמה לשימוש

```typescript
// החלת CSS ישיר
{template?.css && (
  <style dangerouslySetInnerHTML={{ __html: template.css }} />
)}

// החלת סגנונות אלמנט
<h1 style={template?.element_styles?.h1}>כותרת</h1>

// החלת צבעי רקע
<div style={{ backgroundColor: template?.styles?.mainBackground }}>
  תוכן
</div>
```

## הערות חשובות

1. כל השדות הם אופציונליים
2. אם שדה חסר, יוחל העיצוב ברירת המחדל
3. ניתן לשלב CSS ישיר עם סגנונות אלמנטים
4. סגנונות האלמנטים מקבלים עדיפות על פני ה-CSS הישיר 