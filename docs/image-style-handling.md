# Image Style Handling in Markdown

## הבעיה
כשהשתמשנו בתחביר מיוחד בmarkdown להגדרת סגנון תמונה:
```markdown
![[height=50px]](image-url)
```

הסגנון לא נשמר בתצוגה הסופית. במקום זאת, התמונה הוצגה עם הסגנונות:
```html
<img src="image-url" data-original-styles="height: 50px" style="max-width: 100%; height: auto">
```

## תהליך מלא של טיפול בסגנונות תמונה

### 1. המרת Markdown ל-HTML (constants.ts)
```typescript
// 1. המשתמש כותב בmarkdown
![[height=50px]](image-url)

// 2. marked מפרסר את הmarkdown עם renderer מותאם
renderer.image = (href, title, text) => {
  // מחלץ פרמטרי סגנון מהטקסט
  const styleMatches = text.match(/\[([a-zA-Z-]+)=([^\]]+)\]/g);
  
  // מייצר מחרוזת סגנונות
  const styles = styleMatches.map(match => {
    const [prop, value] = match.match(/\[([a-zA-Z-]+)=([^\]]+)\]/);
    return `${prop}: ${value} !important`;
  });

  // מייצר את תגית התמונה עם data-original-styles
  return `<img src="${href}" data-original-styles="${styles.join('; ')}">`;
};
```

### 2. רינדור ב-React (page.tsx)
```typescript
// 1. ReactMarkdown מקבל את הHTML ומפעיל את ImageRenderer
<ReactMarkdown 
  rehypePlugins={[rehypeRaw]}
  components={{ img: ImageRenderer }}
>

// 2. ImageRenderer מקבל את הפרופס של התמונה
const ImageRenderer = ({ node, ...props }) => {
  // node.properties מכיל את כל האטריבוטים שהגיעו מהHTML
  // React ממיר אוטומטית data-* ל-camelCase
  const originalStyles = node?.properties?.dataOriginalStyles;
  
  if (originalStyles) {
    // המרה חזרה לאובייקט סגנונות של React
    const parsedStyles = Object.fromEntries(
      originalStyles.split(';')
        .map(s => {
          const [key, value] = s.split(':');
          const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
          return [camelKey, value.trim()];
        })
    );

    // הרכבת הסגנונות הסופיים עם סדר עדיפויות נכון
    return <img {...props} style={{
      maxWidth: '100%',
      height: 'auto',
      ...props.style,
      ...parsedStyles
    }} />;
  }
};
```

## נקודות חשובות לבדיקה בכל שלב

### בשלב הפרסור (constants.ts)
1. האם הregex מזהה נכון את כל פרמטרי הסגנון?
2. האם הסגנונות מומרים נכון למחרוזת?
3. האם ה-!important נוסף כשצריך?
4. האם data-original-styles מכיל את כל הסגנונות?

### בשלב הרינדור (page.tsx)
1. האם node.properties מכיל את כל האטריבוטים?
2. האם שמות האטריבוטים הומרו נכון ל-camelCase?
3. האם הפרסור של מחרוזת הסגנונות עובד נכון?
4. האם סדר העדיפויות בסגנונות נכון?

## דגשים נוספים
1. **המרות שמות:**
   - HTML: `data-original-styles`
   - React props: `dataOriginalStyles`
   - CSS: `kebab-case`
   - JavaScript: `camelCase`

2. **סדר עדיפויות סגנונות:**
   ```typescript
   const styles = {
     // 1. ברירות מחדל בסיסיות
     maxWidth: '100%',
     height: 'auto',
     
     // 2. סגנונות שהועברו כprops
     ...props.style,
     
     // 3. סגנונות מקוריים מהmarkdown
     ...parsedStyles
   };
   ```

3. **טיפול בערכים מיוחדים:**
   - הסרת !important בצד של React
   - טיפול בערכים עם רווחים
   - המרת יחידות מידה

## בדיקות מומלצות
1. תחביר markdown שונה:
   ```markdown
   ![alt [height=50px]](url)
   ![[height=50px]](url)
   ![alt](url)[height=50px]
   ```

2. סוגי סגנונות שונים:
   ```markdown
   ![[height=50px,width=100px]](url)
   ![[margin=10px 20px]](url)
   ![[object-fit=cover]](url)
   ```

3. קומבינציות של סגנונות:
   ```markdown
   ![[height=50px,max-width=100%]](url)
   ![[height=50px,width=auto]](url)
   ``` 