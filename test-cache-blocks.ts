import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set up Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Types
type MessageRole = "user" | "assistant";
type Message = {
  role: MessageRole;
  content: string;
};

type FormattedMessage = {
  role: MessageRole;
  content: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }>;
};

// Test function to simulate formatting messages with MAX_CACHE_BLOCKS limitation
function formatMessagesWithCacheLimit(messages: Message[], maxCacheBlocks: number = 4) {
  const formattedMessages: FormattedMessage[] = [];
  let cacheBlockCount = 0;

  if (messages.length === 0) {
    return formattedMessages;
  }

  // First message always cached
  formattedMessages.push({
    role: messages[0].role,
    content: [
      {
        type: "text",
        text: messages[0].content,
        ...(cacheBlockCount < maxCacheBlocks ? { cache_control: { type: "ephemeral" } } : {})
      }
    ]
  });
  
  if (cacheBlockCount < maxCacheBlocks) cacheBlockCount++;

  // Process remaining messages
  for (let i = 1; i < messages.length; i++) {
    formattedMessages.push({
      role: messages[i].role,
      content: [
        {
          type: "text",
          text: messages[i].content,
          ...(cacheBlockCount < maxCacheBlocks ? { cache_control: { type: "ephemeral" } } : {})
        }
      ]
    });
    
    if (cacheBlockCount < maxCacheBlocks) cacheBlockCount++;
  }

  return formattedMessages;
}

// Generate test messages
function generateTestMessages(count: number): Message[] {
  const messages: Message[] = [];

  for (let i = 0; i < count; i++) {
    const role: MessageRole = i % 2 === 0 ? "user" : "assistant";
    messages.push({
      role,
      content: `Test message ${i + 1}`
    });
  }

  return messages;
}

// Check how many cache_control blocks are in the formatted messages
function countCacheBlocks(formattedMessages: FormattedMessage[]): number {
  let count = 0;
  
  for (const message of formattedMessages) {
    for (const content of message.content) {
      if (content.cache_control) {
        count++;
      }
    }
  }
  
  return count;
}

// More realistic test case mimicking the actual implementation
function testActualImplementation() {
  console.log("\nTest 3: Testing actual implementation logic");
  
  // Create a more realistic message structure with multiple turns
  const messages: Message[] = [
    { role: "user", content: "Initial form data and first prompt" },
    { role: "assistant", content: "First response from Claude" },
    { role: "user", content: "Second prompt" },
    { role: "assistant", content: "Second response from Claude" },
    { role: "user", content: "Third prompt" },
    { role: "assistant", content: "Third response from Claude" },
    { role: "user", content: "Fourth prompt" },
    { role: "assistant", content: "Fourth response from Claude" },
    { role: "user", content: "Final prompt" },
  ];
  
  // Implementation similar to the actual claude.ts implementation
  const formattedMessages: FormattedMessage[] = [];
  let cacheBlockCount = 0;
  const MAX_CACHE_BLOCKS = 4;
  
  // First message always gets cache_control
  formattedMessages.push({
    role: messages[0].role,
    content: [{
      type: "text",
      text: messages[0].content,
      cache_control: { type: "ephemeral" }
    }]
  });
  cacheBlockCount++;
  
  // Middle messages in pairs (claude response + next prompt)
  for (let i = 1; i < messages.length - 2; i += 2) {
    if (messages[i] && messages[i + 1]) {
      // Claude response
      formattedMessages.push({
        role: messages[i].role,
        content: [{
          type: "text",
          text: messages[i].content,
          ...(cacheBlockCount < MAX_CACHE_BLOCKS ? { cache_control: { type: "ephemeral" } } : {})
        }]
      });
      if (cacheBlockCount < MAX_CACHE_BLOCKS) cacheBlockCount++;
      
      // Next user prompt
      formattedMessages.push({
        role: messages[i + 1].role,
        content: [{
          type: "text",
          text: messages[i + 1].content,
          ...(cacheBlockCount < MAX_CACHE_BLOCKS ? { cache_control: { type: "ephemeral" } } : {})
        }]
      });
      if (cacheBlockCount < MAX_CACHE_BLOCKS) cacheBlockCount++;
    }
  }
  
  // Add second to last message if it's from Claude
  if (messages.length > 2 && messages[messages.length - 2].role === "assistant") {
    formattedMessages.push({
      role: "assistant",
      content: [{
        type: "text",
        text: messages[messages.length - 2].content,
        ...(cacheBlockCount < MAX_CACHE_BLOCKS ? { cache_control: { type: "ephemeral" } } : {})
      }]
    });
    if (cacheBlockCount < MAX_CACHE_BLOCKS) cacheBlockCount++;
  }
  
  // Add final message
  formattedMessages.push({
    role: messages[messages.length - 1].role,
    content: [{
      type: "text",
      text: messages[messages.length - 1].content,
      ...(cacheBlockCount < MAX_CACHE_BLOCKS ? { cache_control: { type: "ephemeral" } } : {})
    }]
  });
  
  // Count cache blocks
  const cacheCount = countCacheBlocks(formattedMessages);
  
  console.log(`Number of messages: ${messages.length}`);
  console.log(`Number of formatted messages: ${formattedMessages.length}`);
  console.log(`Number of cache_control blocks: ${cacheCount}`);
  console.log(`Test result: ${cacheCount <= 4 ? "✅ PASS" : "❌ FAIL"}`);
  
  // Print which messages got cache_control
  console.log("Messages with cache_control:");
  formattedMessages.forEach((msg, index) => {
    const hasCache = msg.content[0].cache_control !== undefined;
    console.log(`  ${index + 1}. ${msg.role}: ${hasCache ? '✓ cached' : '✗ not cached'}`);
  });
  
  return formattedMessages;
}

// Main test function
async function runTest() {
  console.log("Starting cache_control blocks limit test");
  
  // Test 1: With exactly 4 messages
  const messages4 = generateTestMessages(4);
  const formatted4 = formatMessagesWithCacheLimit(messages4);
  const cacheCount4 = countCacheBlocks(formatted4);
  
  console.log(`\nTest 1: With ${messages4.length} messages`);
  console.log(`Number of cache_control blocks: ${cacheCount4}`);
  console.log(`Test result: ${cacheCount4 <= 4 ? "✅ PASS" : "❌ FAIL"}`);
  
  // Test 2: With 8 messages (should still have max 4 cache blocks)
  const messages8 = generateTestMessages(8);
  const formatted8 = formatMessagesWithCacheLimit(messages8);
  const cacheCount8 = countCacheBlocks(formatted8);
  
  console.log(`\nTest 2: With ${messages8.length} messages`);
  console.log(`Number of cache_control blocks: ${cacheCount8}`);
  console.log(`Test result: ${cacheCount8 <= 4 ? "✅ PASS" : "❌ FAIL"}`);
  
  // Test 3: With actual implementation logic
  const formattedActual = testActualImplementation();
  
  // Optional: Actually call Claude API with these messages (be careful with API costs!)
  const shouldCallApi = false; // Set to true to test with the actual API
  
  if (shouldCallApi && process.env.ANTHROPIC_API_KEY) {
    try {
      console.log("\nTesting with actual Claude API...");
      const response = await anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 100,
        messages: formattedActual as any,
        temperature: 0
      });
      
      console.log("API call successful!");
      console.log("Token usage:", response.usage);
    } catch (error) {
      console.error("API call failed:", error);
    }
  }
}

// Run the test
runTest().catch(console.error); 